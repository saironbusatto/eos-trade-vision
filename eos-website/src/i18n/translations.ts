export const translations = {
    "pt-BR": {
        // Header
        nav: {
            features: "Recursos",
            specs: "Especificações", // User removed this in previous turn, keeping removed or re-adding? User ignored it in this prompt but previous turn removed it. I will keep it removed based on general intent, but if I replace the whole block I should respect the previous state? The file view shows it present in the definitions but removed in the component. Actually checking the file view of Translations TS... it has "specs", "api", "docs". I should leave them here but they are unused in Header.tsx. Wait, the user said "No texto... mudar para..." implies modifying existing. I'll focus on the requested changes.
            // Actually, keep it consistent.
            api: "API",
            docs: "Documentação",
            getStarted: "Começar",
        },

        // Hero Section
        hero: {
            badge: "Sinais para iniciantes (com regra): entrada, stop e alvo.",
            headline1: "Um sinal.",
            headline2: "Um plano. Menos emoção.",
            description: "EOS filtra o ruído do mercado e entrega sinais objetivos: quando entrar, onde sair (stop) e onde realizar (alvo). Feito para iniciantes que querem operar com processo, não com achismo.",
            ctaPrimary: "Entrar no canal grátis no Telegram",
            ctaSub: "Grátis por enquanto. Sem cartão. Você sai quando quiser.", // New key for microcopy
            ctaSecondary: "Ver Documentação", // Not used explicitly in request but keeping safe

            // New Metric Values (formerly hardcoded)
            stat1Value: "Plano completo",
            stat1Label: "Entrada + Stop + Alvo",
            stat2Value: "Transparência",
            stat2Label: "Desempenho passado ≠ garantia",
            stat3Value: "Rotina",
            stat3Label: "Sinais + explicação rápida",
        },

        // Features
        features: {
            title: "Arquitetura Técnica V2", // Unused in UI
            subtitle: "Como o EOS encontra sinais (sem complicar).", // User didn't ask to change subtitle?? Wait. "No título... mudar para...". Did not specify subtitle change but the specific section "Quatro pilares..." -> "Como o EOS...". I assume title replaces the subtitle?
            // "No título 'Quatro pilares de engenharia...' mudar para: 'Como o EOS encontra sinais (sem complicar).'"
            // In the file, "Title" is "Arquitetura Técnica V2" and "Subtitle" is "Quatro pilares...".
            // The user request says: No título “Quatro pilares de engenharia... IA.” mudar para: “Como o EOS encontra sinais (sem complicar).”
            // Use implied logic: The visible big text is what they want changed. I will put the new text in proper place.
            cards: [
                {
                    title: "Notícias (filtradas) → impacto no preço.",
                    subtitle: "Sentimento IA", // Keeping original title as subtitle or just using what user gave? 
                    // Request: Pilar 1: “Sentimento IA” -> No título “Sentimento IA / Processamento LLM” mudar para: “Notícias (filtradas) → impacto no preço.”
                    description: "O bot filtra notícias e destaca o que tende a mexer com o mercado. Você recebe o sinal já com contexto curto (para aprender enquanto opera).",
                    specs: [
                        "Filtro de notícia",
                        "Score de impacto",
                        "Contexto em 1 linha",
                    ],
                },
                {
                    title: "Fluxo e liquidez (onde o mercado ‘puxa’).",
                    subtitle: "Motor OFA",
                    description: "O EOS procura confluências no fluxo (absorções e desequilíbrios) para evitar entradas aleatórias. Quando não há sinal claro, a melhor operação é não operar.",
                    specs: [
                        "Confluência de fluxo",
                        "Absorção",
                        "Desequilíbrio de volume",
                    ],
                },
                {
                    title: "Validação do sinal (só entra quando faz sentido).",
                    subtitle: "IA Gating",
                    description: "Cada sinal passa por validações estatísticas e técnicas. O objetivo é reduzir trade por impulso e manter consistência de processo.",
                    specs: [
                        "Validação estatística",
                        "Regras por janela de tempo",
                        "Execução (opcional)",
                    ],
                },
                {
                    title: "Treine sem risco (modo simulação).",
                    subtitle: "PaperWallet",
                    description: "Antes de colocar dinheiro, treine em simulação. Você aprende a executar entrada/stop/alvo sem pressão e entende taxas e slippage na prática.",
                    specs: [
                        "Taxas e slippage",
                        "PnL na simulação",
                        "Treino sem risco",
                    ],
                },
            ],
        },

        // Personal Results Section (New)
        results: {
            title: "Resultado real (pessoal)",
            description: "Rodei a estratégia por ~2 meses e fechei +55% no período. Desempenho passado não garante resultados futuros; risco é alto.",
            cta: "Entrar no canal grátis no Telegram",
        },

        // Order Book
        orderBook: {
            title: "Mercado ao vivo (referência)",
            helper: "O foco do canal é o sinal com plano (entrada/stop/alvo). O book aqui é apenas suporte visual.",
        },

        // Footer
        footer: {
            brand: "Um Produto s-iron.tech",
            riskDisclosure: "Aviso de Risco (leia antes de operar)", // Changed title
            privacyPolicy: "Política de Privacidade",
            copyright: "Todos os direitos reservados.",
            riskWarning: "Use apenas capital de risco e opere com gestão de risco. Negociar instrumentos financeiros envolve alto nível de risco e pode não ser adequado para todos os investidores. Desempenho passado não é indicativo de resultados futuros. EOS fornece sinais apenas para fins informativos e não constitui aconselhamento financeiro. Você deve considerar cuidadosamente seus objetivos de investimento e tolerância ao risco antes de usar sistemas de trading algorítmico.", // Added start text
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
            title: "Technical Architecture V2",
            subtitle: "Four pillars of high-fidelity engineering powering the AI-driven AutoTrader.",
            cards: [
                {
                    title: "AI Sentiment",
                    subtitle: "LLM Processing",
                    description: "Real-time news analysis via advanced OpenAI models. We filter B2B noise to identify real market impact before price reacts.",
                    specs: [
                        "GPT-4o Modeling",
                        "Impact Scoring (1-5)",
                        "B2B Relevance Filter",
                    ],
                },
                {
                    title: "OFA Engine",
                    subtitle: "Order Flow Analysis",
                    description: "Deep order flow analysis seeking confluence between Smart Money, Absorption, and Volume Imbalances for precise entries.",
                    specs: [
                        "Smart Money Delta",
                        "Absorption Detection",
                        "Volume Imbalance",
                    ],
                },
                {
                    title: "AI Gating",
                    subtitle: "ML Inference",
                    description: "Every signal is validated by Python Machine Learning models. The AutoTrader executes only when there's technical and statistical confluence.",
                    specs: [
                        "ML Model Validation",
                        "Time-Based Strategy",
                        "Automated Execution",
                    ],
                },
                {
                    title: "PaperWallet",
                    subtitle: "Risk Simulation",
                    description: "Test your strategies without real risk. Our virtual portfolio simulates fees, slippage, and dynamic PnL with institutional precision.",
                    specs: [
                        "Fee/Slippage Simulation",
                        "Real-time PnL Tracking",
                        "Zero-Risk Trading",
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
