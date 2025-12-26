import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { translations, type Language, type TranslationKey } from "./translations";

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: TranslationKey;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "eos-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(() => {
        // Check localStorage first
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved === "en" || saved === "pt-BR") {
                return saved;
            }
            // Detect browser language
            const browserLang = navigator.language;
            if (browserLang.startsWith("pt")) {
                return "pt-BR";
            }
        }
        return "pt-BR"; // Default to Portuguese
    });

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem(STORAGE_KEY, lang);
        // Update HTML lang attribute
        document.documentElement.lang = lang === "pt-BR" ? "pt-BR" : "en";
    };

    // Set initial HTML lang
    useEffect(() => {
        document.documentElement.lang = language === "pt-BR" ? "pt-BR" : "en";
    }, [language]);

    const value: LanguageContextType = {
        language,
        setLanguage,
        t: translations[language],
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error("useLanguage must be used within a LanguageProvider");
    }
    return context;
}
