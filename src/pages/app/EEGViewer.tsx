import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Trash2, AlertCircle } from "lucide-react";
import { useTheme } from "next-themes";

import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { ChannelGroupList } from "@/components/eeg/ChannelGroupList";
import { MontageSelector } from "@/components/eeg/MontageSelector";
import { applyMontage } from "@/lib/eeg/montage-transforms";
import { ChannelGroup, groupChannels } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";
import { parseEDF, parseBDF } from "@/lib/eeg/edf-parser";

type Marker = {
  id: string;
  timestamp_sec: number;
  marker_type: string;
  label?: string | null;
  notes?: string | null;
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

  // Loading state
  const [isLoadingEEG, setIsLoadingEEG] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // EEG Data State (original raw data)
  const [rawEegData, setRawEegData] = useState<{
    signals: number[][];
    channelLabels: string[];
    sampleRate: number;
    duration: number;
  } | null>(null);

  // Transformed data based on montage
  const eegData = rawEegData
    ? (() => {
        const transformed = applyMontage(rawEegData.signals, rawEegData.channelLabels, montage);
        return {
          ...rawEegData,
          signals: transformed.signals,
          channelLabels: transformed.labels,
        };
      })()
    : null;

  // Channel Group Visibility
  const [visibleGroups, setVisibleGroups] = useState<Set<ChannelGroup>>(
    new Set(["frontal", "central", "temporal", "occipital"])
  );

  // Compute visible channels
  const visibleChannels = eegData
    ? (() => {
        const standardIndices = filterStandardChannels(eegData.channelLabels);
        const standardLabels = standardIndices.map((i) => eegData.channelLabels[i]);
        const groups = groupChannels(standardLabels);

        const visible = new Set<number>();
        groups.forEach((localIndices, group) => {
          if (visibleGroups.has(group)) {
            localIndices.forEach((localIdx) => {
              visible.add(standardIndices[localIdx]);
            });
          }
        });
        return visible;
      })()
    : new Set<number>();

  // Marker input state
  const [newMarkerType, setNewMarkerType] = useState("event");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  const [newMarkerNotes, setNewMarkerNotes] = useState("");

  // Fetch sample study if no studyId
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

  const activeStudy = study || sampleStudy;
  const isSampleStudy = !studyId && activeStudy?.sample;

  // Fetch markers
  const { data: markers = [] } = useQuery<Marker[]>({
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
      return (data || []) as Marker[];
    },
  });

  // ---------- EEG loading logic ----------
  useEffect(() => {
    if (!activeStudy) return;

    const loadEEGData = async () => {
      setIsLoadingEEG(true);
      setLoadError(null);

      try {
        // SAMPLE STUDY: local JSON
        if (activeStudy.sample) {
          const jsonPath = "/sample-eeg/S094R10.json";
          const response = await fetch(jsonPath);
          if (!response.ok) throw new Error("Failed to fetch sample data");

          const parsedData = await response.json();
          const fullSignals = parsedData.channelLabels.map((label: string, idx: number) => {
            const sampleSignal = parsedData.signals[idx % 2];
            const variation = idx * 0.1;
            return sampleSignal.map((val: number) => val + variation * Math.sin(idx));
          });

          setRawEegData({
            signals: fullSignals,
            channelLabels: parsedData.channelLabels,
            sampleRate: parsedData.sampleRate,
            duration: parsedData.duration,
          });
          toast.success("Sample EEG loaded");
          return;
        }

        // USER STUDY: Parse EDF directly in browser
        const studyFiles = (activeStudy.study_files as any[]) || [];
        
        // Find the EDF/BDF file
        const edfFile = studyFiles.find((f) =>
          f.kind === "edf" || f.kind === "bdf" || f.kind === "eeg_raw" ||
          f.path?.toLowerCase().endsWith('.edf') || f.path?.toLowerCase().endsWith('.bdf')
        );

        if (!edfFile) {
          throw new Error("No EDF/BDF file found for this study");
        }

        toast.info("Loading EEG file...");

        // Download the raw EDF file
        const { data: fileBlob, error: downloadError } = await supabase
          .storage
          .from("eeg-raw")
          .download(edfFile.path);

        if (downloadError || !fileBlob) {
          throw new Error(`Failed to download EDF file: ${downloadError?.message || "Unknown error"}`);
        }

        // Parse EDF/BDF in browser
        const buffer = await fileBlob.arrayBuffer();
        const isBDF = edfFile.path?.toLowerCase().endsWith('.bdf') || edfFile.kind === 'bdf';
        
        toast.info("Parsing EEG signals...");
        
        const parsed = isBDF ? parseBDF(buffer) : parseEDF(buffer);

        // Limit to first 10 minutes for performance
        const maxDuration = 600; // 10 minutes
        const maxSamples = Math.floor(maxDuration * parsed.sampleRate);
        
        const limitedSignals = parsed.signals.map(signal => 
          signal.length > maxSamples ? signal.slice(0, maxSamples) : signal
        );
        const limitedDuration = Math.min(parsed.duration, maxDuration);

        setRawEegData({
          signals: limitedSignals,
          channelLabels: parsed.channelLabels,
          sampleRate: parsed.sampleRate,
          duration: limitedDuration,
        });

        toast.success(`EEG loaded: ${parsed.channelLabels.length} channels, ${Math.round(limitedDuration)}s`);

      } catch (error: any) {
        console.error("Error loading EEG:", error);
        setLoadError(error.message);
        toast.error(`Failed to load EEG: ${error.message}`);
      } finally {
        setIsLoadingEEG(false);
      }
    };

    loadEEGData();
  }, [activeStudy]);

  // ---------- Playback loop ----------
  useEffect(() => {
    if (!isPlaying || !eegData) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + 0.1 * playbackSpeed;
        if (next >= eegData.duration - timeWindow) {
          setIsPlaying(false);
          return Math.max(0, eegData.duration - timeWindow);
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, eegData, timeWindow, playbackSpeed]);

  // ---------- Marker mutations ----------
  const addMarkerMutation = useMutation({
    mutationFn: async (payload: { timestamp_sec: number; marker_type: string; label?: string; notes?: string }) => {
      if (!studyId) throw new Error("No study selected");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("eeg_markers").insert({
        study_id: studyId,
        user_id: user.id,
        timestamp_sec: payload.timestamp_sec,
        marker_type: payload.marker_type,
        label: payload.label ?? null,
        notes: payload.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (studyId) queryClient.invalidateQueries({ queryKey: ["eeg-markers", studyId] });
      setNewMarkerLabel("");
      setNewMarkerNotes("");
      toast.success("Marker added");
    },
    onError: (error: any) => toast.error(`Failed to add marker: ${error.message}`),
  });

  const deleteMarkerMutation = useMutation({
    mutationFn: async (markerId: string) => {
      const { error } = await supabase.from("eeg_markers").delete().eq("id", markerId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (studyId) queryClient.invalidateQueries({ queryKey: ["eeg-markers", studyId] });
      toast.success("Marker deleted");
    },
    onError: (error: any) => toast.error(`Failed to delete marker: ${error.message}`),
  });

  // ---------- Controls handlers ----------
  const handlePlayPause = () => setIsPlaying((prev) => !prev);
  const handleSkipBackward = () => setCurrentTime((prev) => Math.max(0, prev - timeWindow));
  const handleSkipForward = () => {
    if (!eegData) return;
    setCurrentTime((prev) => Math.min(eegData.duration - timeWindow, prev + timeWindow));
  };

  const handleTimeClick = useCallback((time: number) => {
    if (!eegData) return;
    const clampedTime = Math.max(0, Math.min(eegData.duration - timeWindow, time - timeWindow / 2));
    setCurrentTime(clampedTime);
  }, [eegData, timeWindow]);

  const handleExport = useCallback(() => {
    if (!studyId) {
      toast.error("No study selected for export.");
      return;
    }
    const annotations = markers.map((m) => ({
      id: m.id,
      onset: m.timestamp_sec,
      duration: 1,
      type: m.marker_type,
      label: m.label,
      notes: m.notes,
    }));
    const blob = new Blob([JSON.stringify(annotations, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eeg_annotations_${studyId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Annotations exported as JSON");
  }, [markers, studyId]);

  const handleToggleGroup = (group: ChannelGroup) => {
    setVisibleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const handleSelectAllGroups = () => setVisibleGroups(new Set(["frontal", "central", "temporal", "occipital"]));
  const handleDeselectAllGroups = () => setVisibleGroups(new Set());

  // ---------- Loading / fallback views ----------
  if (studyLoading || sampleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading study...</p>
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-4">
        <Link to="/app/studies">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">EEG Viewer</h1>
          <p className="text-sm text-muted-foreground">
            {isSampleStudy ? "Sample Study" : `Study: ${studyId?.slice(0, 8)}...`}
          </p>
        </div>
        {eegData && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{eegData.channelLabels.length} Ch</Badge>
            <Badge variant="outline">{eegData.sampleRate} Hz</Badge>
            <Badge variant="outline">{Math.round(eegData.duration)}s</Badge>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Sidebar - Channel Groups */}
        <div className="w-48 border-r p-3 space-y-3 overflow-y-auto">
          <ChannelGroupList
            channelLabels={eegData?.channelLabels || []}
            visibleGroups={visibleGroups}
            onToggleGroup={handleToggleGroup}
            onSelectAll={handleSelectAllGroups}
            onDeselectAll={handleDeselectAllGroups}
          />
          
          <div className="pt-3 border-t">
            <MontageSelector currentMontage={montage} onMontageChange={setMontage} />
          </div>
        </div>

        {/* Center - EEG Canvas */}
        <div className="flex-1 flex flex-col">
          {/* Controls */}
          <div className="border-b p-2">
            <EEGControls
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={eegData?.duration || 0}
              timeWindow={timeWindow}
              amplitudeScale={amplitudeScale}
              playbackSpeed={playbackSpeed}
              onPlayPause={handlePlayPause}
              onSkipBackward={handleSkipBackward}
              onSkipForward={handleSkipForward}
              onTimeWindowChange={setTimeWindow}
              onAmplitudeScaleChange={setAmplitudeScale}
              onPlaybackSpeedChange={setPlaybackSpeed}
              onTimeChange={setCurrentTime}
              onExport={handleExport}
            />
          </div>

          {/* Viewer */}
          <div className="flex-1 relative">
            {isLoadingEEG ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background">
                <div className="text-center space-y-3">
                  <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                  <p className="text-sm text-muted-foreground">Parsing EEG file...</p>
                  <p className="text-xs text-muted-foreground">This may take a moment for large files</p>
                </div>
              </div>
            ) : loadError ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background">
                <Card className="max-w-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-5 w-5" />
                      Failed to Load EEG
                    </CardTitle>
                    <CardDescription>{loadError}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" onClick={() => window.location.reload()}>
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : eegData ? (
              <WebGLEEGViewer
                signals={eegData.signals}
                channelLabels={eegData.channelLabels}
                sampleRate={eegData.sampleRate}
                currentTime={currentTime}
                timeWindow={timeWindow}
                amplitudeScale={amplitudeScale}
                visibleChannels={visibleChannels}
                theme={theme || "dark"}
                markers={markers}
                onTimeClick={handleTimeClick}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-muted-foreground">No EEG data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Markers */}
        <div className="w-64 border-l p-3 space-y-3 overflow-y-auto">
          <div className="space-y-2">
            <h3 className="font-medium text-sm">Add Marker at {Math.round(currentTime)}s</h3>
            <Select value={newMarkerType} onValueChange={setNewMarkerType}>
              <SelectTrigger className="h-8 text-xs">
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
              className="h-8 text-xs"
            />
            <Textarea
              placeholder="Notes..."
              value={newMarkerNotes}
              onChange={(e) => setNewMarkerNotes(e.target.value)}
              className="text-xs min-h-[60px]"
            />
            <Button
              size="sm"
              className="w-full"
              disabled={!studyId || addMarkerMutation.isPending}
              onClick={() =>
                addMarkerMutation.mutate({
                  timestamp_sec: currentTime,
                  marker_type: newMarkerType,
                  label: newMarkerLabel || undefined,
                  notes: newMarkerNotes || undefined,
                })
              }
            >
              {addMarkerMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add Marker"}
            </Button>
          </div>

          <div className="pt-3 border-t">
            <h3 className="font-medium text-sm mb-2">Markers ({markers.length})</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {markers.map((marker) => (
                <div
                  key={marker.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/50 hover:bg-muted cursor-pointer"
                  onClick={() => handleTimeClick(marker.timestamp_sec)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {marker.marker_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {Math.floor(marker.timestamp_sec / 60)}:{String(Math.floor(marker.timestamp_sec % 60)).padStart(2, "0")}
                      </span>
                    </div>
                    {marker.label && <p className="text-xs truncate mt-1">{marker.label}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMarkerMutation.mutate(marker.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {markers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No markers yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
