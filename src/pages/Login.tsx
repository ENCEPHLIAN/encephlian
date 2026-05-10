import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { z } from "zod";
import logo from "@/assets/logo.png";
import { useUserSession } from "@/contexts/UserSessionContext";

const emailSchema = z.string().email("Invalid email address");

type Mode = "signin" | "forgot";

export default function Login() {
  const navigate = useNavigate();

  const { isLoading: sessionLoading, isAuthenticated, isAdmin } = useUserSession();
  
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  // Redirect authenticated users - only run once when session is ready
  useEffect(() => {
    if (sessionLoading || !isAuthenticated) return;
    
    // Use replace to prevent back button loops
    const destination = isAdmin ? "/admin" : "/app/dashboard";
    navigate(destination, { replace: true });
  }, [sessionLoading, isAuthenticated, isAdmin, navigate]);

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

      toast.success("Welcome back!");
      // Redirect happens via useEffect when context updates
    } catch (error: any) {
      toast.error("Sign in failed", { description: error.message || "An error occurred. Please try again." });
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const isEmailValid = validateEmail(email);
    if (!isEmailValid) return;

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) throw error;

      setResetSent(true);
      toast.success("Reset email sent", { description: "Check your inbox for the password reset link." });
    } catch (error: any) {
      toast.error("Error", { description: error.message || "An error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading only during initial session check
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render login form if authenticated (will redirect)
  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* STATE 1: HERO LANDING */}
      {!showForm && (
        <div className="text-center space-y-12 animate-fade-in">
          <h1 className="brand-mind text-7xl md:text-8xl lg:text-9xl leading-none text-foreground">
            MIND<sup className="text-sm md:text-base lg:text-lg ml-1.5 align-top relative top-[0.15em] font-light opacity-60">™</sup>
          </h1>

          <p className="text-sm md:text-base text-muted-foreground tracking-wide uppercase font-light">
            Machine Intelligence for Neural Data
          </p>

          <p className="brand-encephlian text-sm opacity-40">
            ENCEPHLIAN<sup className="text-[7px] align-top relative top-[0.1em] font-light">™</sup>
          </p>

          <Button onClick={() => setShowForm(true)} size="lg" className="px-12 py-6 text-lg font-medium mt-8">
            ACCESS CLINIC DASHBOARD
          </Button>
        </div>
      )}

      {/* STATE 2: SIGN IN / FORGOT PASSWORD FORM */}
      {showForm && (
        <div className="w-full max-w-6xl animate-fade-in">
          {/* Header with logo */}
          <div className="absolute top-6 left-6 flex items-center gap-3">
            <img src={logo} alt="ENCEPHLIAN Logo" className="h-16 w-16" />
            <span className="brand-encephlian text-2xl text-foreground leading-none">
              ENCEPHLIAN<sup className="text-[8px] align-top relative top-[0.1em] font-light">™</sup>
            </span>
          </div>

          <div className="flex flex-col items-center justify-center">
            <h1 className="brand-mind text-4xl md:text-5xl lg:text-6xl leading-none text-foreground">
              MIND<sup className="text-xs md:text-sm lg:text-base ml-1 align-top relative top-[0.15em] font-light opacity-60">™</sup>
            </h1>

            <p className="text-sm text-muted-foreground mb-12 tracking-wide uppercase">
              Machine Intelligence for Neural Data
            </p>

            {/* SIGN IN CARD */}
            {mode === "signin" && (
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

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setResetSent(false); }}
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Forgot your password?
                  </button>
                </div>
              </div>
            )}

            {/* FORGOT PASSWORD CARD */}
            {mode === "forgot" && (
              <div className="w-full max-w-md bg-card/50 backdrop-blur-sm border-0 rounded-lg p-8 shadow-lg">
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
                >
                  <ArrowLeft size={16} />
                  Back to sign in
                </button>

                {resetSent ? (
                  <div className="text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                      <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="font-semibold">Check your email</h3>
                    <p className="text-sm text-muted-foreground">
                      We've sent a password reset link to <strong>{email}</strong>
                    </p>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setMode("signin");
                        setResetSent(false);
                      }}
                      className="mt-4"
                    >
                      Return to sign in
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="text-center mb-4">
                      <h3 className="font-semibold">Reset your password</h3>
                      <p className="text-sm text-muted-foreground">
                        Enter your email and we'll send you a reset link
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email-reset">Email</Label>
                      <Input
                        id="email-reset"
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

                    <Button type="submit" className="w-full mt-6" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        "Send Reset Link"
                      )}
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
