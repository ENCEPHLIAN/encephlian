import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Play, Pause, Plus, Trash2, Loader2, Sparkles } from "lucide-react";

type Marker = {
  id: string;
  timestamp_sec: number;
  marker_type: string;
  label: string | null;
  channel: string | null;
  duration_sec: number | null;
  severity: string | null;
  notes: string | null;
};

export default function EEGViewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Marker form state
  const [markerType, setMarkerType] = useState<string>("annotation");
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerNotes, setMarkerNotes] = useState("");
  const [markerSeverity, setMarkerSeverity] = useState<string>("");

  // Fetch study data
  const { data: study, isLoading } = useQuery({
    queryKey: ["study", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*, study_files(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch markers
  const { data: markers = [] } = useQuery({
    queryKey: ["markers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eeg_markers")
        .select("*")
        .eq("study_id", id!)
        .order("timestamp_sec");
      if (error) throw error;
      return data as Marker[];
    },
    enabled: !!id,
  });

  // Add marker mutation
  const addMarkerMutation = useMutation({
    mutationFn: async (markerData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("eeg_markers").insert({
        study_id: id,
        user_id: user.id,
        ...markerData,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["markers", id] });
      toast.success("Marker added");
      setMarkerLabel("");
      setMarkerNotes("");
      setMarkerSeverity("");
    },
    onError: (error) => {
      toast.error("Failed to add marker");
      console.error(error);
    },
  });

  // Delete marker mutation
  const deleteMarkerMutation = useMutation({
    mutationFn: async (markerId: string) => {
      const { error } = await supabase.from("eeg_markers").delete().eq("id", markerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["markers", id] });
      toast.success("Marker deleted");
    },
  });

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !study?.study_files?.[0]) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "hsl(var(--primary) / 0.5)",
      progressColor: "hsl(var(--primary))",
      cursorColor: "hsl(var(--accent))",
      barWidth: 2,
      barGap: 1,
      height: 200,
      normalize: true,
      backend: "WebAudio",
    });

    wavesurferRef.current = wavesurfer;

    // For demo purposes - load a placeholder audio
    // In production, you'd load the actual EEG data converted to audio or use a custom renderer
    wavesurfer.on("ready", () => {
      setDuration(wavesurfer.getDuration());
    });

    wavesurfer.on("audioprocess", () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on("play", () => setIsPlaying(true));
    wavesurfer.on("pause", () => setIsPlaying(false));

    // Load sample data (replace with actual EEG data)
    wavesurfer.load("https://www.mfiles.co.uk/mp3-downloads/gs-cd-track2.mp3");

    return () => {
      wavesurfer.destroy();
    };
  }, [study]);

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const handleAddMarker = () => {
    if (!markerLabel.trim()) {
      toast.error("Please enter a marker label");
      return;
    }

    addMarkerMutation.mutate({
      timestamp_sec: currentTime,
      marker_type: markerType,
      label: markerLabel,
      notes: markerNotes || null,
      severity: markerSeverity || null,
      channel: null,
      duration_sec: null,
    });
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate_ai_report", {
        body: { study_id: id },
      });

      if (error) throw error;
      
      toast.success("AI report generated successfully!");
      navigate(`/app/studies/${id}`);
    } catch (error: any) {
      console.error("Report generation failed:", error);
      toast.error(error.message || "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!study) {
    return <div className="p-8">Study not found</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(`/app/studies/${id}`)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Study
          </Button>
          <div className="flex gap-2">
            <Button
              onClick={handleGenerateReport}
              disabled={generatingReport}
              className="gap-2"
            >
              {generatingReport ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate AI Report
            </Button>
          </div>
        </div>

        {/* Patient Info */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold">
            {(study.meta as any)?.patient_name || "Unknown Patient"}
          </h2>
          <p className="text-sm text-muted-foreground">
            ID: {(study.meta as any)?.patient_id} | Age: {(study.meta as any)?.age} | Gender: {(study.meta as any)?.gender}
          </p>
        </Card>

        {/* Waveform Viewer */}
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">EEG Waveform</h3>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <Button size="sm" onClick={handlePlayPause}>
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div ref={waveformRef} className="w-full" />
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add Marker */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Add Marker at {formatTime(currentTime)}</h3>
            <div className="space-y-4">
              <div>
                <Label>Type</Label>
                <Select value={markerType} onValueChange={setMarkerType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annotation">Annotation</SelectItem>
                    <SelectItem value="spike">Spike</SelectItem>
                    <SelectItem value="seizure">Seizure</SelectItem>
                    <SelectItem value="artifact">Artifact</SelectItem>
                    <SelectItem value="sleep_stage">Sleep Stage</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Label *</Label>
                <Input
                  value={markerLabel}
                  onChange={(e) => setMarkerLabel(e.target.value)}
                  placeholder="e.g., Sharp wave in Fp1"
                />
              </div>
              {(markerType === "spike" || markerType === "seizure") && (
                <div>
                  <Label>Severity</Label>
                  <Select value={markerSeverity} onValueChange={setMarkerSeverity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mild">Mild</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="severe">Severe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={markerNotes}
                  onChange={(e) => setMarkerNotes(e.target.value)}
                  placeholder="Additional observations..."
                  rows={3}
                />
              </div>
              <Button onClick={handleAddMarker} className="w-full" disabled={addMarkerMutation.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                Add Marker
              </Button>
            </div>
          </Card>

          {/* Markers List */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Markers ({markers.length})</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {markers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No markers yet. Add markers to annotate findings.</p>
              ) : (
                markers.map((marker) => (
                  <div
                    key={marker.id}
                    className="flex items-start justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          {formatTime(marker.timestamp_sec)}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                          {marker.marker_type}
                        </span>
                        {marker.severity && (
                          <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded">
                            {marker.severity}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium mt-1">{marker.label}</p>
                      {marker.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{marker.notes}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMarkerMutation.mutate(marker.id)}
                      disabled={deleteMarkerMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
