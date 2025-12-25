import { Button } from "@/components/ui/button";
import { ArrowRight, Zap } from "lucide-react";

const HeroSection = () => {
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
            <span className="text-sm font-mono text-primary">ALGORITHMIC SIGNAL GENERATION</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-fade-in-delay-1">
            <span className="text-foreground">One Eye.</span>
            <br />
            <span className="text-gradient">Infinite Precision.</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-delay-2">
            EOS processes market noise with sub-millisecond latency, delivering 
            high-fidelity entry and exit signals through our proprietary algorithmic engine. 
            Built for traders who demand precision.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-delay-3">
            <Button variant="hero" size="xl" className="group">
              Connect to API
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button variant="heroOutline" size="xl">
              View Documentation
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 mt-16 pt-16 border-t border-border/30 animate-fade-in-delay-3">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-foreground font-mono">&lt;1ms</div>
              <div className="text-sm text-muted-foreground mt-1">Signal Latency</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-foreground font-mono">99.97%</div>
              <div className="text-sm text-muted-foreground mt-1">Uptime SLA</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-foreground font-mono">24/7</div>
              <div className="text-sm text-muted-foreground mt-1">Market Coverage</div>
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
