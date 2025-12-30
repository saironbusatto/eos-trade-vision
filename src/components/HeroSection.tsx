import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";
import { useLanguage } from "@/i18n";

const HeroSection = () => {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-radial-glow opacity-60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary/5 blur-3xl animate-pulse-glow" />

      {/* Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
                           linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '100px 100px'
        }}
      />

      {/* Eye of Sauron Visualization */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative w-[500px] h-[500px] md:w-[700px] md:h-[700px]">
          {/* Outer Ring */}
          <div className="absolute inset-0 rounded-full border border-primary/20 animate-spin" style={{ animationDuration: '60s' }} />
          <div className="absolute inset-8 rounded-full border border-primary/15 animate-spin" style={{ animationDuration: '45s', animationDirection: 'reverse' }} />
          <div className="absolute inset-16 rounded-full border border-primary/10 animate-spin" style={{ animationDuration: '30s' }} />

          {/* Core Glow */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-32 md:w-32 md:h-44 rounded-[50%] bg-gradient-to-b from-primary via-accent to-primary/50 opacity-40 blur-xl animate-pulse-glow" />
          </div>

          {/* Slit */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-2 h-20 md:w-3 md:h-28 bg-gradient-to-b from-transparent via-foreground to-transparent rounded-full animate-scan" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container relative z-10 mx-auto px-6 text-center">
        <div className="max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 mb-8 animate-fade-in">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono text-primary">{t.hero.badge}</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-fade-in-delay-1">
            <span className="text-foreground">{t.hero.headline1}</span>
            <br />
            <span className="text-gradient">{t.hero.headline2}</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-lg md:text-xl text-white max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-delay-2">
            {t.hero.description}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-delay-3">
            <a
              href="https://t.me/SEU_LINK_DO_CANAL"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary group inline-flex items-center justify-center px-8 py-6 rounded-lg font-bold text-lg"
            >
              {t.hero.ctaPrimary}
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>

          {/* Stats - Redesigned Metrics */}
          <div className="grid grid-cols-3 gap-8 mt-16 pt-16 border-t border-border/30 animate-fade-in-delay-3">
            <div className="metric-box text-center md:text-left">
              <div className="metric-value">&lt;1ms</div>
              <div className="metric-label">{t.hero.stat1Label}</div>
            </div>
            <div className="metric-box text-center md:text-left">
              <div className="metric-value">99.97%</div>
              <div className="metric-label">{t.hero.stat2Label}</div>
            </div>
            <div className="metric-box text-center md:text-left">
              <div className="metric-value">24/7</div>
              <div className="metric-label">{t.hero.stat3Label}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Gradient Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default HeroSection;
