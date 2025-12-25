import { Github, Send, MessageCircle } from "lucide-react";

const Footer = () => {
  const socialLinks = [
    { icon: Github, href: "#", label: "GitHub" },
    { icon: Send, href: "#", label: "Telegram" },
    { icon: MessageCircle, href: "#", label: "Discord" },
  ];

  return (
    <footer className="relative border-t border-border/50 bg-card/30">
      <div className="container mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Brand */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-3">
              <div className="relative h-8 w-8">
                <div className="absolute inset-0 rounded-full bg-primary/20" />
                <div className="absolute inset-0.5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <span className="text-primary-foreground font-bold text-xs">E</span>
                </div>
              </div>
              <span className="font-bold text-foreground">EOS</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              A Product of s-iron.tech
            </span>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-4">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/50 transition-all duration-300"
                aria-label={social.label}
              >
                <social.icon className="w-5 h-5" />
              </a>
            ))}
          </div>

          {/* Legal */}
          <div className="flex flex-col items-center md:items-end gap-2">
            <div className="flex items-center gap-4 text-sm">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                Risk Disclosure
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </a>
            </div>
            <span className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} s-iron.tech. All rights reserved.
            </span>
          </div>
        </div>

        {/* Risk Warning */}
        <div className="mt-8 pt-8 border-t border-border/30">
          <p className="text-xs text-muted-foreground text-center max-w-3xl mx-auto leading-relaxed">
            <strong className="text-foreground/70">Risk Disclosure:</strong> Trading financial instruments carries a high level of risk and may not be suitable for all investors. 
            Past performance is not indicative of future results. EOS provides signals for informational purposes only and does not constitute financial advice. 
            You should carefully consider your investment objectives and risk tolerance before using algorithmic trading systems.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
