import { useLanguage } from "@/i18n";
import { ArrowRight } from "lucide-react";

const PersonalResults = () => {
    const { t } = useLanguage();

    // Check if the results key exists in translations to avoid runtime errors if types aren't perfectly synced yet
    // @ts-ignore
    const results = t.results || {
        title: "Resultado real (pessoal)",
        description: "Rodei a estratégia por ~2 meses e fechei +55% no período. Desempenho passado não garante resultados futuros; risco é alto.",
        cta: "Entrar no canal grátis no Telegram"
    };

    return (
        <section className="py-20 bg-card/20 border-y border-border/30">
            <div className="container mx-auto px-6 text-center">
                <div className="max-w-3xl mx-auto space-y-8">
                    <h2 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-white to-primary animate-pulse-glow">
                        {results.title}
                    </h2>

                    <p className="text-xl md:text-2xl text-foreground/90 font-medium leading-relaxed">
                        "{results.description}"
                    </p>

                    <div className="pt-4">
                        <a
                            href="https://t.me/EoS_Evilbot"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-primary group inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-lg"
                        >
                            {results.cta}
                            <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default PersonalResults;
