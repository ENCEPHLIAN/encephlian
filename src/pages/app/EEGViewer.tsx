import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
  const [searchParams] = useSearchParams();
  const studyId = id || searchParams.get('studyId');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [selectedStudyId, setSelectedStudyId] = useState<string>("");

  const [markerType, setMarkerType] = useState<string>("annotation");
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerNotes, setMarkerNotes] = useState("");
  const [markerSeverity, setMarkerSeverity] = useState<string>("");

  const { data: availableStudies } = useQuery({
    queryKey: ["available-studies"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("studies").select("id, meta, state, sample, created_at").or(`owner.eq.${user.id},sample.eq.true`).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: study, isLoading } = useQuery({
    queryKey: ["study", studyId],
    queryFn: async () => {
      if (!studyId) return null;
      const { data, error } = await supabase.from("studies").select("*, study_files(*)").eq("id", studyId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!studyId,
  });

  const { data: markers = [] } = useQuery({
    queryKey: ["markers", studyId],
    queryFn: async () => {
      if (!studyId) return [];
      const { data, error } = await supabase.from("eeg_markers").select("*").eq("study_id", studyId).order("timestamp_sec");
      if (error) throw error;
      return data as Marker[];
    },
    enabled: !!studyId,
  });

  const addMarkerMutation = useMutation({
    mutationFn: async (markerData: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("eeg_markers").insert({ study_id: studyId, user_id: user.id, ...markerData });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["markers", studyId] }); toast.success("Marker added"); setMarkerLabel(""); setMarkerNotes(""); setMarkerSeverity(""); },
    onError: () => toast.error("Failed to add marker"),
  });

  const deleteMarkerMutation = useMutation({
    mutationFn: async (markerId: string) => { const { error } = await supabase.from("eeg_markers").delete().eq("id", markerId); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["markers", studyId] }); toast.success("Marker deleted"); },
  });

  useEffect(() => {
    if (!waveformRef.current || !study || !studyId) return;
    
    const loadEEGFile = async () => {
      try {
        let fileUrl = '/sample-eeg/S094R10.edf';
        
        if (study.study_files && study.study_files.length > 0) {
          const edfFile = study.study_files.find((f: any) => f.kind === 'edf');
          
          if (edfFile) {
            // For sample studies, use the public path directly
            if (study.sample) {
              fileUrl = `/${edfFile.path}`;
            } else {
              // For user studies, get the signed URL from storage
              const { data } = await supabase.storage
                .from('eeg-raw')
                .createSignedUrl(edfFile.path, 3600);
              
              if (data?.signedUrl) {
                fileUrl = data.signedUrl;
              }
            }
          }
        }
        
        const ws = WaveSurfer.create({ 
          container: waveformRef.current!, 
          waveColor: 'hsl(var(--primary))', 
          progressColor: 'hsl(var(--primary-foreground))', 
          cursorColor: 'hsl(var(--accent))', 
          height: 120, 
          normalize: true, 
          interact: true,
          backend: 'WebAudio'
        });
        
        wavesurferRef.current = ws;
        ws.on('ready', () => setDuration(ws.getDuration()));
        ws.on('timeupdate', (time) => setCurrentTime(time));
        ws.on('play', () => setIsPlaying(true));
        ws.on('pause', () => setIsPlaying(false));
        
        await ws.load(fileUrl);
        toast.success('EEG file loaded successfully');
      } catch (error) { 
        console.error('EEG load error:', error);
        toast.error('Failed to load EEG file'); 
      }
    };
    
    loadEEGFile();
    return () => { if (wavesurferRef.current) wavesurferRef.current.destroy(); };
  }, [study, studyId]);

  const handlePlayPause = () => { if (wavesurferRef.current) wavesurferRef.current.playPause(); };
  const handleAddMarker = () => {
    if (!markerType || !markerLabel) { toast.error("Please fill in marker type and label"); return; }
    addMarkerMutation.mutate({ timestamp_sec: currentTime, marker_type: markerType, label: markerLabel, notes: markerNotes || null, severity: markerSeverity || null, channel: null, duration_sec: null });
  };
  const formatTime = (seconds: number) => { const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins}:${secs.toString().padStart(2, '0')}`; };

  if (!studyId) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">EEG Viewer</h1>
              <p className="text-muted-foreground">Select a study to begin analysis</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/app/studies')}>
              Back to Studies
            </Button>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Select Study</CardTitle>
              <CardDescription>Choose from your studies or sample data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedStudyId} onValueChange={(value) => { 
                setSelectedStudyId(value); 
                navigate(`/app/viewer?studyId=${value}`); 
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a study..." />
                </SelectTrigger>
                <SelectContent>
                  {availableStudies?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <div className="flex items-center gap-2">
                        {s.sample && <Badge variant="secondary">Sample</Badge>}
                        <span>{(s.meta as any)?.patient_name || 'Unknown'} - {(s.meta as any)?.patient_id || 'N/A'}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableStudies?.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No studies available. Upload a study or check out the sample data.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) return (<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);
  if (!study) return (<div className="min-h-screen bg-background p-6"><Card><CardContent className="pt-6"><p className="text-center text-muted-foreground">Study not found</p><Button variant="outline" onClick={() => navigate("/app/viewer")} className="mt-4 mx-auto block">Back to Study Selector</Button></CardContent></Card></div>);

  const patientMeta = study.meta as any;
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate("/app/viewer")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{patientMeta?.patient_name || 'Unknown Patient'}</h1>
                  {study.sample && <Badge variant="secondary">Sample</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">Patient ID: {patientMeta?.patient_id || 'N/A'}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/app/studies')}>
                View All Studies
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>EEG Waveform</CardTitle>
            <CardDescription>
              {patientMeta?.indication || 'No indication specified'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div ref={waveformRef} className="w-full" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button onClick={handlePlayPause} size="sm" variant="outline">
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Add Marker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Timestamp</Label>
                <Input value={formatTime(currentTime)} disabled />
              </div>
              <div>
                <Label htmlFor="markerType">Type</Label>
                <Select value={markerType} onValueChange={setMarkerType}>
                  <SelectTrigger id="markerType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annotation">Annotation</SelectItem>
                    <SelectItem value="artifact">Artifact</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="seizure">Seizure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="markerLabel">Label</Label>
                <Input 
                  id="markerLabel" 
                  value={markerLabel} 
                  onChange={(e) => setMarkerLabel(e.target.value)} 
                  placeholder="e.g., Eye movement artifact" 
                />
              </div>
              <div>
                <Label htmlFor="markerNotes">Notes</Label>
                <Textarea 
                  id="markerNotes" 
                  value={markerNotes} 
                  onChange={(e) => setMarkerNotes(e.target.value)} 
                  rows={3} 
                />
              </div>
              <Button onClick={handleAddMarker} disabled={addMarkerMutation.isPending} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Marker
              </Button>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Markers ({markers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {markers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No markers yet</p>
                ) : (
                  markers.map((marker) => (
                    <div key={marker.id} className="flex items-start justify-between p-3 border border-border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline">{marker.marker_type}</Badge>
                          <span className="text-sm font-medium">{marker.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">@ {formatTime(marker.timestamp_sec)}</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteMarkerMutation.mutate(marker.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
