export const translations = {
    "pt-BR": {
        // Header
        nav: {
            features: "Recursos",
            specs: "Especificações",
            api: "API",
            docs: "Documentação",
            getStarted: "Começar",
        },

        // Hero Section
        hero: {
            badge: "GERAÇÃO DE SINAIS ALGORÍTMICOS",
            headline1: "Um Olho.",
            headline2: "Precisão Infinita.",
            description: "EOS processa o ruído do mercado com latência sub-milissegundo, entregando sinais de entrada e saída de alta fidelidade através do nosso motor algorítmico proprietário. Construído para traders que exigem precisão.",
            ctaPrimary: "Receba os sinais",
            ctaSecondary: "Ver Documentação",
            stat1Label: "Latência de Sinal",
            stat2Label: "SLA de Uptime",
            stat3Label: "Cobertura de Mercado",
        },

        // Features
        features: {
            title: "Arquitetura Técnica",
            subtitle: "Três pilares de engenharia de precisão potencializando suas decisões de trading.",
            cards: [
                {
                    title: "O Olho",
                    subtitle: "Análise de Fluxo de Ordens",
                    description: "Order Flow Analysis (OFA) em tempo real com microestrutura de mercado. Smart Money bias, Volume Profile, imbalances e absorção combinados num Q-Score unificado com filtro horário-direcional por IC95.",
                    specs: [
                        "OFA: Smart Money + Volume Profile",
                        "Filtro horário-direcional (Wilson IC95)",
                        "Q-Score: OFA + ML + Edge + Regime",
                    ],
                },
                {
                    title: "O Motor",
                    subtitle: "ML + LLM de Saída",
                    description: "Exit Decision Engine com três camadas: LightGBM decide a saída em tempo real (confiança ≥ 75%), GPT-4o-mini arbitra os casos ambíguos, e o modelo retreina automaticamente a cada 30 novas operações.",
                    specs: [
                        "LightGBM: EXIT/HOLD/MOVE_STOP",
                        "GPT-4o-mini como árbitro de segunda opinião",
                        "Auto-retreino contínuo com rollback",
                    ],
                },
                {
                    title: "O Ecossistema",
                    subtitle: "Stack s-iron.tech",
                    description: "Data Engine v2.1.1 com WebSocket persistente e buffer rolling de 60 minutos por símbolo. Recalibração automática dos modelos de entrada e saída com guardrails estatísticos e notificações em tempo real.",
                    specs: [
                        "WebSocket + buffer 60min (10 símbolos)",
                        "Recalibração automática com walk-forward",
                        "Notificações Telegram em tempo real",
                    ],
                },
            ],
        },

        // Footer
        footer: {
            brand: "Um Produto s-iron.tech",
            riskDisclosure: "Divulgação de Riscos",
            privacyPolicy: "Política de Privacidade",
            copyright: "Todos os direitos reservados.",
            riskWarning: "Negociar instrumentos financeiros envolve alto nível de risco e pode não ser adequado para todos os investidores. Desempenho passado não é indicativo de resultados futuros. EOS fornece sinais apenas para fins informativos e não constitui aconselhamento financeiro. Você deve considerar cuidadosamente seus objetivos de investimento e tolerância ao risco antes de usar sistemas de trading algorítmico.",
        },

        // Chat Widget
        chat: {
            title: "EOS Assistant",
            subtitle: "Powered by Gemini AI",
            welcome: "👋 Olá! Sou o EOS Assistant. Posso ajudar com informações sobre criptomoedas em tempo real.\n\nExperimente perguntar:\n• \"Qual o preço do Bitcoin?\"\n• \"Como está o Ethereum hoje?\"\n• \"Me fale sobre a Solana\"",
            placeholder: "Pergunte sobre qualquer cripto...",
            analyzing: "Analisando...",
            error: "❌ Erro ao processar sua mensagem. Tente novamente.",
        },
    },

    en: {
        // Header
        nav: {
            features: "Features",
            specs: "Technical Specs",
            api: "API",
            docs: "Documentation",
            getStarted: "Get Started",
        },

        // Hero Section
        hero: {
            badge: "ALGORITHMIC SIGNAL GENERATION",
            headline1: "One Eye.",
            headline2: "Infinite Precision.",
            description: "EOS processes market noise with sub-millisecond latency, delivering high-fidelity entry and exit signals through our proprietary algorithmic engine. Built for traders who demand precision.",
            ctaPrimary: "Get the signals",
            ctaSecondary: "View Documentation",
            stat1Label: "Signal Latency",
            stat2Label: "Uptime SLA",
            stat3Label: "Market Coverage",
        },

        // Features
        features: {
            title: "Technical Architecture",
            subtitle: "Three pillars of precision engineering powering your trading decisions.",
            cards: [
                {
                    title: "The Eye",
                    subtitle: "Order Flow Analysis",
                    description: "Real-time Order Flow Analysis (OFA) with market microstructure. Smart Money bias, Volume Profile, imbalances and absorption combined into a unified Q-Score with hourly-directional filtering via Wilson IC95.",
                    specs: [
                        "OFA: Smart Money + Volume Profile",
                        "Hourly-directional filter (Wilson IC95)",
                        "Q-Score: OFA + ML + Edge + Regime",
                    ],
                },
                {
                    title: "The Engine",
                    subtitle: "ML + LLM Exit Layer",
                    description: "Exit Decision Engine with three layers: LightGBM decides exits in real time (confidence ≥ 75%), GPT-4o-mini arbitrates ambiguous cases, and the model auto-retrains every 30 new closed operations.",
                    specs: [
                        "LightGBM: EXIT/HOLD/MOVE_STOP",
                        "GPT-4o-mini as second-opinion arbiter",
                        "Continuous auto-retrain with rollback",
                    ],
                },
                {
                    title: "The Ecosystem",
                    subtitle: "s-iron.tech Stack",
                    description: "Data Engine v2.1.1 with persistent WebSocket and 60-minute rolling buffer per symbol. Automatic recalibration of entry and exit models with statistical guardrails and real-time notifications.",
                    specs: [
                        "WebSocket + 60min buffer (10 symbols)",
                        "Auto-recalibration with walk-forward CV",
                        "Real-time Telegram notifications",
                    ],
                },
            ],
        },

        // Footer
        footer: {
            brand: "A Product of s-iron.tech",
            riskDisclosure: "Risk Disclosure",
            privacyPolicy: "Privacy Policy",
            copyright: "All rights reserved.",
            riskWarning: "Trading financial instruments carries a high level of risk and may not be suitable for all investors. Past performance is not indicative of future results. EOS provides signals for informational purposes only and does not constitute financial advice. You should carefully consider your investment objectives and risk tolerance before using algorithmic trading systems.",
        },

        // Chat Widget
        chat: {
            title: "EOS Assistant",
            subtitle: "Powered by Gemini AI",
            welcome: "👋 Hi! I'm EOS Assistant. I can help with real-time cryptocurrency information.\n\nTry asking:\n• \"What's the price of Bitcoin?\"\n• \"How is Ethereum doing today?\"\n• \"Tell me about Solana\"",
            placeholder: "Ask about any crypto...",
            analyzing: "Analyzing...",
            error: "❌ Error processing your message. Please try again.",
        },
    },
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = typeof translations["pt-BR"];
