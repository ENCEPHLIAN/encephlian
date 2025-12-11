import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserSession } from "@/contexts/UserSessionContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Trash2, AlertCircle, Maximize2, Layers, X, Menu } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";

import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls } from "@/components/eeg/EEGControls";
import { ChannelGroupList } from "@/components/eeg/ChannelGroupList";
import { MontageSelector } from "@/components/eeg/MontageSelector";
import { applyMontage } from "@/lib/eeg/montage-transforms";
import { ChannelGroup, groupChannels } from "@/lib/eeg/channel-groups";
import { filterStandardChannels } from "@/lib/eeg/standard-channels";
import { parseEDF, parseBDF } from "@/lib/eeg/edf-parser";
import { cn } from "@/lib/utils";

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
  const isMobile = useIsMobile();
  const { userId, isAuthenticated } = useUserSession();

  // UI State
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);
  const [isMarkerPanelOpen, setIsMarkerPanelOpen] = useState(false);

  // Playback State - default amplitude to 0.1 (displayed as 1.0x), 60s window, 2x speed
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [timeWindow, setTimeWindow] = useState(60);
  const [amplitudeScale, setAmplitudeScale] = useState(0.1);
  const [playbackSpeed, setPlaybackSpeed] = useState(2);
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

  // Compute visible channels - memoized to prevent unnecessary re-renders
  const visibleChannels = useMemo(() => {
    if (!eegData) return new Set<number>();
    
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
  }, [eegData?.channelLabels, visibleGroups]);

  // Marker input state
  const [newMarkerType, setNewMarkerType] = useState("event");
  const [newMarkerLabel, setNewMarkerLabel] = useState("");
  const [newMarkerNotes, setNewMarkerNotes] = useState("");

  // Fetch most recent study if no studyId provided - only user's own studies
  const { data: recentStudy, isLoading: recentLoading } = useQuery({
    queryKey: ["recent-study", userId],
    enabled: !studyId && isAuthenticated && !!userId,
    queryFn: async () => {
      // Only fetch user's own studies, no sample fallback - RLS handles filtering
      const { data: userStudy, error } = await supabase
        .from("studies")
        .select("*, study_files(*)")
        .eq("owner", userId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return userStudy;
    },
    staleTime: 30000,
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

  const activeStudy = study || recentStudy;
  const isSampleStudy = activeStudy?.sample;

  // Fetch markers
  const { data: markers = [] } = useQuery<Marker[]>({
    queryKey: ["eeg-markers", activeStudy?.id],
    enabled: !!activeStudy?.id && !isSampleStudy,
    queryFn: async () => {
      if (!activeStudy?.id) return [];
      const { data, error } = await supabase
        .from("eeg_markers")
        .select("*")
        .eq("study_id", activeStudy.id)
        .order("timestamp_sec", { ascending: true });
      if (error) throw error;
      return (data || []) as Marker[];
    },
  });

  // EEG loading logic
  useEffect(() => {
    if (!activeStudy) return;

    const loadEEGData = async () => {
      setIsLoadingEEG(true);
      setLoadError(null);

      try {
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

        const studyFiles = (activeStudy.study_files as any[]) || [];
        const edfFile = studyFiles.find((f) =>
          f.kind === "edf" || f.kind === "bdf" || f.kind === "eeg_raw" || f.kind === "raw" ||
          f.path?.toLowerCase().endsWith('.edf') || f.path?.toLowerCase().endsWith('.bdf')
        );

        const filePath = edfFile?.path || activeStudy.uploaded_file_path;

        if (!filePath) {
          throw new Error("No EDF/BDF file found for this study");
        }

        toast.info("Loading EEG file...");

        const bucketsToTry = ["eeg-uploads", "eeg-raw"];
        let fileBlob: Blob | null = null;
        let lastError: string | null = null;

        for (const bucket of bucketsToTry) {
          const { data, error } = await supabase.storage.from(bucket).download(filePath);
          if (data && !error) {
            fileBlob = data;
            break;
          }
          lastError = error?.message || "Unknown error";
        }

        if (!fileBlob) {
          throw new Error(`Failed to download EDF file: ${lastError}`);
        }

        const buffer = await fileBlob.arrayBuffer();
        const isBDF = filePath?.toLowerCase().endsWith('.bdf') || edfFile?.kind === 'bdf';
        
        toast.info("Parsing EEG signals...");
        
        const parsed = isBDF ? parseBDF(buffer) : parseEDF(buffer);

        const maxDuration = 600;
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

  // Playback loop
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

  // Marker mutations
  const addMarkerMutation = useMutation({
    mutationFn: async (payload: { timestamp_sec: number; marker_type: string; label?: string; notes?: string }) => {
      if (!activeStudy?.id || isSampleStudy) throw new Error("Cannot add markers to sample study");
      if (!userId) throw new Error("Not authenticated");

      const { error } = await supabase.from("eeg_markers").insert({
        study_id: activeStudy.id,
        user_id: userId,
        timestamp_sec: payload.timestamp_sec,
        marker_type: payload.marker_type,
        label: payload.label ?? null,
        notes: payload.notes ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      if (activeStudy?.id) queryClient.invalidateQueries({ queryKey: ["eeg-markers", activeStudy.id] });
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
      if (activeStudy?.id) queryClient.invalidateQueries({ queryKey: ["eeg-markers", activeStudy.id] });
      toast.success("Marker deleted");
    },
    onError: (error: any) => toast.error(`Failed to delete marker: ${error.message}`),
  });

  // Controls handlers - smooth animated skip in seconds (10s)
  const handlePlayPause = () => setIsPlaying((prev) => !prev);
  
  // Smooth animated time transition
  const animateToTime = useCallback((targetTime: number) => {
    if (!eegData) return;
    const clampedTarget = Math.max(0, Math.min(eegData.duration - timeWindow, targetTime));
    
    // Smooth animation over 300ms
    const startTime = currentTime;
    const startTimestamp = performance.now();
    const duration = 300;
    
    const animate = (timestamp: number) => {
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const newTime = startTime + (clampedTarget - startTime) * eased;
      setCurrentTime(newTime);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }, [eegData, timeWindow, currentTime]);
  
  const handleSkipBackward = () => animateToTime(currentTime - 10); // 10 seconds smooth
  const handleSkipForward = () => animateToTime(currentTime + 10); // 10 seconds smooth

  const handleTimeClick = useCallback((time: number) => {
    if (!eegData) return;
    const clampedTime = Math.max(0, Math.min(eegData.duration - timeWindow, time - timeWindow / 2));
    setCurrentTime(clampedTime);
  }, [eegData, timeWindow]);

  const handleExport = useCallback(() => {
    if (!activeStudy?.id || isSampleStudy) {
      toast.error("Cannot export from sample study.");
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
    a.download = `eeg_annotations_${activeStudy.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Annotations exported as JSON");
  }, [markers, activeStudy, isSampleStudy]);

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

  // Loading views
  if (studyLoading || recentLoading) {
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
            <CardTitle>No Studies Found</CardTitle>
            <CardDescription>Upload an EEG file to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/app/studies">
              <Button>Go to Studies</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const EEGViewerContent = ({ isModal = false }: { isModal?: boolean }) => (
    <div className={cn("relative w-full h-full", isModal ? "min-h-[60vh]" : "")}>
      {isLoadingEEG ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Parsing EEG file...</p>
          </div>
        </div>
      ) : loadError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full">
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
  );

  return (
    <div className="h-[calc(100vh-4rem)] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/50 px-3 py-2 flex items-center gap-2 shrink-0">
        <Link to="/app/studies">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">EEG Viewer</h1>
          <p className="text-xs text-muted-foreground truncate">
            {isSampleStudy ? "Sample Study" : `Study: ${activeStudy.id?.slice(0, 8)}...`}
          </p>
        </div>
        
        {/* Header badges - hidden on very small screens */}
        {eegData && (
          <div className="hidden sm:flex items-center gap-1">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{eegData.channelLabels.length} Ch</Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{eegData.sampleRate} Hz</Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 hidden md:inline-flex">{Math.round(eegData.duration)}s</Badge>
          </div>
        )}

        {/* Mobile menu button */}
        {isMobile && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => setIsMarkerPanelOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
        )}

        {/* Channel Groups Dropdown */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Layers className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Channel groups & montage</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56 p-2">
            <DropdownMenuLabel className="text-xs">Channel Groups</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(["frontal", "central", "temporal", "occipital"] as const).map((group) => (
              <DropdownMenuItem 
                key={group}
                className="flex items-center justify-between cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  handleToggleGroup(group);
                }}
              >
                <span className="capitalize">{group}</span>
                <div className={cn(
                  "h-3 w-3 rounded-full border",
                  visibleGroups.has(group) 
                    ? "bg-primary border-primary" 
                    : "bg-transparent border-muted-foreground/50"
                )} />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSelectAllGroups} className="text-xs">
              Show All
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDeselectAllGroups} className="text-xs">
              Hide All
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Montage</DropdownMenuLabel>
            {["referential", "bipolar-longitudinal", "bipolar-transverse"].map((m) => (
              <DropdownMenuItem 
                key={m}
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setMontage(m)}
              >
                <span className="text-xs capitalize">{m.replace(/-/g, " ")}</span>
                {montage === m && <div className="h-2 w-2 rounded-full bg-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* EEG Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Controls - responsive */}
          <div className="border-b border-border/50 p-2 shrink-0 overflow-x-auto">
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

          {/* Viewer - with fullscreen button inside */}
          <div className="flex-1 relative">
            <EEGViewerContent />
            {/* Fullscreen Modal Button - inside the EEG canvas area, bottom right */}
            <button
              onClick={() => setIsFullscreenOpen(true)}
              className={cn(
                "absolute z-30 h-10 w-10 rounded-xl flex items-center justify-center",
                "bg-background/30 backdrop-blur-md",
                "border border-white/10 dark:border-white/5",
                "shadow-lg shadow-black/10 dark:shadow-black/20",
                "hover:bg-background/50 hover:scale-105",
                "transition-all duration-300 ease-out",
                isMobile ? "bottom-2 right-2" : "bottom-3 right-3"
              )}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Right Sidebar - Markers (hidden on mobile, use modal instead) */}
        {!isMobile && (
          <div className="w-56 lg:w-64 border-l border-border/50 p-3 overflow-y-auto shrink-0">
            <h3 className="font-semibold text-sm mb-3">Markers</h3>
            
            {!isSampleStudy && (
              <div className="space-y-2 mb-4 p-3 bg-muted/30 rounded-lg">
                <Select value={newMarkerType} onValueChange={setNewMarkerType}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="spike">Spike</SelectItem>
                    <SelectItem value="seizure">Seizure</SelectItem>
                    <SelectItem value="artifact">Artifact</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Label..."
                  value={newMarkerLabel}
                  onChange={(e) => setNewMarkerLabel(e.target.value)}
                  className="h-8 text-xs"
                />
                <Textarea
                  placeholder="Notes..."
                  value={newMarkerNotes}
                  onChange={(e) => setNewMarkerNotes(e.target.value)}
                  className="text-xs min-h-[50px]"
                />
                <Button
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() =>
                    addMarkerMutation.mutate({
                      timestamp_sec: currentTime,
                      marker_type: newMarkerType,
                      label: newMarkerLabel || undefined,
                      notes: newMarkerNotes || undefined,
                    })
                  }
                  disabled={addMarkerMutation.isPending}
                >
                  Add at {currentTime.toFixed(1)}s
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {markers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No markers</p>
              ) : (
                markers.map((m) => (
                  <div
                    key={m.id}
                    className="p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleTimeClick(m.timestamp_sec)}
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">
                        {m.marker_type}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {m.timestamp_sec.toFixed(1)}s
                        </span>
                        {!isSampleStudy && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMarkerMutation.mutate(m.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {m.label && <p className="text-xs font-medium mt-1">{m.label}</p>}
                    {m.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{m.notes}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Markers Modal */}
      <Dialog open={isMarkerPanelOpen} onOpenChange={setIsMarkerPanelOpen}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Markers</DialogTitle>
          </DialogHeader>
          {!isSampleStudy && (
            <div className="space-y-2 mb-4 p-3 bg-muted/30 rounded-lg">
              <Select value={newMarkerType} onValueChange={setNewMarkerType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="spike">Spike</SelectItem>
                  <SelectItem value="seizure">Seizure</SelectItem>
                  <SelectItem value="artifact">Artifact</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Label..."
                value={newMarkerLabel}
                onChange={(e) => setNewMarkerLabel(e.target.value)}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() =>
                  addMarkerMutation.mutate({
                    timestamp_sec: currentTime,
                    marker_type: newMarkerType,
                    label: newMarkerLabel || undefined,
                    notes: newMarkerNotes || undefined,
                  })
                }
                disabled={addMarkerMutation.isPending}
              >
                Add at {currentTime.toFixed(1)}s
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {markers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No markers</p>
            ) : (
              markers.map((m) => (
                <div
                  key={m.id}
                  className="p-2 bg-muted/30 rounded cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    handleTimeClick(m.timestamp_sec);
                    setIsMarkerPanelOpen(false);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">
                      {m.marker_type}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {m.timestamp_sec.toFixed(1)}s
                    </span>
                  </div>
                  {m.label && <p className="text-xs font-medium mt-1">{m.label}</p>}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Modal - waveforms only, no player */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent 
          className={cn(
            "p-0 rounded-2xl overflow-hidden",
            "bg-background/95 backdrop-blur-2xl",
            "border border-border/20",
            "shadow-2xl shadow-black/30",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            "data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4",
            isMobile 
              ? "max-w-[98vw] max-h-[95vh] w-[98vw] h-[92vh]" 
              : "max-w-[94vw] max-h-[90vh] w-[94vw] h-[88vh]",
            "[&>button]:hidden" // Hide default close button
          )}
          onClick={(e) => {
            // Close when clicking outside content
            if (e.target === e.currentTarget) {
              setIsFullscreenOpen(false);
            }
          }}
        >
          <div className="flex flex-col h-full" onClick={(e) => e.stopPropagation()}>
            {/* Header with study info */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-background/50">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium truncate">
                  {activeStudy?.meta && (activeStudy.meta as any).patient_name 
                    ? (activeStudy.meta as any).patient_name 
                    : `Study ${activeStudy?.id?.slice(0, 8) || ""}`}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {activeStudy?.created_at 
                    ? new Date(activeStudy.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
                    : ""}
                  {eegData ? ` • ${eegData.channelLabels.length} channels • ${eegData.sampleRate}Hz` : ""}
                </p>
              </div>
              {/* Subtle amplitude controls with click+hold */}
              <div className="flex items-center gap-1.5 mr-3">
                <button
                  className="h-6 w-6 rounded border border-border/30 bg-background/50 hover:bg-muted/50 flex items-center justify-center transition-all duration-150 text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95"
                  onMouseDown={() => {
                    setAmplitudeScale(Math.max(0.001, amplitudeScale - 0.001));
                    const interval = setInterval(() => {
                      setAmplitudeScale(prev => Math.max(0.001, prev - 0.001));
                    }, 80);
                    const cleanup = () => { clearInterval(interval); window.removeEventListener('mouseup', cleanup); };
                    window.addEventListener('mouseup', cleanup);
                  }}
                  title="Decrease amplitude (hold for continuous)"
                >
                  <span className="text-xs">−</span>
                </button>
                <span className="text-[10px] font-mono text-muted-foreground min-w-[48px] text-center">
                  {amplitudeScale.toFixed(3)}x
                </span>
                <button
                  className="h-6 w-6 rounded border border-border/30 bg-background/50 hover:bg-muted/50 flex items-center justify-center transition-all duration-150 text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95"
                  onMouseDown={() => {
                    setAmplitudeScale(amplitudeScale + 0.001);
                    const interval = setInterval(() => {
                      setAmplitudeScale(prev => prev + 0.001);
                    }, 80);
                    const cleanup = () => { clearInterval(interval); window.removeEventListener('mouseup', cleanup); };
                    window.addEventListener('mouseup', cleanup);
                  }}
                  title="Increase amplitude (hold for continuous)"
                >
                  <span className="text-xs">+</span>
                </button>
              </div>
              {/* Subtle X close button */}
              <button
                onClick={() => setIsFullscreenOpen(false)}
                className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Waveforms only - no player controls */}
            <div className="flex-1 relative bg-background/80 backdrop-blur-sm">
              <EEGViewerContent isModal />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
