// src/pages/admin/AdminReportV0.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Download, ExternalLink, FileText, Activity, Clock, AlertTriangle, Layers } from "lucide-react";
import { fetchJson } from "@/shared/readApiClient";

type Meta = {
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  duration_sec?: number;
  channel_map?: { index: number; canonical_id: string; unit?: string }[];
};

type Segment = {
  t_start_s: number;
  t_end_s: number;
  label: string;
  channel_index?: number | null;
  score?: number | null;
};

type SegmentsResponse = {
  segments: Segment[];
  run_id?: string;
};

type Artifact = {
  start_sec: number;
  end_sec: number;
  label?: string;
  channel?: number;
};

type Annotation = {
  start_sec: number;
  end_sec?: number;
  label?: string;
  channel?: number;
};

const DEFAULT_STUDY_ID = "TUH_CANON_001";

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getNotesKey(studyId: string): string {
  return `enceph.reportv0.notes.${studyId}`;
}

export default function AdminReportV0() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const studyId = searchParams.get("study_id") || DEFAULT_STUDY_ID;
  const [inputStudyId, setInputStudyId] = useState(studyId);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingSegments, setLoadingSegments] = useState(true);
  const [loadingArtifacts, setLoadingArtifacts] = useState(true);
  const [loadingAnnotations, setLoadingAnnotations] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  // Load notes from localStorage on mount or study change
  useEffect(() => {
    const saved = localStorage.getItem(getNotesKey(studyId));
    setNotes(saved || "");
  }, [studyId]);

  // Save notes to localStorage
  const handleNotesChange = (value: string) => {
    setNotes(value);
    localStorage.setItem(getNotesKey(studyId), value);
  };

  // Fetch all data when studyId changes
  useEffect(() => {
    setError(null);
    setLoadingMeta(true);
    setLoadingSegments(true);
    setLoadingArtifacts(true);
    setLoadingAnnotations(true);

    // Fetch meta
    fetchJson<any>(`/studies/${studyId}/meta?root=.`, { timeoutMs: 20000, requireKey: true })
      .then((result) => {
        if (result.ok === false) throw new Error(result.error);
        const m = result.data?.meta ?? result.data;
        setMeta(m as Meta);
      })
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoadingMeta(false));

    // Fetch segments
    fetchJson<SegmentsResponse>(`/studies/${studyId}/segments?root=/app/data`, { timeoutMs: 20000, requireKey: true })
      .then((result) => {
        if (result.ok === false) throw new Error(result.error);
        setSegments(result.data?.segments ?? []);
        setRunId(result.data?.run_id ?? null);
      })
      .catch(() => setSegments([]))
      .finally(() => setLoadingSegments(false));

    // Fetch artifacts
    fetchJson<any>(`/studies/${studyId}/artifacts?root=.`, { timeoutMs: 20000, requireKey: true })
      .then((result) => {
        if (result.ok === false) throw new Error(result.error);
        setArtifacts(result.data?.artifacts ?? []);
      })
      .catch(() => setArtifacts([]))
      .finally(() => setLoadingArtifacts(false));

    // Fetch annotations
    fetchJson<any>(`/studies/${studyId}/annotations?root=.`, { timeoutMs: 20000, requireKey: true })
      .then((result) => {
        if (result.ok === false) throw new Error(result.error);
        setAnnotations(result.data?.annotations ?? []);
      })
      .catch(() => setAnnotations([]))
      .finally(() => setLoadingAnnotations(false));
  }, [studyId]);

  // Derived data
  const durationSec = useMemo(() => {
    if (!meta) return 0;
    return meta.duration_sec ?? meta.n_samples / meta.sampling_rate_hz;
  }, [meta]);

  const totalFlaggedSeconds = useMemo(() => {
    return segments.reduce((acc, seg) => acc + (seg.t_end_s - seg.t_start_s), 0);
  }, [segments]);

  const labelBreakdown = useMemo(() => {
    const counts: Record<string, { count: number; duration: number }> = {};
    for (const seg of segments) {
      if (!counts[seg.label]) {
        counts[seg.label] = { count: 0, duration: 0 };
      }
      counts[seg.label].count++;
      counts[seg.label].duration += seg.t_end_s - seg.t_start_s;
    }
    return Object.entries(counts)
      .map(([label, stats]) => ({ label, ...stats }))
      .sort((a, b) => b.duration - a.duration);
  }, [segments]);

  const channelBreakdown = useMemo(() => {
    const counts: Record<number, { count: number; duration: number }> = {};
    for (const seg of segments) {
      const ch = seg.channel_index ?? -1;
      if (!counts[ch]) {
        counts[ch] = { count: 0, duration: 0 };
      }
      counts[ch].count++;
      counts[ch].duration += seg.t_end_s - seg.t_start_s;
    }
    return Object.entries(counts)
      .map(([ch, stats]) => ({
        channel_index: parseInt(ch, 10),
        channel_id: getChannelId(parseInt(ch, 10)),
        ...stats,
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  }, [segments, meta]);

  const sortedSegments = useMemo(() => {
    return [...segments].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [segments]);

  function getChannelId(idx: number): string {
    if (idx < 0) return "global";
    if (!meta?.channel_map) return `ch${idx}`;
    const ch = meta.channel_map.find((c) => c.index === idx);
    return ch?.canonical_id ?? `ch${idx}`;
  }

  const handleLoadStudy = () => {
    if (inputStudyId.trim()) {
      setSearchParams({ study_id: inputStudyId.trim() });
    }
  };

  const handleOpenInViewer = (seg: Segment) => {
    const params = new URLSearchParams({
      study_id: studyId,
      t: String(seg.t_start_s),
      t_end: String(seg.t_end_s),
      focus: "segment",
      label: seg.label,
    });
    if (seg.channel_index != null) {
      params.set("ch", String(seg.channel_index));
    }
    if (seg.score != null) {
      params.set("score", String(seg.score));
    }
    navigate(`/app/viewer?${params.toString()}`);
  };

  const handleExport = () => {
    const report = {
      schema: "cplane.report.v0",
      generated_at: new Date().toISOString(),
      study_id: studyId,
      run_id: runId,
      meta: meta
        ? {
            sampling_rate_hz: meta.sampling_rate_hz,
            n_channels: meta.n_channels,
            n_samples: meta.n_samples,
            duration_sec: durationSec,
          }
        : null,
      summary: {
        segment_count: segments.length,
        total_flagged_seconds: totalFlaggedSeconds,
        label_breakdown: labelBreakdown,
        top_channels: channelBreakdown,
      },
      segments: sortedSegments.map((seg) => ({
        label: seg.label,
        t_start_s: seg.t_start_s,
        t_end_s: seg.t_end_s,
        duration_s: seg.t_end_s - seg.t_start_s,
        channel_index: seg.channel_index,
        channel_id: getChannelId(seg.channel_index ?? -1),
        score: seg.score,
      })),
      artifacts: artifacts.length,
      annotations: annotations.length,
      clinician_notes: notes,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-v0-${studyId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = loadingMeta || loadingSegments;

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Report v0</h1>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Study ID Input */}
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-md">
          <Label htmlFor="study_id">Study ID</Label>
          <Input
            id="study_id"
            value={inputStudyId}
            onChange={(e) => setInputStudyId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoadStudy()}
            placeholder="TUH_CANON_001"
          />
        </div>
        <Button onClick={handleLoadStudy} disabled={isLoading}>
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Load
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={!meta}>
          <Download className="h-4 w-4 mr-2" />
          Export JSON
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && meta && (
        <>
          {/* Header Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Study: {studyId}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Sample Rate</p>
                  <p className="text-lg font-semibold">{meta.sampling_rate_hz} Hz</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Channels</p>
                  <p className="text-lg font-semibold">{meta.n_channels}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="text-lg font-semibold">{formatDuration(durationSec)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Run ID</p>
                  <p className="text-sm font-mono truncate">{runId || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Segments
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{segments.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Total Flagged
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totalFlaggedSeconds.toFixed(1)}s</p>
                <p className="text-sm text-muted-foreground">
                  {durationSec > 0 ? ((totalFlaggedSeconds / durationSec) * 100).toFixed(1) : 0}% of recording
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Artifacts / Annotations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {loadingArtifacts ? "…" : artifacts.length} / {loadingAnnotations ? "…" : annotations.length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Label Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Breakdown by Label
              </CardTitle>
            </CardHeader>
            <CardContent>
              {labelBreakdown.length === 0 ? (
                <p className="text-muted-foreground">No segments found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Label</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {labelBreakdown.map((row) => (
                      <TableRow key={row.label}>
                        <TableCell>
                          <Badge variant="secondary">{row.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                        <TableCell className="text-right">{row.duration.toFixed(2)}s</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Top Channels */}
          <Card>
            <CardHeader>
              <CardTitle>Top Channels by Flagged Seconds</CardTitle>
            </CardHeader>
            <CardContent>
              {channelBreakdown.length === 0 ? (
                <p className="text-muted-foreground">No segments found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {channelBreakdown.map((row) => (
                      <TableRow key={row.channel_index}>
                        <TableCell className="font-mono">{row.channel_id}</TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                        <TableCell className="text-right">{row.duration.toFixed(2)}s</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Evidence Table */}
          <Card>
            <CardHeader>
              <CardTitle>Evidence (Segments by Score)</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedSegments.length === 0 ? (
                <p className="text-muted-foreground">No segments found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead className="text-right">Start (s)</TableHead>
                        <TableHead className="text-right">End (s)</TableHead>
                        <TableHead className="text-right">Duration (s)</TableHead>
                        <TableHead className="text-right">Ch Index</TableHead>
                        <TableHead>Ch ID</TableHead>
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedSegments.slice(0, 50).map((seg, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge variant="secondary">{seg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">{seg.t_start_s.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono">{seg.t_end_s.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {(seg.t_end_s - seg.t_start_s).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">{seg.channel_index ?? "—"}</TableCell>
                          <TableCell className="font-mono">
                            {getChannelId(seg.channel_index ?? -1)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {seg.score != null ? seg.score.toFixed(3) : "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenInViewer(seg)}
                              className="h-7 px-2"
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {sortedSegments.length > 50 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Showing top 50 of {sortedSegments.length} segments
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Clinician Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Clinician Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Add clinical observations, interpretations, or recommendations..."
                className="min-h-[150px]"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Notes are automatically saved to your browser.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
