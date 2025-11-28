import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Brain, Lock, Mail } from "lucide-react";
import { AnomalyTimeline } from "./AnomalyTimeline";
import { generateMockAnomalies } from "@/lib/ai/mockAnomalyData";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface AnomalyDetectionPreviewProps {
  studyId?: string;
}

export function AnomalyDetectionPreview({ studyId }: AnomalyDetectionPreviewProps) {
  const [email, setEmail] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Generate mock data
  const { detections, timeline, overallStatus } = generateMockAnomalies(studyId);
  
  const handleJoinWaitlist = async () => {
    if (!email || !email.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    
    try {
      const { error } = await supabase.functions.invoke("join_waitlist", {
        body: { email, feature: "AI Anomaly Detection" }
      });

      if (error) throw error;

      toast.success("Thanks! We'll notify you when AI detection launches.");
      setEmail("");
      setDialogOpen(false);
    } catch (error: any) {
      console.error("Waitlist error:", error);
      toast.error("Failed to join waitlist. Please try again.");
    }
  };
  
  const getStatusBadge = () => {
    if (overallStatus === "normal") return <Badge variant="secondary">Normal</Badge>;
    if (overallStatus === "abnormal") return <Badge variant="destructive">Abnormal</Badge>;
    return <Badge className="bg-amber-500">Review Required</Badge>;
  };
  
  return (
    <Card className="border-2 border-dashed border-primary/30 relative overflow-hidden">
      {/* Glassmorphism background */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none" />
      
      <CardHeader>
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                AI Anomaly Detection
                <Badge variant="outline" className="font-normal">Coming Soon</Badge>
              </CardTitle>
              <CardDescription>
                Automated analysis to accelerate triage and classification
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6 relative z-10">
        {/* Detection Grid */}
        <div className="space-y-3">
          {detections.map((detection) => (
            <div 
              key={detection.type}
              className="flex items-center justify-between p-3 rounded-lg bg-card/50 backdrop-blur-sm border border-border/50 hover:bg-accent/20 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <span className="text-2xl">{detection.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium capitalize">{detection.type} Detection</span>
                    {detection.count > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {detection.count} detected
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {detection.description}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-24">
                  <Progress value={detection.confidence * 100} className="h-2" />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                  {Math.round(detection.confidence * 100)}%
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {/* Timeline Heatmap */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Activity Timeline (20 min recording)</Label>
          <div className="h-16 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
            <AnomalyTimeline markers={timeline} duration={1200} className="w-full h-full" />
          </div>
        </div>
        
        {/* Shimmer Effect + CTA */}
        <div className="relative rounded-lg border-2 border-dashed border-primary/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10 p-6 text-center overflow-hidden">
          {/* Animated shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
          
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span className="text-sm font-medium">Feature in Development</span>
            </div>
            
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              AI-powered anomaly detection will help you quickly identify abnormal patterns, 
              prioritize urgent cases, and streamline your workflow.
            </p>
            
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Join Beta Waitlist
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Join AI Detection Beta</DialogTitle>
                  <DialogDescription>
                    Be among the first to access AI-powered anomaly detection when it launches.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleJoinWaitlist()}
                    />
                  </div>
                  <Button onClick={handleJoinWaitlist} className="w-full">
                    Join Waitlist
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Add shimmer animation to tailwind config if not present
