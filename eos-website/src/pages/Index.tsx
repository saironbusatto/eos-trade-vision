import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import FeatureCards from "@/components/FeatureCards";
import PersonalResults from "@/components/PersonalResults";
import { OrderBookWidget } from "@/components/OrderBookWidget";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <FeatureCards />
        <PersonalResults />
        <OrderBookWidget />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
