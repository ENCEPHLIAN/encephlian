import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, Shield, Zap, ArrowRight, CheckCircle } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary/10">
        <div className="container px-4 py-24 mx-auto">
          <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in">
            <div className="inline-block px-4 py-2 bg-primary/10 rounded-full text-sm font-medium text-primary mb-4">
              Clinical Decision Support System
            </div>
            
            <h1 className="text-6xl md:text-7xl font-bold">
              <span className="bg-gradient-to-r from-primary via-primary/80 to-secondary bg-clip-text text-transparent">
                Encephalian
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              AI-Powered Clinical Decision Support for Neurologists
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
              <Button asChild size="lg" className="group">
                <Link to="/login">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login">Sign In</Link>
              </Button>
            </div>

            <div className="pt-12 flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span>HIPAA Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span>Fast TAT & STAT Processing</span>
              </div>
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <span>AI-Assisted Analysis</span>
              </div>
            </div>
          </div>
        </div>

        {/* Animated background gradient */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-to-tr from-secondary/20 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-muted/30">
        <div className="container px-4 mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Platform Features</h2>
            <p className="text-xl text-muted-foreground">Everything you need for efficient clinical workflow</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="p-6 bg-card rounded-lg border hover-scale">
              <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Token-Based System</h3>
              <p className="text-muted-foreground mb-4">
                Flexible token economy for TAT (1 token) and STAT (2 tokens) processing. 
                Each token costs ₹200.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>Minimum 10 tokens per purchase</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>Bulk discounts available</span>
                </li>
              </ul>
            </div>

            <div className="p-6 bg-card rounded-lg border hover-scale">
              <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI-Assisted Reports</h3>
              <p className="text-muted-foreground mb-4">
                Advanced CDSS to support your clinical decision-making process with AI-powered insights.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>Not a diagnostic tool</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>Assistive analysis only</span>
                </li>
              </ul>
            </div>

            <div className="p-6 bg-card rounded-lg border hover-scale">
              <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Earn Commissions</h3>
              <p className="text-muted-foreground mb-4">
                Neurologists earn commission for every report signed off, paid directly to your earnings wallet.
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>TAT reports: 3% commission</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                  <span>STAT reports: 5% commission</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="container px-4 mx-auto">
          <div className="max-w-4xl mx-auto text-center space-y-8 p-12 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 border">
            <h2 className="text-4xl font-bold">Ready to Get Started?</h2>
            <p className="text-xl text-muted-foreground">
              Join the platform and start processing reports efficiently
            </p>
            <Button asChild size="lg" className="group">
              <Link to="/login">
                Sign In to Admin
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="py-12 bg-muted/50">
        <div className="container px-4 mx-auto">
          <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground">
            <p className="font-medium mb-2">Important Disclaimer</p>
            <p>
              Encephalian is a Clinical Decision Support System (CDSS) designed to assist healthcare professionals. 
              It is not a diagnostic AI and should not replace professional medical judgment, diagnosis, or treatment decisions. 
              All clinical decisions must be made by qualified healthcare professionals.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
