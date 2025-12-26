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
            ctaPrimary: "Conectar à API",
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
                    subtitle: "Vigilância de Mercado",
                    description: "Varredura contínua em múltiplos timeframes com reconhecimento avançado de padrões. Nossos algoritmos proprietários de relação sinal-ruído filtram o caos do mercado em inteligência acionável.",
                    specs: [
                        "Análise multi-timeframe",
                        "Motor de reconhecimento de padrões",
                        "Detecção de sinais em tempo real",
                    ],
                },
                {
                    title: "O Motor",
                    subtitle: "Núcleo de Execução",
                    description: "Infraestrutura de baixa latência projetada para confiabilidade. Propagação de sinais sub-milissegundo garante que você receba pontos de entrada e saída antes que as condições de mercado mudem.",
                    specs: [
                        "Latência sub-milissegundo",
                        "Infraestrutura redundante",
                        "Garantia de 99.97% uptime",
                    ],
                },
                {
                    title: "O Ecossistema",
                    subtitle: "Stack s-iron.tech",
                    description: "Integrado perfeitamente na infraestrutura s-iron.tech. Segurança de nível empresarial, comunicações criptografadas e acesso completo à API para implementações personalizadas.",
                    specs: [
                        "Criptografia ponta a ponta",
                        "APIs RESTful & WebSocket",
                        "Suporte a webhooks customizados",
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
            ctaPrimary: "Connect to API",
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
                    subtitle: "Market Surveillance",
                    description: "Continuous scanning across multiple timeframes with advanced pattern recognition. Our proprietary signal-to-noise ratio algorithms filter market chaos into actionable intelligence.",
                    specs: [
                        "Multi-timeframe analysis",
                        "Pattern recognition engine",
                        "Real-time signal detection",
                    ],
                },
                {
                    title: "The Engine",
                    subtitle: "Execution Core",
                    description: "Low-latency infrastructure engineered for reliability. Sub-millisecond signal propagation ensures you receive entry and exit points before market conditions shift.",
                    specs: [
                        "Sub-millisecond latency",
                        "Redundant infrastructure",
                        "99.97% uptime guarantee",
                    ],
                },
                {
                    title: "The Ecosystem",
                    subtitle: "s-iron.tech Stack",
                    description: "Seamlessly integrated within the s-iron.tech infrastructure. Enterprise-grade security, encrypted communications, and full API access for custom implementations.",
                    specs: [
                        "End-to-end encryption",
                        "RESTful & WebSocket APIs",
                        "Custom webhook support",
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
