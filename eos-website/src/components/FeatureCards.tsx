import { useLanguage } from "@/i18n";

const FeatureCards = () => {
  const { t } = useLanguage();

  return (
    <section id="features" className="relative py-32 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/20 to-background" />

      <div className="container relative z-10 mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t.features.subtitle}
          </p>
        </div>

        {/* Cards Grid - 2 columns on medium, 4 on large */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {t.features.cards.map((feature, index) => {
            return (
              <div
                key={index}
                className="card-premium group p-8 flex flex-col h-full"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Content */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-foreground mb-1">
                    {feature.title}
                  </h3>
                  <span className="text-sm font-mono text-primary tracking-wide">
                    {feature.subtitle}
                  </span>
                </div>

                <p className="text-muted-foreground leading-relaxed mb-6 flex-grow">
                  {feature.description}
                </p>

                {/* Specs List */}
                <ul className="space-y-2 mt-auto">
                  {feature.specs.map((spec, specIndex) => (
                    <li
                      key={specIndex}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="font-mono">{spec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeatureCards;
