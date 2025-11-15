import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, Shield, Zap, ArrowRight, CheckCircle } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">ENCEPHLIAN</span>
            </Link>
            <Button asChild variant="default" size="sm" className="glow-cyan-hover">
              <Link to="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-24">
        <div className="container px-4 mx-auto">
          <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
            <div className="inline-block px-6 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm font-medium text-primary mb-4 glow-cyan">
              Clinical Decision Support System
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-primary via-cyan-400 to-primary bg-clip-text text-transparent animate-shimmer bg-[length:200%_auto]">
                ENCEPHLIAN
              </span>
            </h1>
            
            <p className="text-xl md:text-3xl text-foreground/80 max-w-3xl mx-auto font-light">
              AI-Powered Clinical Decision Support for <span className="text-primary font-semibold">Neurologists</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center pt-12">
              <Button asChild size="lg" className="group glow-cyan-hover text-lg px-8 py-6">
                <Link to="/login">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-lg px-8 py-6 border-primary/30 hover:bg-primary/10">
                <Link to="/login">Sign In</Link>
              </Button>
            </div>

            <div className="pt-16 flex flex-wrap justify-center gap-12 text-base">
              <div className="flex items-center gap-3 group">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <span className="font-medium">HIPAA Compliant</span>
              </div>
              <div className="flex items-center gap-3 group">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <span className="font-medium">Fast TAT & STAT</span>
              </div>
              <div className="flex items-center gap-3 group">
                <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                  <Brain className="h-5 w-5 text-primary" />
                </div>
                <span className="font-medium">AI-Assisted</span>
              </div>
            </div>
          </div>
        </div>

        {/* Animated background */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-32 relative">
        <div className="container px-4 mx-auto">
          <div className="text-center mb-20 animate-fade-in">
            <h2 className="text-5xl md:text-6xl font-bold mb-6">Platform Features</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">Everything you need for efficient triage care workflow</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
            <div className="p-8 bg-card/50 backdrop-blur rounded-2xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 animate-fade-in">
              <div className="h-14 w-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6 glow-cyan">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Token-Based System</h3>
              <p className="text-muted-foreground mb-6">
                Flexible token economy for TAT (1 token) and STAT (2 tokens) processing. 
                Each token costs ₹200.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Minimum 10 tokens per purchase</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Bulk discounts available</span>
                </li>
              </ul>
            </div>

            <div className="p-8 bg-card/50 backdrop-blur rounded-2xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <div className="h-14 w-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6 glow-cyan">
                <Brain className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-3">AI-Assisted Reports</h3>
              <p className="text-muted-foreground mb-6">
                Advanced CDSS to support your clinical decision-making process with AI-powered insights.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Not a diagnostic tool</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>Assistive analysis only</span>
                </li>
              </ul>
            </div>

            <div className="p-8 bg-card/50 backdrop-blur rounded-2xl border border-border hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 hover:-translate-y-1 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <div className="h-14 w-14 bg-primary/10 rounded-xl flex items-center justify-center mb-6 glow-cyan">
                <Shield className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Earn Commissions</h3>
              <p className="text-muted-foreground mb-6">
                Neurologists earn commission for every report signed off, paid directly to your earnings wallet.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>TAT reports: 3% commission</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span>STAT reports: 5% commission</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 relative overflow-hidden">
        <div className="container px-4 mx-auto">
          <div className="max-w-5xl mx-auto text-center space-y-10 p-16 rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 backdrop-blur glow-cyan animate-fade-in">
            <h2 className="text-5xl md:text-6xl font-bold">Ready to Get Started?</h2>
            <p className="text-2xl text-foreground/80 max-w-2xl mx-auto">
              Join the platform and start processing reports efficiently with optimal triage care
            </p>
            <Button asChild size="lg" className="group glow-cyan-hover text-lg px-10 py-7">
              <Link to="/login">
                Sign In Now
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-2 transition-transform" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-primary/10 rounded-full blur-[150px]" />
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-16 border-t border-border">
        <div className="container px-4 mx-auto">
          <div className="max-w-5xl mx-auto">
            <div className="p-8 bg-destructive/10 border border-destructive/30 rounded-2xl">
              <p className="text-destructive font-bold text-lg mb-3 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Important Medical Disclaimer
              </p>
              <p className="text-foreground/80 leading-relaxed">
                Encephalian is a Clinical Decision Support System (CDSS) designed to assist healthcare professionals. 
                It is <strong>not a diagnostic AI</strong> and should not replace professional medical judgment, diagnosis, or treatment decisions. 
                All clinical decisions must be made by qualified healthcare professionals. This system provides assistive analysis only 
                and should be used as a supplementary tool in clinical workflows.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
