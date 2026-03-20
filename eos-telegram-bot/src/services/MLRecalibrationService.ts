import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { sqliteDatabase } from "../sqliteDatabase";

function envNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (raw == null) return fallback;
    return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

const REQUIRED_MODEL_FILES = [
    "direction_model.pkl",
    "direction_metadata.json",
    "gate_model.pkl",
    "gate_metadata.json",
];

const SETTINGS_KEYS = {
    lastRunAt: "ml_recalibration_last_run_at",
    lastSuccessAt: "ml_recalibration_last_success_at",
    lastStatus: "ml_recalibration_last_status",
    baselineMetrics: "ml_recalibration_baseline_metrics",
};

interface TrainingMetrics {
    trained_at: string;
    gate_test_f1: number;
    gate_test_precision: number;
    gate_test_coverage: number;
    direction_test_f1_macro: number;
    direction_test_accuracy: number;
    direction_walk_forward_f1_macro: number | null;
}

interface AcceptanceResult {
    accepted: boolean;
    reasons: string[];
}

interface ScriptResult {
    script: string;
    elapsed_ms: number;
}

export class MLRecalibrationService {
    private readonly enabled = envBool("ML_RECALIBRATION_ENABLED", true);
    private readonly intervalHours = Math.max(1, envNumber("ML_RECALIBRATION_INTERVAL_HOURS", 168));
    private readonly checkIntervalMinutes = Math.max(1, envNumber("ML_RECALIBRATION_CHECK_INTERVAL_MIN", 15));
    private readonly minRecords = Math.max(50, envNumber("ML_RECALIBRATION_MIN_ML_RECORDS", 400));
    private readonly minGateF1 = envNumber("ML_RECALIBRATION_MIN_GATE_F1", 0.45);
    private readonly minDirectionF1 = envNumber("ML_RECALIBRATION_MIN_DIRECTION_F1", 0.30);
    private readonly maxF1Drop = Math.max(0, envNumber("ML_RECALIBRATION_MAX_F1_DROP", 0.03));
    private readonly scriptTimeoutMs = Math.max(60_000, envNumber("ML_RECALIBRATION_SCRIPT_TIMEOUT_MS", 45 * 60 * 1000));
    private readonly pythonBin = process.env.PYTHON_BIN || "python3";

    private timer: NodeJS.Timeout | null = null;
    private running = false;

    start(): void {
        if (!this.enabled) {
            console.log("[ML Recalibration] Disabled via ML_RECALIBRATION_ENABLED=false");
            return;
        }

        if (this.timer) {
            return;
        }

        console.log(
            `[ML Recalibration] Service started (interval=${this.intervalHours}h, minRecords=${this.minRecords})`
        );

        void this.tick("startup");
        this.timer = setInterval(() => {
            void this.tick("interval");
        }, this.checkIntervalMinutes * 60 * 1000);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private shouldRunNow(nowMs: number): boolean {
        const forceNow = envBool("ML_RECALIBRATION_FORCE_NOW", false);
        if (forceNow) return true;

        const lastSuccessAt = sqliteDatabase.getAppSetting(SETTINGS_KEYS.lastSuccessAt);
        if (!lastSuccessAt) return true;

        const lastMs = new Date(lastSuccessAt).getTime();
        if (!Number.isFinite(lastMs)) return true;

        const intervalMs = this.intervalHours * 60 * 60 * 1000;
        return nowMs - lastMs >= intervalMs;
    }

    private async tick(trigger: "startup" | "interval"): Promise<void> {
        if (this.running) {
            return;
        }

        const nowMs = Date.now();
        if (!this.shouldRunNow(nowMs)) {
            return;
        }

        await this.runRecalibration(trigger);
    }

    private async runRecalibration(trigger: "startup" | "interval"): Promise<void> {
        this.running = true;
        const startedAt = new Date().toISOString();
        sqliteDatabase.setAppSetting(SETTINGS_KEYS.lastRunAt, startedAt);

        let backupDir: string | null = null;
        let modelsPotentiallyChanged = false;

        try {
            const recordCount = sqliteDatabase.getMLRecordCount();

            if (recordCount < this.minRecords) {
                const status = {
                    status: "skipped_insufficient_data",
                    trigger,
                    started_at: startedAt,
                    finished_at: new Date().toISOString(),
                    record_count: recordCount,
                    min_required: this.minRecords,
                };
                sqliteDatabase.setAppSetting(SETTINGS_KEYS.lastStatus, JSON.stringify(status));
                console.log(
                    `[ML Recalibration] Skipped: ${recordCount} registros (mínimo ${this.minRecords})`
                );
                return;
            }

            const mlDir = this.resolveMlDir();
            const modelDir = this.resolveModelDir(mlDir);
            const trainingEnv = this.buildTrainingEnv(modelDir);

            backupDir = await this.backupModels(modelDir);

            const scripts = ["build_dataset.py", "train_gate.py", "train_direction.py"];
            const execution: ScriptResult[] = [];

            for (const script of scripts) {
                const result = await this.runScript(script, mlDir, trainingEnv);
                execution.push(result);
                modelsPotentiallyChanged = true;
            }

            const metrics = await this.readMetrics(modelDir);
            const acceptance = this.evaluateCandidate(metrics);

            if (!acceptance.accepted) {
                throw new Error(`Candidate rejected: ${acceptance.reasons.join(" | ")}`);
            }

            sqliteDatabase.setAppSetting(SETTINGS_KEYS.baselineMetrics, JSON.stringify(metrics));
            sqliteDatabase.setAppSetting(SETTINGS_KEYS.lastSuccessAt, new Date().toISOString());

            const status = {
                status: "success",
                trigger,
                started_at: startedAt,
                finished_at: new Date().toISOString(),
                metrics,
                execution,
            };
            sqliteDatabase.setAppSetting(SETTINGS_KEYS.lastStatus, JSON.stringify(status));

            console.log(
                `[ML Recalibration] Success | gate_f1=${metrics.gate_test_f1.toFixed(3)} direction_f1=${metrics.direction_test_f1_macro.toFixed(3)}`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            if (modelsPotentiallyChanged && backupDir) {
                try {
                    const modelDir = this.resolveModelDir(this.resolveMlDir());
                    await this.restoreModels(backupDir, modelDir);
                    console.warn("[ML Recalibration] Models restored from backup after failure");
                } catch (restoreError) {
                    const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError);
                    console.error(`[ML Recalibration] Failed to restore backup: ${restoreMessage}`);
                }
            }

            const status = {
                status: "failed",
                trigger,
                started_at: startedAt,
                finished_at: new Date().toISOString(),
                error: message,
            };
            sqliteDatabase.setAppSetting(SETTINGS_KEYS.lastStatus, JSON.stringify(status));
            console.error(`[ML Recalibration] Failed: ${message}`);
        } finally {
            this.running = false;
        }
    }

    private resolveMlDir(): string {
        const candidates = [
            process.env.ML_PIPELINE_DIR,
            "/app/ml",
            path.resolve(process.cwd(), "ml"),
            path.resolve(__dirname, "..", "..", "ml"),
        ].filter((value): value is string => Boolean(value));

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        throw new Error(`ML pipeline directory not found. Checked: ${candidates.join(", ")}`);
    }

    private resolveModelDir(mlDir: string): string {
        const candidates = [
            process.env.ML_MODEL_DIR,
            path.resolve(mlDir, "..", "data", "ml", "models"),
            "/app/data/ml/models",
        ].filter((value): value is string => Boolean(value));

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }

        return candidates[0];
    }

