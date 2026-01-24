import { useNavigate } from "react-router-dom";
import { useDemoTour } from "@/contexts/DemoTourContext";
import { useSku } from "@/hooks/useSku";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Demo Tour Overlay
 * 
 * Displays a modal overlay with guided tour steps for Demo SKU users.
 * Appears automatically on first visit, can be restarted via sidebar.
 */
export function DemoTourOverlay() {
  const navigate = useNavigate();
  const { isDemo } = useSku();
  const { isActive, currentStep, steps, nextStep, prevStep, endTour } = useDemoTour();

  if (!isDemo || !isActive) return null;

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    // Navigate to route if specified
    const nextStepData = steps[currentStep + 1];
    if (nextStepData?.route) {
      navigate(nextStepData.route);
    }
    nextStep();
  };

  const handlePrev = () => {
    const prevStepData = steps[currentStep - 1];
    if (prevStepData?.route) {
      navigate(prevStepData.route);
    }
    prevStep();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4 shadow-2xl border-primary/20">
        <CardHeader className="relative pb-2">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-8 w-8 rounded-full"
            onClick={endTour}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Demo Tour ({currentStep + 1}/{steps.length})
            </span>
          </div>
          <CardTitle className="text-xl">{step.title}</CardTitle>
        </CardHeader>
        
        <CardContent className="pb-4">
          <Progress value={progress} className="h-1 mb-4" />
          <p className="text-muted-foreground">{step.description}</p>
        </CardContent>

        <CardFooter className="flex justify-between gap-2 pt-0">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={isFirst}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          
          <div className="flex gap-1">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  idx === currentStep ? "bg-primary" : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          <Button onClick={isLast ? endTour : handleNext} className="gap-1">
            {isLast ? "Get Started" : "Next"}
            {!isLast && <ChevronRight className="h-4 w-4" />}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

/**
 * Demo Tour Trigger Button
 * 
 * Shows in sidebar footer for Demo SKU to restart the tour.
 */
export function DemoTourTrigger() {
  const { isDemo } = useSku();
  const { startTour } = useDemoTour();

  if (!isDemo) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={startTour}
      className="w-full gap-2 text-xs"
    >
      <Sparkles className="h-3 w-3" />
      Restart Tour
    </Button>
  );
}
