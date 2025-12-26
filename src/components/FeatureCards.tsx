import { Eye, Cpu, Shield } from "lucide-react";

const features = [
  {
    icon: Eye,
    title: "O Olho",
    subtitle: "Vigilância de Mercado",
    description:
      "Varredura contínua em múltiplos timeframes com reconhecimento avançado de padrões. Nossos algoritmos proprietários de relação sinal-ruído filtram o caos do mercado em inteligência acionável.",
    specs: [
      "Análise multi-timeframe",
      "Motor de reconhecimento de padrões",
      "Detecção de sinais em tempo real",
    ],
  },
  {
    icon: Cpu,
    title: "O Motor",
    subtitle: "Núcleo de Execução",
    description:
      "Infraestrutura de baixa latência projetada para confiabilidade. Propagação de sinais sub-milissegundo garante que você receba pontos de entrada e saída antes que as condições de mercado mudem.",
    specs: [
      "Latência sub-milissegundo",
      "Infraestrutura redundante",
      "Garantia de 99.97% uptime",
    ],
  },
  {
    icon: Shield,
    title: "O Ecossistema",
    subtitle: "Stack s-iron.tech",
    description:
      "Integrado perfeitamente na infraestrutura s-iron.tech. Segurança de nível empresarial, comunicações criptografadas e acesso completo à API para implementações personalizadas.",
    specs: [
      "Criptografia ponta a ponta",
      "APIs RESTful & WebSocket",
      "Suporte a webhooks customizados",
    ],
  },
];

const FeatureCards = () => {
  return (
    <section id="features" className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/20 to-background" />

      <div className="container relative z-10 mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4">
            Arquitetura Técnica
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Três pilares de engenharia de precisão potencializando suas decisões de trading.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 transition-all duration-500 hover:border-primary/50 hover:bg-card"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Icon */}
              <div className="relative w-14 h-14 mb-6">
                <div className="absolute inset-0 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors duration-300" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <feature.icon className="w-7 h-7 text-primary" />
                </div>
              </div>

              {/* Content */}
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-foreground mb-1">
                  {feature.title}
                </h3>
                <span className="text-sm font-mono text-primary tracking-wide">
                  {feature.subtitle}
                </span>
              </div>

              <p className="text-muted-foreground leading-relaxed mb-6">
                {feature.description}
              </p>

              {/* Specs List */}
              <ul className="space-y-2">
                {feature.specs.map((spec) => (
                  <li
                    key={spec}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span className="font-mono">{spec}</span>
                  </li>
                ))}
              </ul>

              {/* Hover Glow Effect */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeatureCards;