    private buildTrainingEnv(modelDir: string): NodeJS.ProcessEnv {
        const outputDir = path.resolve(modelDir, "..");
        const databasePath = process.env.EOS_DB_PATH || process.env.DATABASE_PATH;

        return {
            ...process.env,
            EOS_DB_PATH: databasePath,
            ML_OUTPUT_DIR: process.env.ML_OUTPUT_DIR || outputDir,
            ML_MODEL_DIR: modelDir,
        };
    }

    private async runScript(scriptName: string, cwd: string, env: NodeJS.ProcessEnv): Promise<ScriptResult> {
        const started = Date.now();

        await new Promise<void>((resolve, reject) => {
            const child = spawn(this.pythonBin, [scriptName], { cwd, env });
            let stdoutTail = "";
            let stderrTail = "";
            let settled = false;

            const appendTail = (current: string, chunk: string): string => {
                const next = (current + chunk).slice(-4000);
                return next;
            };

            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                child.kill("SIGKILL");
                reject(new Error(`${scriptName} timed out after ${this.scriptTimeoutMs}ms`));
            }, this.scriptTimeoutMs);

            child.stdout.on("data", (data) => {
                stdoutTail = appendTail(stdoutTail, data.toString());
            });

            child.stderr.on("data", (data) => {
                stderrTail = appendTail(stderrTail, data.toString());
            });

            child.on("error", (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                reject(err);
            });

            child.on("close", (code) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);

                if (code !== 0) {
                    reject(new Error(`${scriptName} exited with code ${code}: ${stderrTail || stdoutTail}`));
                    return;
                }

                console.log(
                    `[ML Recalibration] ${scriptName} completed in ${(Date.now() - started)}ms`
                );
                resolve();
            });
        });

        return {
            script: scriptName,
            elapsed_ms: Date.now() - started,
        };
    }

    private async backupModels(modelDir: string): Promise<string | null> {
        await fs.promises.mkdir(modelDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupDir = path.join(modelDir, "backups", `run-${timestamp}`);
        await fs.promises.mkdir(backupDir, { recursive: true });

        let copied = 0;
        for (const file of REQUIRED_MODEL_FILES) {
            const source = path.join(modelDir, file);
            const target = path.join(backupDir, file);
            if (!fs.existsSync(source)) continue;
            await fs.promises.copyFile(source, target);
            copied += 1;
        }

        if (copied === 0) {
            return null;
        }

        return backupDir;
    }

    private async restoreModels(backupDir: string, modelDir: string): Promise<void> {
        await fs.promises.mkdir(modelDir, { recursive: true });

        for (const file of REQUIRED_MODEL_FILES) {
            const source = path.join(backupDir, file);
            const target = path.join(modelDir, file);
            if (!fs.existsSync(source)) continue;
            await fs.promises.copyFile(source, target);
        }
    }

    private async readMetrics(modelDir: string): Promise<TrainingMetrics> {
        const [gateMetadataRaw, directionMetadataRaw] = await Promise.all([
            fs.promises.readFile(path.join(modelDir, "gate_metadata.json"), "utf-8"),
            fs.promises.readFile(path.join(modelDir, "direction_metadata.json"), "utf-8"),
        ]);

        const gateMetadata = JSON.parse(gateMetadataRaw);
        const directionMetadata = JSON.parse(directionMetadataRaw);

        const gateTest = gateMetadata?.metrics?.test ?? {};
        const directionTest = directionMetadata?.metrics?.test ?? {};
        const walkForward = directionMetadata?.metrics?.walk_forward;

        const wfF1Scores = Array.isArray(walkForward)
            ? walkForward
                .map((row: any) => Number(row?.f1_macro))
                .filter((v: number) => Number.isFinite(v))
            : [];

        const wfAvg = wfF1Scores.length > 0
            ? wfF1Scores.reduce((sum: number, cur: number) => sum + cur, 0) / wfF1Scores.length
            : null;

        const metrics: TrainingMetrics = {
            trained_at: new Date().toISOString(),
            gate_test_f1: Number(gateTest?.f1 ?? Number.NaN),
            gate_test_precision: Number(gateTest?.precision ?? Number.NaN),
            gate_test_coverage: Number(gateTest?.coverage ?? Number.NaN),
            direction_test_f1_macro: Number(directionTest?.f1_macro ?? Number.NaN),
            direction_test_accuracy: Number(directionTest?.accuracy ?? Number.NaN),
            direction_walk_forward_f1_macro: wfAvg,
        };

        const numericToCheck = [
            metrics.gate_test_f1,
            metrics.gate_test_precision,
            metrics.direction_test_f1_macro,
            metrics.direction_test_accuracy,
        ];

        if (numericToCheck.some((value) => !Number.isFinite(value))) {
            throw new Error("Training metrics are invalid or missing in metadata files");
        }

        return metrics;
    }

    private evaluateCandidate(candidate: TrainingMetrics): AcceptanceResult {
        const reasons: string[] = [];

        if (candidate.gate_test_f1 < this.minGateF1) {
            reasons.push(`gate_test_f1 ${candidate.gate_test_f1.toFixed(3)} < min ${this.minGateF1.toFixed(3)}`);
        }

        if (candidate.direction_test_f1_macro < this.minDirectionF1) {
            reasons.push(
                `direction_test_f1_macro ${candidate.direction_test_f1_macro.toFixed(3)} < min ${this.minDirectionF1.toFixed(3)}`
            );
        }

        const baselineRaw = sqliteDatabase.getAppSetting(SETTINGS_KEYS.baselineMetrics);
        if (baselineRaw) {
            try {
                const baseline = JSON.parse(baselineRaw) as Partial<TrainingMetrics>;

                if (
                    Number.isFinite(baseline.gate_test_f1) &&
                    candidate.gate_test_f1 + this.maxF1Drop < Number(baseline.gate_test_f1)
                ) {
                    reasons.push(
                        `gate_test_f1 drop above limit: ${candidate.gate_test_f1.toFixed(3)} vs baseline ${Number(baseline.gate_test_f1).toFixed(3)}`
                    );
                }

                if (
                    Number.isFinite(baseline.direction_test_f1_macro) &&
                    candidate.direction_test_f1_macro + this.maxF1Drop < Number(baseline.direction_test_f1_macro)
                ) {
                    reasons.push(
                        `direction_test_f1_macro drop above limit: ${candidate.direction_test_f1_macro.toFixed(3)} vs baseline ${Number(baseline.direction_test_f1_macro).toFixed(3)}`
                    );
                }

                if (
                    baseline.direction_walk_forward_f1_macro != null &&
                    candidate.direction_walk_forward_f1_macro != null &&
                    candidate.direction_walk_forward_f1_macro + this.maxF1Drop < Number(baseline.direction_walk_forward_f1_macro)
                ) {
                    reasons.push(
                        `walk_forward_f1 drop above limit: ${candidate.direction_walk_forward_f1_macro.toFixed(3)} vs baseline ${Number(baseline.direction_walk_forward_f1_macro).toFixed(3)}`
                    );
                }
            } catch {
                reasons.push("invalid baseline metrics JSON in app_settings");
            }
        }

        return {
            accepted: reasons.length === 0,
            reasons,
        };
    }
}

export const mlRecalibrationService = new MLRecalibrationService();
