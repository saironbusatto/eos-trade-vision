import { useLanguage } from "@/i18n";

export function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();

    const toggleLanguage = () => {
        setLanguage(language === "pt-BR" ? "en" : "pt-BR");
    };

    return (
        <button
            onClick={toggleLanguage}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/50 bg-card/50 hover:bg-card hover:border-primary/30 transition-all duration-300"
            aria-label={language === "pt-BR" ? "Switch to English" : "Mudar para Português"}
            title={language === "pt-BR" ? "Switch to English" : "Mudar para Português"}
        >
            <span className="text-lg leading-none">
                {language === "pt-BR" ? "🇧🇷" : "🇬🇧"}
            </span>
            <span className="text-xs font-mono text-muted-foreground">
                {language === "pt-BR" ? "PT" : "EN"}
            </span>
        </button>
    );
}
