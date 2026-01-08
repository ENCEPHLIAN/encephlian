import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Clock, Activity, Layers } from "lucide-react";

interface DemoBannerProps {
  studyId: string;
  meta?: {
    n_channels?: number;
    sampling_rate_hz?: number;
    n_samples?: number;
    duration_sec?: number;
  } | null;
}

export function DemoBanner({ studyId, meta }: DemoBannerProps) {
  const durationSec = meta?.n_samples && meta?.sampling_rate_hz 
    ? meta.n_samples / meta.sampling_rate_hz 
    : meta?.duration_sec;
  
  const durationMin = durationSec ? (durationSec / 60).toFixed(1) : "--";
  
  return (
    <Alert className="bg-amber-500/10 border-amber-500/30 mb-4">
      <FlaskConical className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-700 dark:text-amber-400 flex items-center gap-2">
        Demo Mode - Sample Study
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
          {studyId}
        </Badge>
      </AlertTitle>
      <AlertDescription className="text-amber-600/80 dark:text-amber-400/80">
        <div className="flex flex-wrap gap-4 mt-2 text-sm">
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            {meta?.n_channels || "--"} channels
          </span>
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            {meta?.sampling_rate_hz || "--"} Hz
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {durationMin} min
          </span>
        </div>
        <p className="mt-2 text-xs opacity-80">
          This is pre-processed sample data from Temple University Hospital EEG Corpus. 
          Upload your own studies to analyze real patient data.
        </p>
      </AlertDescription>
    </Alert>
  );
}
