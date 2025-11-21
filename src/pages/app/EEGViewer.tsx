import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { EdfReader } from "edfjs";
import { EEGCanvas } from "@/components/eeg/EEGCanvas";
import { EEGControls } from "@/components/eeg/EEGControls";
import { ChannelList } from "@/components/eeg/ChannelList";
import { MontageSelector } from "@/components/eeg/MontageSelector";
import { applyMontage } from "@/lib/eeg/montage-transforms";
import { getChannelColor } from "@/lib/eeg/channel-groups";

type Marker = {
  id: string;
  timestamp_sec: number;
  marker_type: string;
  label?: string;
  notes?: string;
};

export default function EEGViewer() {
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get("studyId");
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeWindow, setTimeWindow] = useState(30);
  const [amplitudeScale, setAmplitudeScale] = useState(2);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [montage, setMontage] = useState("referential");

  // EEG Data State (original raw data)
  const [rawEegData, setRawEegData] = useState<{
    signals: number[][];
    channelLabels: string[];
    sampleRate: number;
    duration: number;
  } | null>(null);
  
  // Transformed data based on montage
  const eegData = rawEegData ? (() => {
    const transformed = applyMontage(rawEegData.signals, rawEegData.channelLabels, montage);
    return {
      ...rawEegData,
      signals: transformed.signals,
      channelLabels: transformed.labels
    };
  })() : null;

  // Channel Visibility
  const [visibleChannels, setVisibleChannels] = useState<Set<number>>(new Set());

  // Marker State
  const [newMarkerType, setNewMarkerType] = useState("event");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  const [newMarkerNotes, setNewMarkerNotes] = useState("");

  // Fetch available studies
  const { data: availableStudies = [] } = useQuery({
    queryKey: ["available-studies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id, meta, created_at, sample")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Auto-load sample study if no studyId provided
  const { data: sampleStudy, isLoading: sampleLoading } = useQuery({
    queryKey: ["sample-study"],
    enabled: !studyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("*, study_files(*)")
        .eq("sample", true)
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });
  
  // Fetch selected study
  const { data: study, isLoading: studyLoading } = useQuery({
    queryKey: ["study", studyId],
    enabled: !!studyId,
    queryFn: async () => {
      if (!studyId) return null;

      const { data, error } = await supabase
        .from("studies")
        .select("*, study_files(*)")
        .eq("id", studyId)
        .single();

      if (error) throw error;
      return data;
    },
  });
  
  // Use sample study if no study selected
  const activeStudy = study || sampleStudy;

  // Fetch markers
  const { data: markers = [] } = useQuery({
    queryKey: ["eeg-markers", studyId],
    enabled: !!studyId,
    queryFn: async () => {
      if (!studyId) return [];

      const { data, error } = await supabase
        .from("eeg_markers")
        .select("*")
        .eq("study_id", studyId)
        .order("timestamp_sec", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // Load EDF file
  useEffect(() => {
    if (!activeStudy || !activeStudy.study_files?.[0]) return;

    const loadEDFFile = async () => {
      try {
        const file = activeStudy.study_files[0];
        let fileUrl: string;

        if (activeStudy.sample) {
          // Sample studies: use direct public path
          fileUrl = `/sample-eeg/${file.path.split('/').pop()}`;
        } else {
          // User studies: get signed URL
          const { data: signedUrlData, error: signedError } = await supabase.storage
            .from("eeg-raw")
            .createSignedUrl(file.path, 3600);

          if (signedError) throw signedError;
          fileUrl = signedUrlData.signedUrl;
        }

        // Fetch and parse EDF file
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error("Failed to fetch EDF file");

        const arrayBuffer = await response.arrayBuffer();
        
        // Parse EDF file with edfjs
        const edfReader = new EdfReader(arrayBuffer);
        const header = edfReader.getHeader();
        const physicalSignals = edfReader.getPhysicalSignals();

        setRawEegData({
          signals: physicalSignals,
          channelLabels: header.signalInfo.map((s: any) => s.label.trim()),
          sampleRate: header.signalInfo[0].sampleRate || header.signalInfo[0].sampleFrequency,
          duration: header.duration,
        });

        // Initialize visible channels (show first 10 by default)
        const initialChannels = new Set(
          Array.from({ length: Math.min(10, physicalSignals.length) }, (_, i) => i)
        );
        setVisibleChannels(initialChannels);

        toast.success(activeStudy.sample ? "Sample EEG loaded" : "EEG file loaded successfully");
      } catch (error: any) {
        console.error("Error loading EDF:", error);
        toast.error(`Failed to load EEG file: ${error.message}`);
      }
    };

    loadEDFFile();
  }, [activeStudy]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying || !eegData) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + (0.1 * playbackSpeed);
        if (next >= eegData.duration - timeWindow) {
          setIsPlaying(false);
          return eegData.duration - timeWindow;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, eegData, timeWindow, playbackSpeed]);

  // Add marker mutation
  const addMarkerMutation = useMutation({
    mutationFn: async () => {
      if (!studyId) throw new Error("No study selected");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("eeg_markers").insert({
        study_id: studyId,
        user_id: user.id,
        timestamp_sec: currentTime,
        marker_type: newMarkerType,
        label: newMarkerLabel || null,
        notes: newMarkerNotes || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eeg-markers", studyId] });
      setNewMarkerLabel("");
      setNewMarkerNotes("");
      toast.success("Marker added");
    },
    onError: (error: any) => {
      toast.error(`Failed to add marker: ${error.message}`);
    },
  });

  // Delete marker mutation
  const deleteMarkerMutation = useMutation({
    mutationFn: async (markerId: string) => {
      const { error } = await supabase.from("eeg_markers").delete().eq("id", markerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["eeg-markers", studyId] });
      toast.success("Marker deleted");
    },
    onError: (error: any) => {
      toast.error(`Failed to delete marker: ${error.message}`);
    },
  });

  const handlePlayPause = () => setIsPlaying(!isPlaying);
  const handleSkipBackward = () => setCurrentTime(Math.max(0, currentTime - timeWindow));
  const handleSkipForward = () => setCurrentTime(Math.min(eegData?.duration || 0, currentTime + timeWindow));
  const handleExport = () => {
    toast.info("Export functionality coming soon");
  };

  const handleToggleChannel = (index: number) => {
    setVisibleChannels((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleSelectAllChannels = () => {
    if (!eegData) return;
    setVisibleChannels(new Set(Array.from({ length: eegData.signals.length }, (_, i) => i)));
  };

  const handleDeselectAllChannels = () => {
    setVisibleChannels(new Set());
  };

  // No early return - sample study will auto-load

  if (studyLoading || sampleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading EEG data...</p>
        </div>
      </div>
    );
  }

  if (!activeStudy) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Study Not Found</CardTitle>
            <CardDescription>The requested study could not be loaded.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }
  
  const isSampleStudy = !studyId && activeStudy.sample;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1800px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/app/studies">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Studies
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">EEG Viewer</h1>
                {isSampleStudy && <Badge variant="secondary">Sample Study</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {(activeStudy.meta as any)?.patient_name || "Unnamed Study"} - {new Date(activeStudy.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left Sidebar - Channels */}
          <div className="lg:col-span-1">
            <ChannelList
              channelLabels={eegData?.channelLabels || []}
              visibleChannels={visibleChannels}
              onToggleChannel={handleToggleChannel}
              onSelectAll={handleSelectAllChannels}
              onDeselectAll={handleDeselectAllChannels}
            />
          </div>

          {/* Main Area - Waveforms and Controls */}
          <div className="lg:col-span-3 space-y-4">
            {/* Quick Triage Panel */}
            {eegData && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-center gap-4">
                  <Badge variant="outline">
                    Duration: {Math.floor(eegData.duration / 60)}:{(Math.floor(eegData.duration % 60)).toString().padStart(2, "0")}
                  </Badge>
                  <Badge variant="outline">
                    Channels: {eegData.channelLabels.length}
                  </Badge>
                  <Badge variant="outline">
                    Montage: {montage.replace("-", " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toast.info("Marked as normal")}>
                    Mark as Normal
                  </Button>
                  <Button size="sm" variant="default" onClick={() => toast.info("Flagged for review")}>
                    Flag for Review
                  </Button>
                </div>
              </div>
            )}
            
            {/* Waveform Display */}
            <Card>
              <CardContent className="p-2">
                <div className="h-[500px] bg-card">
                  {eegData ? (
                    <EEGCanvas
                      signals={eegData.signals}
                      channelLabels={eegData.channelLabels}
                      sampleRate={eegData.sampleRate}
                      currentTime={currentTime}
                      timeWindow={timeWindow}
                      amplitudeScale={amplitudeScale}
                      visibleChannels={visibleChannels}
                      theme={theme || "dark"}
                      markers={markers}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Controls */}
            <EEGControls
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={eegData?.duration || 0}
              timeWindow={timeWindow}
              amplitudeScale={amplitudeScale}
              playbackSpeed={playbackSpeed}
              onPlayPause={handlePlayPause}
              onTimeChange={setCurrentTime}
              onTimeWindowChange={setTimeWindow}
              onAmplitudeScaleChange={setAmplitudeScale}
              onPlaybackSpeedChange={setPlaybackSpeed}
              onSkipBackward={handleSkipBackward}
              onSkipForward={handleSkipForward}
              onExport={handleExport}
            />

            {/* Montage and Markers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MontageSelector currentMontage={montage} onMontageChange={setMontage} />

              {/* Add Marker */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Add Marker</CardTitle>
                </CardHeader>
                <CardContent className="pb-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={newMarkerType} onValueChange={setNewMarkerType}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="event">Event</SelectItem>
                        <SelectItem value="seizure">Seizure</SelectItem>
                        <SelectItem value="artifact">Artifact</SelectItem>
                        <SelectItem value="sleep">Sleep Stage</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Label"
                      value={newMarkerLabel}
                      onChange={(e) => setNewMarkerLabel(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <Textarea
                    placeholder="Notes (optional)"
                    value={newMarkerNotes}
                    onChange={(e) => setNewMarkerNotes(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  <Button
                    onClick={() => addMarkerMutation.mutate()}
                    disabled={addMarkerMutation.isPending}
                    size="sm"
                    className="w-full"
                  >
                    Add at {Math.floor(currentTime)}s
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Markers List */}
            {markers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Markers ({markers.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {markers.map((marker: Marker) => (
                      <div
                        key={marker.id}
                        className="flex items-start justify-between p-2 bg-muted rounded border border-border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-foreground">
                              {Math.floor(marker.timestamp_sec)}s
                            </span>
                            <span className="text-xs font-semibold text-primary">{marker.marker_type}</span>
                            {marker.label && (
                              <span className="text-xs text-muted-foreground truncate">{marker.label}</span>
                            )}
                          </div>
                          {marker.notes && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{marker.notes}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => deleteMarkerMutation.mutate(marker.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
