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
import { Loader2, ArrowLeft, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";

import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { ChannelGroupList } from "@/components/eeg/ChannelGroupList";
import { MontageSelector } from "@/components/eeg/MontageSelector";
import { applyMontage } from "@/lib/eeg/montage-transforms";
import { ChannelGroup, groupChannels } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";

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
    new Set(["frontal", "central", "temporal", "occipital"]),
  );

  // Compute visible channels based on selected groups
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

  // Fetch available studies (for future nav / context)
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

      const { data, error } = await supabase.from("studies").select("*, study_files(*)").eq("id", studyId).single();

      if (error) throw error;
      return data;
    },
  });

  // Active study = selected or sample
  const activeStudy = study || sampleStudy;
  const isSampleStudy = !studyId && activeStudy?.sample;

  // Fetch markers for this study
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

  // ---------- EEG loading logic (sample + real uploads) ----------

  useEffect(() => {
    if (!activeStudy || !activeStudy.study_files?.length) return;

    const loadEEGData = async () => {
      try {
        // SAMPLE STUDY: local JSON
        if (activeStudy.sample) {
          const jsonPath = "/sample-eeg/S094R10.json";
          const response = await fetch(jsonPath);
          if (!response.ok) throw new Error("Failed to fetch sample data");

          const parsedData = await response.json();

          // Generate full 64-channel dataset from 2 sample channels (your existing hack)
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

        // USER STUDY: go via parse_eeg_study + eeg-json bucket
        const studyFiles = activeStudy.study_files as any[];

        // 1) Do we already have a parsed JSON file for this study?
        let jsonFile = studyFiles.find((f) => f.kind === "json");
        let jsonPath: string | undefined = jsonFile?.path;

        // 2) If not, trigger edge function to parse the uploaded EDF
        if (!jsonPath) {
          // Find EDF or BDF file - also check for legacy 'eeg_raw' kind
          const edfFile = studyFiles.find((f) => 
            f.kind === "edf" || f.kind === "bdf" || f.kind === "eeg_raw"
          );
          if (!edfFile) {
            throw new Error("No EDF/BDF file found for this study.");
          }

          // Determine file type from kind or path
          const fileType = edfFile.kind === "bdf" || edfFile.path?.toLowerCase().endsWith('.bdf') 
            ? "bdf" : "edf";
          
          const { data, error } = await supabase.functions.invoke("parse_eeg_study", {
            body: {
              study_id: activeStudy.id,
              file_path: edfFile.path,
              file_type: fileType,
            },
          });

          if (error) {
            throw error;
          }

          jsonPath = (data as any)?.json_path;
          if (!jsonPath) {
            throw new Error("parse_eeg_study did not return json_path. Check edge function.");
          }
        }

        // 3) Download parsed JSON from eeg-json bucket
        const { data: jsonBlob, error: downloadError } = await supabase.storage.from("eeg-json").download(jsonPath!);

        if (downloadError || !jsonBlob) {
          throw new Error(`Failed to download parsed EEG JSON: ${downloadError?.message || "unknown error"}`);
        }

        const text = await jsonBlob.text();
        const parsed = JSON.parse(text);

        // Expectation for "full" parser (future):
        // {
        //   signals: number[][],
        //   channelLabels: string[],
        //   sampleRate: number,
        //   duration: number,
        //   ...metadata
        // }

        if (parsed.signals && parsed.channelLabels) {
          setRawEegData({
            signals: parsed.signals,
            channelLabels: parsed.channelLabels,
            sampleRate: parsed.sampleRate ?? parsed.sample_rate ?? 256,
            duration: parsed.duration ?? parsed.duration_sec ?? 0,
          });
          toast.success("EEG study loaded");
          return;
        }

        // Current parse_eeg_study only writes metadata; no samples.
        // We synthesize flat signals as placeholders so the viewer doesn't explode.
        const nChannels = Array.isArray(parsed.channels) ? parsed.channels.length : 0;
        const sampleRate = parsed.sample_rate ?? 256;
        const durationSec = parsed.duration_sec ?? 0;
        const totalSamples = sampleRate * durationSec;

        if (!nChannels || !totalSamples) {
          throw new Error("Parsed EEG JSON has no signals and insufficient metadata to synthesize placeholders.");
        }

        const signals = Array.from({ length: nChannels }, () => new Array(totalSamples).fill(0));
        const channelLabels =
          parsed.channels?.map((c: any) => c.name) ?? Array.from({ length: nChannels }, (_, i) => `Ch ${i + 1}`);

        setRawEegData({
          signals,
          channelLabels,
          sampleRate,
          duration: durationSec,
        });

        toast.warning(
          "Parsed EEG contains metadata only – rendering flat traces as placeholders. Extend parse_eeg_study to include signals when ready.",
        );
      } catch (error: any) {
        console.error("Error loading EEG:", error);
        toast.error(`Failed to load EEG data: ${error.message}`);
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

  type AddMarkerPayload = {
    timestamp_sec: number;
    marker_type: string;
    label?: string;
    notes?: string;
  };

  const addMarkerMutation = useMutation({
    mutationFn: async (payload: AddMarkerPayload) => {
      if (!studyId) throw new Error("No study selected");

      const {
        data: { user },
      } = await supabase.auth.getUser();
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
      if (studyId) {
        queryClient.invalidateQueries({ queryKey: ["eeg-markers", studyId] });
      }
      setNewMarkerLabel("");
      setNewMarkerNotes("");
      toast.success("Marker added");
    },
    onError: (error: any) => {
      toast.error(`Failed to add marker: ${error.message}`);
    },
  });

  const deleteMarkerMutation = useMutation({
    mutationFn: async (markerId: string) => {
      const { error } = await supabase.from("eeg_markers").delete().eq("id", markerId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (studyId) {
        queryClient.invalidateQueries({ queryKey: ["eeg-markers", studyId] });
      }
      toast.success("Marker deleted");
    },
    onError: (error: any) => {
      toast.error(`Failed to delete marker: ${error.message}`);
    },
  });

  // ---------- Controls handlers ----------

  const handlePlayPause = () => setIsPlaying((prev) => !prev);

  const handleSkipBackward = () => setCurrentTime((prev) => Math.max(0, prev - timeWindow));

  const handleSkipForward = () => {
    if (!eegData) return;
    setCurrentTime((prev) => Math.min(eegData.duration - timeWindow, prev + timeWindow));
  };

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

    const blob = new Blob([JSON.stringify(annotations, null, 2)], {
      type: "application/json",
    });
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

  const handleSelectAllGroups = () => {
    setVisibleGroups(new Set(["frontal", "central", "temporal", "occipital"]));
  };

  const handleDeselectAllGroups = () => {
    setVisibleGroups(new Set());
  };

  // ---------- Loading / fallback views ----------

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
                {(activeStudy.meta as any)?.patient_name || "Unnamed Study"} -{" "}
                {new Date(activeStudy.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Export action */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!markers.length}>
              Export JSON
            </Button>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Left Sidebar - Channel Groups */}
          <div className="lg:col-span-1">
            <ChannelGroupList
              channelLabels={eegData?.channelLabels || []}
              visibleGroups={visibleGroups}
              onToggleGroup={handleToggleGroup}
              onSelectAll={handleSelectAllGroups}
              onDeselectAll={handleDeselectAllGroups}
            />
          </div>

          {/* Main Area */}
          <div className="lg:col-span-3 space-y-4">
            {/* Quick Triage Panel */}
            {eegData && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                <div className="flex items-center gap-4">
                  <Badge variant="outline">
                    Duration: {Math.floor(eegData.duration / 60)}:
                    {Math.floor(eegData.duration % 60)
                      .toString()
                      .padStart(2, "0")}
                  </Badge>
                  <Badge variant="outline">
                    Channels: {visibleChannels.size} / {filterStandardChannels(eegData.channelLabels).length}
                  </Badge>
                  <Badge variant="outline">
                    Montage: {montage.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
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

            {/* Montage + Add Marker */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MontageSelector currentMontage={montage} onMontageChange={setMontage} />

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
                    onClick={() =>
                      addMarkerMutation.mutate({
                        timestamp_sec: currentTime,
                        marker_type: newMarkerType,
                        label: newMarkerLabel || undefined,
                        notes: newMarkerNotes || undefined,
                      })
                    }
                    disabled={addMarkerMutation.isPending || !studyId}
                    size="sm"
                    className="w-full"
                  >
                    {addMarkerMutation.isPending && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
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
                    {markers.map((marker) => (
                      <div
                        key={marker.id}
                        className="flex items-start justify-between p-2 bg-muted rounded border border-border hover:bg-accent/50 transition-colors"
                      >
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setCurrentTime(marker.timestamp_sec || 0)}
                        >
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
