import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Menu } from "lucide-react";
import encephlianLogo from "@/assets/logo.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/app/dashboard");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/app/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app/dashboard`
          }
        });
        
        if (error) throw error;
        
        toast({
          title: "Account created!",
          description: "You can now sign in with your credentials."
        });
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (error) throw error;
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-6">
        <div className="flex items-center gap-3">
          <img src={encephlianLogo} alt="Encephalian" className="h-8 w-8" />
          <span className="logo-text text-xl tracking-[0.2em]">ENCEPHLIAN</span>
        </div>
        <Button variant="ghost" size="icon" className="text-white/70 hover:text-white">
          <Menu className="h-6 w-6" />
        </Button>
      </header>

      {/* Background grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1a1a1a_1px,transparent_1px),linear-gradient(to_bottom,#1a1a1a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_100%)]" />

      {/* Main content */}
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-8">
          {/* Title */}
          <div className="text-center space-y-3">
            <h1 className="text-6xl font-light tracking-wide">MIND</h1>
            <p className="text-sm text-white/60 tracking-widest uppercase">
              Machine Intelligence for Neural Data
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} className="space-y-6 mt-12">
            <div className="space-y-4">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12 rounded-none focus:border-white/30 focus:ring-0"
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-12 rounded-none focus:border-white/30 focus:ring-0"
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 bg-white text-black hover:bg-white/90 rounded-none font-medium"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignUp ? "Sign Up" : "Sign In"}
            </Button>

            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={isLoading}
              className="w-full text-sm text-white/60 hover:text-white transition-colors"
            >
              {isSignUp ? "Already have an account? Sign in" : "Don't have a clinic account? Create one"}
            </button>
          </form>

          {/* Footer links */}
          <div className="pt-8 text-center">
            <div className="flex items-center justify-center gap-4 text-xs text-white/40">
              <a href="#" className="hover:text-white/60 transition-colors">Terms of Use</a>
              <span>|</span>
              <a href="#" className="hover:text-white/60 transition-colors">Privacy Policy</a>
              <span>|</span>
              <a href="#" className="hover:text-white/60 transition-colors">Support</a>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle gradient orb */}
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
    </div>
  );
}
