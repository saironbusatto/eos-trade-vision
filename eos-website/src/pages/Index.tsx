import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import FeatureCards from "@/components/FeatureCards";
import { OrderBookWidget } from "@/components/OrderBookWidget";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <FeatureCards />
        <OrderBookWidget />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
