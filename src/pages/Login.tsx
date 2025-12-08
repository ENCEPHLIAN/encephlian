import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { z } from "zod";
import logo from "@/assets/logo.png";

const emailSchema = z.string().email("Invalid email address");

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const mode = "signin"; // locked mode
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    const checkSessionAndRedirect = async (session: any) => {
      if (!session) return;
      
      // Check if user is super_admin or management - redirect to admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      
      const isAdmin = roles?.some(r => 
        r.role === "super_admin" || r.role === "management" || r.role === "ops"
      );
      
      if (isAdmin) {
        navigate("/admin");
      } else {
        navigate("/app/dashboard");
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      checkSessionAndRedirect(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        checkSessionAndRedirect(session);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isEmailValid = validateEmail(email);
    if (!isEmailValid) return;

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* STATE 1: HERO LANDING */}
      {!showForm && (
        <div className="text-center space-y-12 animate-fade-in">
          <h1
            className="text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-none text-foreground"
            style={{
              fontFamily: "Montserrat",
              fontWeight: 900,
              letterSpacing: "-0.05em",
            }}
          >
            MIND
          </h1>

          <p className="text-sm md:text-base text-muted-foreground tracking-wide uppercase font-light">
            Machine Intelligence for Neural Data
          </p>

          <p
            className="text-sm font-light tracking-tight opacity-40"
            style={{
              fontFamily: "Montserrat",
              fontWeight: 300,
              letterSpacing: "-0.02em",
            }}
          >
            ENCEPHLIAN
          </p>

          <Button onClick={() => setShowForm(true)} size="lg" className="px-12 py-6 text-lg font-medium mt-8">
            ACCESS CLINIC DASHBOARD
          </Button>
        </div>
      )}

      {/* STATE 2: SIGN IN FORM */}
      {showForm && (
        <div className="w-full max-w-6xl animate-fade-in">
          {/* Header with logo */}
          <div className="absolute top-6 left-6 flex items-center gap-3">
            <img src={logo} alt="ENCEPHLIAN Logo" className="h-16 w-16" />
            <span
              className="text-2xl font-extrabold tracking-tight text-foreground leading-none"
              style={{
                fontFamily: "Montserrat",
                fontWeight: 800,
                letterSpacing: "-0.03em",
              }}
            >
              ENCEPHLIAN
            </span>
          </div>

          <div className="flex flex-col items-center justify-center">
            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter leading-none text-foreground"
              style={{
                fontFamily: "Montserrat",
                fontWeight: 900,
                letterSpacing: "-0.05em",
              }}
            >
              MIND
            </h1>

            <p className="text-sm text-muted-foreground mb-12 tracking-wide uppercase">
              Machine Intelligence for Neural Data
            </p>

            {/* SIGN IN CARD */}
            <div className="w-full max-w-md bg-card/50 backdrop-blur-sm border-0 rounded-lg p-8 shadow-lg">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signin">Email</Label>
                  <Input
                    id="email-signin"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      validateEmail(e.target.value);
                    }}
                    required
                  />
                  {emailError && <p className="text-sm text-destructive">{emailError}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password-signin">Password</Label>
                  <div className="relative">
                    <Input
                      id="password-signin"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full mt-6" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
