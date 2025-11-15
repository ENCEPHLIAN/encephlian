import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";
import encephlianLogo from "@/assets/logo.png";
import { z } from "zod";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
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

  const validateEmail = (value: string) => {
    try {
      emailSchema.parse(value);
      setEmailError("");
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setEmailError(error.errors[0].message);
      }
      return false;
    }
  };

  const validatePassword = (value: string, isSignUp: boolean) => {
    if (!isSignUp) {
      setPasswordError("");
      return true;
    }
    
    try {
      passwordSchema.parse(value);
      setPasswordError("");
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        setPasswordError(error.errors[0].message);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent, isSignUp: boolean) => {
    e.preventDefault();
    
    // Validate inputs
    const emailValid = validateEmail(email);
    const passwordValid = validatePassword(password, isSignUp);
    
    if (!emailValid || !passwordValid) {
      return;
    }
    
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
        
        if (error) {
          if (error.message.includes("already registered")) {
            throw new Error("This email is already registered. Please sign in instead.");
          }
          throw error;
        }
        
        toast({
          title: "Account created!",
          description: "You can now sign in with your credentials."
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            throw new Error("Invalid email or password. Please try again.");
          }
          throw error;
        }
        
        toast({
          title: "Welcome back!",
          description: "Signing you in..."
        });
      }
    } catch (error: any) {
      toast({
        title: "Authentication Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0a] to-[#1a1a1a] text-white flex items-center justify-center px-4">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-3">
          <img src={encephlianLogo} alt="Encephalian" className="h-10 w-10" />
          <span className="text-2xl font-extrabold tracking-[0.3em]" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800 }}>
            ENCEPHLIAN
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="w-full max-w-md space-y-8">
        {/* Title */}
        <div className="text-center space-y-3">
          <h1 className="text-7xl font-bold tracking-wide" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700 }}>
            MIND
          </h1>
          <p className="text-sm text-white/60 tracking-widest uppercase font-light">
            Machine Intelligence for Neural Data
          </p>
        </div>

        {/* Login/Signup Card */}
        <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-8 shadow-2xl">
          {/* Accent line */}
          <div className="h-1 w-20 bg-[hsl(var(--primary))] mb-8 rounded-full" />

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      validateEmail(e.target.value);
                    }}
                    required
                    disabled={isLoading}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-11 rounded-lg focus:border-white/30"
                  />
                  {emailError && <p className="text-xs text-red-400">{emailError}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-11 rounded-lg focus:border-white/30 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 bg-white text-black hover:bg-white/90 rounded-lg font-medium mt-6"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={(e) => handleSubmit(e, true)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      validateEmail(e.target.value);
                    }}
                    required
                    disabled={isLoading}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-11 rounded-lg focus:border-white/30"
                  />
                  {emailError && <p className="text-xs text-red-400">{emailError}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create a strong password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        validatePassword(e.target.value, true);
                      }}
                      required
                      disabled={isLoading}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/40 h-11 rounded-lg focus:border-white/30 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {passwordError && <p className="text-xs text-red-400">{passwordError}</p>}
                  <p className="text-xs text-white/40">
                    Must be 8+ characters with uppercase, lowercase, number, and special character
                  </p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 bg-white text-black hover:bg-white/90 rounded-lg font-medium mt-6"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-white/40">
          © 2024 ENCEPHLIAN. All rights reserved.
        </p>
      </div>
    </div>
  );
}
