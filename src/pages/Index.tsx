import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import FeatureCards from "@/components/FeatureCards";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <FeatureCards />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
