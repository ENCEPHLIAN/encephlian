import { ReactNode, createContext, useContext, useState, useEffect } from "react";
import { useSku } from "@/hooks/useSku";
import { useLocation } from "react-router-dom";

interface TourStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  route?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to ENCEPHLIAN",
    description: "This guided tour will help you understand the key features of our AI-accelerated EEG triage platform.",
  },
  {
    id: "dashboard",
    title: "Your Dashboard",
    description: "See pending studies, token balance, and quick actions. This is your command center for triage workflows.",
    route: "/app/dashboard",
  },
  {
    id: "studies",
    title: "Studies Management",
    description: "Upload EEG files, view processing status, and access AI triage reports for each study.",
    route: "/app/studies",
  },
  {
    id: "lanes",
    title: "Kanban Workflow",
    description: "Track studies through the triage pipeline: Uploaded → Processing → AI Draft → In Review → Signed.",
    route: "/app/lanes",
  },
  {
    id: "viewer",
    title: "EEG Viewer",
    description: "Interactive waveform viewer with AI-detected anomalies highlighted. Navigate segments and review evidence.",
    route: "/app/viewer",
  },
  {
    id: "wallet",
    title: "Token Wallet",
    description: "Tokens power your triage reports. 1 token = 1 standard report. Purchase more as needed.",
    route: "/app/wallet",
  },
  {
    id: "complete",
    title: "You're Ready!",
    description: "That's the basics! Start by uploading an EEG file to see AI triage in action.",
  },
];

interface DemoTourContextType {
  isActive: boolean;
  currentStep: number;
  steps: TourStep[];
  startTour: () => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
}

const DemoTourContext = createContext<DemoTourContextType | undefined>(undefined);

export function DemoTourProvider({ children }: { children: ReactNode }) {
  const { isDemo, capabilities } = useSku();
  const location = useLocation();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasSeenTour, setHasSeenTour] = useState(() => {
    return localStorage.getItem("enceph.demo.tour_seen") === "true";
  });

  // Auto-start tour for demo SKU on first visit
  useEffect(() => {
    if (isDemo && capabilities.showGuidedTour && !hasSeenTour) {
      const timer = setTimeout(() => {
        setIsActive(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isDemo, capabilities.showGuidedTour, hasSeenTour]);

  const startTour = () => {
    setCurrentStep(0);
    setIsActive(true);
  };

  const endTour = () => {
    setIsActive(false);
    setHasSeenTour(true);
    localStorage.setItem("enceph.demo.tour_seen", "true");
  };

  const nextStep = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      endTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const goToStep = (index: number) => {
    if (index >= 0 && index < TOUR_STEPS.length) {
      setCurrentStep(index);
    }
  };

  return (
    <DemoTourContext.Provider
      value={{
        isActive,
        currentStep,
        steps: TOUR_STEPS,
        startTour,
        endTour,
        nextStep,
        prevStep,
        goToStep,
      }}
    >
      {children}
    </DemoTourContext.Provider>
  );
}

export function useDemoTour() {
  const context = useContext(DemoTourContext);
  if (!context) {
    throw new Error("useDemoTour must be used within DemoTourProvider");
  }
  return context;
}
