/**
 * ExitModelRecalibrationService — Fase 4
 * ========================================
 * Monitora o exit_decisions_log e retreina o LightGBM exit model
 * automaticamente conforme novos dados chegam.
 *
 * Fluxo:
 *   1. A cada CHECK_INTERVAL_MIN minutos verifica quantas ops fechadas há
 *      desde o último treino.
 *   2. Se novas_ops >= MIN_NEW_OPERATIONS → dispara trainExitModel.py
 *   3. Lê o CV F1 do modelo novo e compara com o baseline salvo.
 *   4. Se novo >= baseline - MAX_F1_DROP → aceita e substitui o pkl.
 *   5. Se não melhora → restaura backup e loga.
 *   6. Notifica no Telegram com as métricas do novo modelo.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { sqliteDatabase } from '../sqliteDatabase';
import { telegram } from '../telegram';

function envNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (raw == null) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

// ─── Settings keys em app_settings ──────────────────────────────────────────
const KEYS = {
    lastTrainCount:   'exit_model_last_train_count',   // n de ops quando treinou
    lastSuccessAt:    'exit_model_last_success_at',
    lastStatus:       'exit_model_last_status',
    baselineF1:       'exit_model_baseline_f1',
};

const EXIT_MODEL_FILES = ['exit_model.pkl', 'exit_metadata.json'];

export class ExitModelRecalibrationService {
    private readonly enabled           = envBool('EXIT_MODEL_RETRAIN_ENABLED', true);
    private readonly checkIntervalMin  = Math.max(5,  envNumber('EXIT_MODEL_RETRAIN_CHECK_MIN', 30));
    private readonly minNewOperations  = Math.max(10, envNumber('EXIT_MODEL_RETRAIN_MIN_NEW_OPS', 30));
    private readonly minAbsoluteOps    = Math.max(50, envNumber('EXIT_MODEL_RETRAIN_MIN_TOTAL_OPS', 300));
    private readonly maxF1Drop         = envNumber('EXIT_MODEL_RETRAIN_MAX_F1_DROP', 0.02);
    private readonly scriptTimeoutMs   = envNumber('EXIT_MODEL_RETRAIN_TIMEOUT_MS', 5 * 60 * 1000);
    private readonly pythonBin         = process.env.PYTHON_BIN ?? 'python3';

    private timer: NodeJS.Timeout | null = null;
    private running = false;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    start(): void {
        if (!this.enabled) {
            console.log('[ExitRetrain] Disabled (EXIT_MODEL_RETRAIN_ENABLED=false)');
            return;
        }
        if (this.timer) return;

        console.log(`[ExitRetrain] Service started (check every ${this.checkIntervalMin}min, trigger on +${this.minNewOperations} new ops)`);
        void this.tick();
        this.timer = setInterval(() => void this.tick(), this.checkIntervalMin * 60 * 1000);
    }

    stop(): void {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
    }

    // ── Tick ──────────────────────────────────────────────────────────────────

    private async tick(): Promise<void> {
        if (this.running) return;

        const totalOps = sqliteDatabase.getExitLogCount();
        const lastCount = Number(sqliteDatabase.getAppSetting(KEYS.lastTrainCount) ?? 0);
        const newOps    = totalOps - lastCount;

        if (totalOps < this.minAbsoluteOps) {
            console.log(`[ExitRetrain] Skip — total ops ${totalOps} < min ${this.minAbsoluteOps}`);
            return;
        }

        if (newOps < this.minNewOperations) {
            console.log(`[ExitRetrain] Skip — apenas ${newOps} novas ops desde último treino (min ${this.minNewOperations})`);
            return;
        }

        console.log(`[ExitRetrain] Triggering retrain — ${newOps} novas ops (total ${totalOps})`);
        await this.runRetrain(totalOps);
    }

    // ── Retrain ───────────────────────────────────────────────────────────────

    private async runRetrain(currentCount: number): Promise<void> {
        this.running = true;
        const startedAt = new Date().toISOString();

        const modelDir  = this.resolveModelDir();
        let backupDir: string | null = null;

        try {
            backupDir = await this.backupModels(modelDir);

            // Roda trainExitModel.py
            const mlDir = this.resolveMlDir();
            const env: NodeJS.ProcessEnv = {
                ...process.env,
                DATABASE_PATH: process.env.DATABASE_PATH ?? process.env.EOS_DB_PATH ?? '',
                ML_MODEL_DIR:  modelDir,
            };

            await this.runScript('trainExitModel.py', mlDir, env);

            // Lê métricas do novo modelo
            const newF1 = await this.readNewF1(modelDir);
            const baselineF1 = Number(sqliteDatabase.getAppSetting(KEYS.baselineF1) ?? 0);

            if (baselineF1 > 0 && newF1 < baselineF1 - this.maxF1Drop) {
                throw new Error(`Modelo rejeitado: F1 ${newF1.toFixed(4)} < baseline ${baselineF1.toFixed(4)} - ${this.maxF1Drop}`);
            }

            // Aceito — atualiza baseline e contador
            sqliteDatabase.setAppSetting(KEYS.baselineF1,    String(newF1));
            sqliteDatabase.setAppSetting(KEYS.lastTrainCount, String(currentCount));
            sqliteDatabase.setAppSetting(KEYS.lastSuccessAt,  new Date().toISOString());
            sqliteDatabase.setAppSetting(KEYS.lastStatus, JSON.stringify({
                status: 'success', started_at: startedAt, finished_at: new Date().toISOString(),
                new_f1: newF1, baseline_f1: baselineF1, total_ops: currentCount,
            }));

            console.log(`[ExitRetrain] Novo modelo aceito (F1=${newF1.toFixed(4)} | baseline=${baselineF1.toFixed(4)})`);

            await telegram.sendAlert({
                type:    'success',
                message: `*Exit Model retreinado com sucesso!*\n\n` +
                         `F1 (CV weighted): *${(newF1 * 100).toFixed(2)}%*\n` +
                         `Baseline anterior: ${baselineF1 > 0 ? (baselineF1 * 100).toFixed(2) + '%' : 'primeiro treino'}\n` +
                         `Operações usadas: *${currentCount}*\n\n` +
                         `_O modelo de saída foi atualizado automaticamente._`,
            });

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[ExitRetrain] Falhou: ${msg}`);

            // Restaura backup se modelos foram modificados
            if (backupDir) {
                try { await this.restoreModels(backupDir, modelDir); console.warn('[ExitRetrain] Backup restaurado.'); }
                catch (re) { console.error('[ExitRetrain] Falha ao restaurar backup:', re); }
            }

            sqliteDatabase.setAppSetting(KEYS.lastStatus, JSON.stringify({
                status: 'failed', started_at: startedAt, finished_at: new Date().toISOString(), error: msg,
            }));

            await telegram.sendAlert({
                type:    'warning',
                message: `*Exit Model: falha no retreino*\n\n${msg}\n\n_Modelo anterior mantido._`,
            });
        } finally {
            this.running = false;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private resolveMlDir(): string {
        const candidates = [
            process.env.ML_PIPELINE_DIR,
            path.resolve(process.cwd(), 'ml'),
            path.resolve(__dirname, '..', '..', 'ml'),
            '/app/ml',
        ].filter((v): v is string => Boolean(v));

        for (const c of candidates) { if (fs.existsSync(c)) return c; }
        throw new Error(`ML dir não encontrado. Verificados: ${candidates.join(', ')}`);
    }

    private resolveModelDir(): string {
        const candidates = [
            process.env.ML_MODEL_DIR,
            path.resolve(process.cwd(), 'data', 'ml', 'models'),
            path.resolve(__dirname, '..', '..', 'data', 'ml', 'models'),
            '/app/data/ml/models',
        ].filter((v): v is string => Boolean(v));

        for (const c of candidates) { if (fs.existsSync(c)) return c; }
        return candidates[0];
    }

    private async backupModels(modelDir: string): Promise<string | null> {
        await fs.promises.mkdir(modelDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(modelDir, 'backups', `exit-${ts}`);
        await fs.promises.mkdir(backupDir, { recursive: true });

        let copied = 0;
        for (const file of EXIT_MODEL_FILES) {
            const src = path.join(modelDir, file);
            if (!fs.existsSync(src)) continue;
            await fs.promises.copyFile(src, path.join(backupDir, file));
            copied++;
        }
        return copied > 0 ? backupDir : null;
    }

    private async restoreModels(backupDir: string, modelDir: string): Promise<void> {
        for (const file of EXIT_MODEL_FILES) {
            const src = path.join(backupDir, file);
            if (!fs.existsSync(src)) continue;
            await fs.promises.copyFile(src, path.join(modelDir, file));
        }
    }

    private async readNewF1(modelDir: string): Promise<number> {
        const metaPath = path.join(modelDir, 'exit_metadata.json');
        const raw = await fs.promises.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(raw) as { cv_f1_mean?: number };
        const f1 = Number(meta.cv_f1_mean);
        if (!Number.isFinite(f1)) throw new Error('cv_f1_mean inválido no exit_metadata.json');
        return f1;
    }

    private runScript(scriptName: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
        return new Promise((resolve, reject) => {
            const child = spawn(this.pythonBin, [scriptName], { cwd, env });
            let stderr = '';
            let stdout = '';
            let settled = false;

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                child.kill('SIGKILL');
                reject(new Error(`${scriptName} timeout após ${this.scriptTimeoutMs}ms`));
            }, this.scriptTimeoutMs);

            child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
            child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

            child.on('error', (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(err);
            });

            child.on('close', (code) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);

                // Imprime output do treino nos logs do bot
                if (stdout) process.stdout.write(`[ExitRetrain] ${scriptName}:\n${stdout}`);

                if (code !== 0) {
                    reject(new Error(`${scriptName} exit code ${code}: ${stderr || stdout}`));
                    return;
                }
                resolve();
            });
        });
    }
}

export const exitModelRecalibrationService = new ExitModelRecalibrationService();
