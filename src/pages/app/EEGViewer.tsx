// src/pages/app/EEGViewer.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, X, ChevronLeft, ChevronRight, ArrowLeft, WifiOff, Zap } from "lucide-react";
import { WebGLEEGViewer } from "@/components/eeg/WebGLEEGViewer";
import { EEGControls, windowSecToMmSec, scaleToUVMM } from "@/components/eeg/EEGControls";
import { SegmentSidebar, getSegmentColor } from "@/components/eeg/SegmentSidebar";
import { useTheme } from "next-themes";
import { fetchJson, fetchBinary } from "@/shared/readApiClient";
import { resolveReadApiBase } from "@/shared/readApiConfig";
import { supabase } from "@/integrations/supabase/client";
import { EdfChunkReader } from "@/lib/eeg/edf-reader";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────
// If the resolved API base is a local address, skip the key requirement.
// If it's a remote URL (Azure prod), require key or Supabase proxy.
const _apiBase = resolveReadApiBase();
const FETCH_REQUIRE_KEY =
  !_apiBase.includes("127.0.0.1") && !_apiBase.includes("localhost");

// ── Types ──────────────────────────────────────────────────────────────────────
type Meta = {
  n_channels: number;
  sampling_rate_hz: number;
  n_samples: number;
  channel_map: { index: number; canonical_id: string; unit: string }[];
  channel_names?: string[];
  channels?: { name: string }[];
};
type Artifact   = { start_sec: number; end_sec: number; label?: string; artifact_type?: string; channel?: number };
type Annotation = { start_sec: number; end_sec?: number; label?: string; channel?: number };
type Marker     = { id: string; timestamp_sec: number; marker_type: string; label?: string };
type Segment    = { t_start_s: number; t_end_s: number; label: string; channel_index?: number | null; score?: number | null };
type FocusedSeg = { label: string; t_start_s: number; t_end_s: number; channel_index?: number; score?: number };

// ── Artifact type color map ────────────────────────────────────────────────────
const ARTIFACT_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  eye_movement:    { bg: "rgba(139,92,246,0.18)",  border: "rgba(139,92,246,0.60)", label: "Eye"      },
  muscle:          { bg: "rgba(249,115,22,0.18)",  border: "rgba(249,115,22,0.60)", label: "Muscle"   },
  electrode_noise: { bg: "rgba(234,179,8,0.18)",   border: "rgba(234,179,8,0.60)",  label: "Noise"    },
  artifact:        { bg: "rgba(239,68,68,0.18)",   border: "rgba(239,68,68,0.55)",  label: "Artifact" },
};
function artifactColor(t?: string) {
  return ARTIFACT_COLORS[t ?? "artifact"] ?? ARTIFACT_COLORS.artifact;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function keyFor(s: number, l: number) { return `${s}:${l}`; }
function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

function reshapeChannelMajor(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  for (let ch = 0; ch < nCh; ch++) {
    const base = ch * nSamp;
    for (let i = 0; i < nSamp; i++) out[ch][i] = f32[base + i];
  }
  return out;
}
function reshapeSampleMajor(f32: Float32Array, nCh: number, nSamp: number): number[][] {
  const out: number[][] = Array.from({ length: nCh }, () => new Array(nSamp));
  let p = 0;
  for (let i = 0; i < nSamp; i++) for (let ch = 0; ch < nCh; ch++) out[ch][i] = f32[p++];
  return out;
}
function scoreContinuity(ch: number[][], n = 2048) {
  if (!ch.length) return Infinity;
  const ns = Math.min(ch[0]?.length ?? 0, n);
  if (ns < 8) return Infinity;
  const idxs = [0, Math.floor(ch.length / 2), ch.length - 1].filter((x, i, a) => x >= 0 && a.indexOf(x) === i);
  let acc = 0;
  for (const ci of idxs) { let s = 0; for (let i = 1; i < ns; i++) s += Math.abs(ch[ci][i] - ch[ci][i - 1]); acc += s / (ns - 1); }
  return acc / idxs.length;
}
function reshapeAuto(f32: Float32Array, nCh: number, nSamp: number) {
  const a = reshapeChannelMajor(f32, nCh, nSamp);
  const b = reshapeSampleMajor(f32, nCh, nSamp);
  return scoreContinuity(a) <= scoreContinuity(b) ? a : b;
}
function hdrNum(h: Record<string, string>, keys: string[]) {
  for (const k of keys) { const v = Number(h[k.toLowerCase()]); if (isFinite(v)) return v; }
  return NaN;
}
function fetchChunk(studyId: string, start: number, len: number) {
  return fetchBinary(
    `/studies/${encodeURIComponent(studyId)}/chunk.bin?root=.&start=${start}&length=${len}`,
    { timeoutMs: 30000, requireKey: FETCH_REQUIRE_KEY },
  );
}

/** Raw EDF bytes: Edge proxies blob (fixes Azure Storage CORS "Failed to fetch"); falls back to C-Plane + SAS in dev. */
async function downloadRawEdfBuffer(studyId: string): Promise<ArrayBuffer> {
  const supabaseUrl = String((import.meta as any).env?.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = String((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

  const viaEdge = async (): Promise<ArrayBuffer> => {
    if (!supabaseUrl || !anon) throw new Error("Supabase URL/key not configured");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not signed in");
    const url = `${supabaseUrl}/functions/v1/read_raw_edf?study_id=${encodeURIComponent(studyId)}`;
    const res = await fetch(url, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const buf = await res.arrayBuffer();
    if (!res.ok) {
      let msg = `read_raw_edf HTTP ${res.status}`;
      try {
        const t = new TextDecoder().decode(buf.slice(0, 4096));
        const j = JSON.parse(t) as { error?: string; detail?: string; hint?: string };
        if (j.detail || j.error) msg = [j.error, j.detail, j.hint].filter(Boolean).join(" — ");
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return buf;
  };

  const viaCplaneDirect = async (): Promise<ArrayBuffer> => {
    const CPLANE_BASE = String((import.meta as any).env?.VITE_CPLANE_BASE || "").replace(/\/+$/, "");
    if (!CPLANE_BASE) throw new Error("VITE_CPLANE_BASE not set");
    const tokenRes = await fetch(`${CPLANE_BASE}/read-token/${encodeURIComponent(studyId)}`);
    if (!tokenRes.ok) throw new Error(`read-token failed (${tokenRes.status})`);
    const { sas_url: sasUrl } = await tokenRes.json() as { sas_url?: string };
    if (!sasUrl) throw new Error("read-token: no sas_url");
    const res = await fetch(sasUrl);
    if (!res.ok) throw new Error(`EDF fetch ${res.status}`);
    return await res.arrayBuffer();
  };

  try {
    return await viaEdge();
  } catch (e1) {
    try {
      return await viaCplaneDirect();
    } catch (e2) {
      const m1 = e1 instanceof Error ? e1.message : String(e1);
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`${m1}${m2 && m2 !== m1 ? ` · direct: ${m2}` : ""}`);
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function EEGViewer() {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: routeId } = useParams<{ id?: string }>();

  // Study ID: route param → ?studyId= query param
  const studyId = routeId || searchParams.get("studyId") || "";

  // Focused segment from URL
  const focusedSeg = useMemo<FocusedSeg | null>(() => {
    if (searchParams.get("focus") !== "segment") return null;
    const t = parseFloat(searchParams.get("t") ?? "");
    const label = searchParams.get("label");
    if (!isFinite(t) || !label) return null;
    const t_end = parseFloat(searchParams.get("t_end") ?? "");
    return {
      label, t_start_s: t, t_end_s: isFinite(t_end) ? t_end : t,
      channel_index: searchParams.get("ch") ? parseInt(searchParams.get("ch")!) : undefined,
      score: searchParams.get("score") ? parseFloat(searchParams.get("score")!) : undefined,
    };
  }, [searchParams]);

  // ── Core state ───────────────────────────────────────────────────────────────
  const [meta, setMeta]           = useState<Meta | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [windowSec, setWindowSec] = useState(10);
  const [windowStart, setWindowStart] = useState(0);
  const [cursor, setCursor]       = useState(0);
  const [playing, setPlaying]     = useState(false);
  const [speed, setSpeed]         = useState(1);
  const [amplitude, setAmplitude] = useState(1.0);
  const [showArtifacts, setShowArtifacts]   = useState(true);
  const [suppressArts, setSuppressArts]     = useState(false);
  const [showSegments, setShowSegments]     = useState(true);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  // Clinical display controls (display-only for now; filtering applied in future)
  const [hfFilter, setHfFilter]             = useState(70);
  const [lfFilter, setLfFilter]             = useState(0.5);
  const [montage, setMontage]               = useState("avg");

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [signals, setSignals]         = useState<number[][] | null>(null);
  const [artifacts, setArtifacts]     = useState<Artifact[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [segments, setSegments]       = useState<Segment[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingWin, setLoadingWin]   = useState(true);

  const cache       = useRef<Map<string, number[][]>>(new Map());
  const reqId       = useRef(0);
  const didSeek     = useRef(false);
  /** Strip legacy ?viewT / ?viewW once per study (old links; no longer used) */
  const strippedLegacyViewParamsRef = useRef(false);
  const wheelAccumRef = useRef(0);
  const wheelRafRef   = useRef<number | null>(null);
  // Raw EDF fallback — set when canonical zarr not yet available
  const edfReader        = useRef<EdfChunkReader | null>(null);
  const [rawEdfMode, setRawEdfMode] = useState(false);
  // Upgrade polling: once in raw mode, check if canonical becomes available
  const upgradeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [esfPollAttempt, setEsfPollAttempt] = useState(0);
  // Signal layer toggle: "esf" = canonical zarr (default), "raw" = raw EDF bytes
  const [signalLayer, setSignalLayer] = useState<"esf" | "raw">("esf");
  const signalLayerRef   = useRef<"esf" | "raw">("esf");
  const rawEdfRef        = useRef<EdfChunkReader | null>(null);
  const rawMetaRef       = useRef<Meta | null>(null);
  const canonicalMetaRef = useRef<Meta | null>(null);
  const [loadingRaw, setLoadingRaw] = useState(false);
  /** True once canonical (ESF/zarr) meta exists — drives ESF toggle (refs do not re-render). */
  const [canonicalPresent, setCanonicalPresent] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const globalTime = windowStart + cursor;
  const duration   = useMemo(() => (meta ? meta.n_samples / meta.sampling_rate_hz : 0), [meta]);

  const segIdx = useMemo(() => {
    if (!focusedSeg || !segments.length) return -1;
    return segments.findIndex(s => s.t_start_s === focusedSeg.t_start_s && s.label === focusedSeg.label);
  }, [focusedSeg, segments]);

  const channelLabels = useMemo(() => {
    if (!meta) return [];
    if (meta.channel_map?.length) return [...meta.channel_map].sort((a, b) => a.index - b.index).map(c => c.canonical_id);
    if (meta.channel_names?.length) return meta.channel_names;
    if (meta.channels?.length) return meta.channels.map(c => c.name);
    return [];
  }, [meta]);

  const visibleChannels = useMemo(() => {
    const s = new Set<number>();
    if (meta) for (let i = 0; i < meta.n_channels; i++) s.add(i);
    return s;
  }, [meta]);

  // ── Seek ─────────────────────────────────────────────────────────────────────
  const seekTo = useCallback((t: number) => {
    if (!meta) return;
    const dur = meta.n_samples / meta.sampling_rate_hz;
    const tt  = clamp(t, 0, Math.max(0, dur - 1e-6));
    const stride = windowSec / 2;
    const ws = Math.floor(tt / stride) * stride;
    setPlaying(false);
    setWindowStart(clamp(ws, 0, Math.max(0, dur - windowSec)));
    setCursor(clamp(tt - ws, 0, windowSec));
  }, [meta, windowSec]);

  const gotoSegment = useCallback((seg: Segment) => {
    seekTo(seg.t_start_s);
    const p = new URLSearchParams(searchParams);
    p.set("t", String(seg.t_start_s));
    p.set("t_end", String(seg.t_end_s));
    p.set("focus", "segment");
    p.set("label", seg.label);
    if (seg.channel_index != null) p.set("ch", String(seg.channel_index)); else p.delete("ch");
    if (seg.score != null) p.set("score", String(seg.score)); else p.delete("score");
    setSearchParams(p, { replace: true });
  }, [seekTo, searchParams, setSearchParams]);

  const clearFocus = useCallback(() => {
    const p = new URLSearchParams(searchParams);
    ["focus", "t", "t_end", "label", "ch", "score"].forEach(k => p.delete(k));
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleWheelScroll = useCallback((e: React.WheelEvent) => {
    if (playing || !meta) return;
    e.preventDefault();
    const px = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    wheelAccumRef.current += (px / 300) * windowSec;
    if (wheelRafRef.current) return;
    wheelRafRef.current = requestAnimationFrame(() => {
      wheelRafRef.current = null;
      const step = wheelAccumRef.current;
      wheelAccumRef.current = 0;
      if (Math.abs(step) < 0.01) return;
      const dur = meta.n_samples / meta.sampling_rate_hz;
      const maxWs = Math.max(0, dur - windowSec);
      setWindowStart(ws => clamp(ws + step, 0, maxWs));
    });
  }, [playing, meta, windowSec]);

  // ── Effects: meta (reset on study change) ─────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setMeta(null); setSignals(null); setArtifacts([]); setAnnotations([]); setSegments([]);
    setWindowStart(0); setCursor(0); setFatalError(null); setRawEdfMode(false);
    setSignalLayer("esf"); signalLayerRef.current = "esf";
    setEsfPollAttempt(0);
    didSeek.current = false;
    strippedLegacyViewParamsRef.current = false;
    cache.current.clear(); edfReader.current = null;
    rawEdfRef.current = null; rawMetaRef.current = null; canonicalMetaRef.current = null;
    if (upgradeTimerRef.current) { clearTimeout(upgradeTimerRef.current); upgradeTimerRef.current = null; }

    if (!studyId) { setLoadingMeta(false); return; }

    setLoadingMeta(true);

    const tryCanonical = () =>
      fetchJson<any>(`/studies/${studyId}/meta?root=.`, { timeoutMs: 20000, requireKey: FETCH_REQUIRE_KEY });

    const tryRawEdf = async () => {
      const buf = await downloadRawEdfBuffer(studyId);
      return new Blob([buf]);
    };

    tryCanonical()
      .then(r => {
        if (!alive) return;
        if (!r.ok) throw new Error((r as any).error ?? "read-api-fail");
        const m = (r.data?.meta ?? r.data) as Meta;
        setMeta(m);
        canonicalMetaRef.current = m;
        setCanonicalPresent(true);
      })
      .catch(async () => {
        if (!alive) return;
        // Canonical zarr not ready — fall back to raw EDF from Supabase storage
        try {
          const blob = await tryRawEdf();
          if (!alive) return;
          const buf = await blob.arrayBuffer();
          const reader = new EdfChunkReader(buf);
          const rawM: Meta = {
            n_channels: reader.nChannels,
            sampling_rate_hz: reader.sampleRate,
            n_samples: reader.totalSamples,
            channel_map: reader.labels.map((l, i) => ({ index: i, canonical_id: l, unit: "uV" })),
          };
          edfReader.current = reader;
          rawEdfRef.current = reader;
          rawMetaRef.current = rawM;
          setMeta(rawM);
          setRawEdfMode(true);
          setFatalError(null);

          // Poll for canonical upgrade — fast backoff: 5s × 12 (first minute), then 30s
          let pollCount = 0;
          const scheduleEsfCheck = () => {
            const delay = pollCount < 12 ? 5000 : 30000;
            upgradeTimerRef.current = setTimeout(async () => {
              if (!alive) return;
              pollCount++;
              setEsfPollAttempt(pollCount);

              // Primary signal: Supabase triage_status / triage_progress
              let dbReady = false;
              try {
                const { data } = await supabase
                  .from("studies")
                  .select("triage_status, triage_progress")
                  .eq("id", studyId)
                  .single();
                dbReady =
                  data?.triage_status === "completed" ||
                  (data?.triage_progress ?? 0) >= 50;
              } catch { /* network issue — fall through to zarr check */ }

              // Check zarr meta when DB says ready, or every 6th poll as a fallback
              if (dbReady || pollCount % 6 === 0) {
                const r2 = await tryCanonical().catch(() => ({ ok: false }));
                if (!alive) return;
                if (r2.ok) {
                  if (upgradeTimerRef.current) clearTimeout(upgradeTimerRef.current);
                  upgradeTimerRef.current = null;
                  const newMeta = (r2 as any).data?.meta ?? (r2 as any).data;
                  canonicalMetaRef.current = newMeta;
                  setCanonicalPresent(true);
                  // Auto-upgrade only if user hasn't explicitly switched to raw
                  if (signalLayerRef.current === "esf") {
                    edfReader.current = null;
                    cache.current.clear();
                    setRawEdfMode(false);
                    setSignalLayer("esf");
                    signalLayerRef.current = "esf";
                    setMeta(newMeta);
                    toast.success("Enhanced signal view ready");
                  }
                  return; // stop polling
                }
              }

              if (alive) scheduleEsfCheck();
            }, delay);
          };
          scheduleEsfCheck();
        } catch (e2) {
          if (alive) setFatalError(String((e2 as Error)?.message || e2));
        }
      })
      .finally(() => { if (alive) setLoadingMeta(false); });

    return () => {
      alive = false;
      if (upgradeTimerRef.current) { clearTimeout(upgradeTimerRef.current); upgradeTimerRef.current = null; }
    };
  }, [studyId]);

  // ── Effects: overlays ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!studyId) return;
    fetchJson<any>(`/studies/${studyId}/artifacts?root=.`,        { timeoutMs: 20000, requireKey: FETCH_REQUIRE_KEY }).then(r => setArtifacts(r.ok ? (r.data?.artifacts ?? []) : [])).catch(() => setArtifacts([]));
    fetchJson<any>(`/studies/${studyId}/annotations?root=.`,      { timeoutMs: 20000, requireKey: FETCH_REQUIRE_KEY }).then(r => setAnnotations(r.ok ? (r.data?.annotations ?? []) : [])).catch(() => setAnnotations([]));
    fetchJson<any>(`/studies/${studyId}/segments?root=/app/data`, { timeoutMs: 20000, requireKey: FETCH_REQUIRE_KEY }).then(r => setSegments(r.ok ? (r.data?.segments ?? []) : [])).catch(() => setSegments([]));
  }, [studyId]);

  // ── Effects: auto-seek from ?t= (segment deep links) ──────────────────────────
  useEffect(() => {
    if (!meta || didSeek.current) return;
    const t = parseFloat(searchParams.get("t") ?? "");
    if (!isFinite(t)) return;
    seekTo(t);
    didSeek.current = true;
  }, [meta, searchParams, seekTo]);

  // ── Effects: drop legacy viewT/viewW query keys (one-time per study) ─────────
  useEffect(() => {
    if (!meta || strippedLegacyViewParamsRef.current) return;
    if (!searchParams.has("viewT") && !searchParams.has("viewW")) {
      strippedLegacyViewParamsRef.current = true;
      return;
    }
    strippedLegacyViewParamsRef.current = true;
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("viewT");
        p.delete("viewW");
        return p;
      },
      { replace: true },
    );
  }, [meta, searchParams, setSearchParams]);

  // ── Effects: preload raw EDF in background when ESF is available (fast Raw) ──
  useEffect(() => {
    if (!studyId || rawEdfRef.current || rawEdfMode) return;
    if (!canonicalPresent) return;

    let alive = true;
    const tid = setTimeout(() => {
      void (async () => {
        try {
          const buf = await downloadRawEdfBuffer(studyId);
          if (!alive) return;
          const reader = new EdfChunkReader(buf);
          const rawM: Meta = {
            n_channels: reader.nChannels,
            sampling_rate_hz: reader.sampleRate,
            n_samples: reader.totalSamples,
            channel_map: reader.labels.map((l, i) => ({ index: i, canonical_id: l, unit: "uV" })),
          };
          if (!alive) return;
          rawEdfRef.current = reader;
          rawMetaRef.current = rawM;
        } catch {
          /* non-fatal: Raw still works on demand */
        }
      })();
    }, 500);
    return () => {
      alive = false;
      clearTimeout(tid);
    };
  }, [studyId, canonicalPresent, rawEdfMode]);

  // ── Effects: window fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!meta) return;
    const fs  = meta.sampling_rate_hz;
    const dur = meta.n_samples / fs;
    const max = Math.max(0, dur - windowSec);
    const ws  = clamp(windowStart, 0, max);
    if (ws !== windowStart) { setWindowStart(ws); return; }
    const c   = clamp(cursor, 0, windowSec);
    if (c !== cursor) { setCursor(c); return; }

    const startSamp = Math.floor(ws * fs);
    const len       = Math.max(1, Math.floor(windowSec * fs));
    const k         = keyFor(startSamp, len);

    const hit = cache.current.get(k);
    if (hit && hit.length === meta.n_channels) {
      setSignals(hit);
      setLoadingWin(false);
      return;
    }

    setLoadingWin(true);
    const id = ++reqId.current;

    // ── Raw EDF mode: serve chunks from in-memory reader ──────────
    if (edfReader.current) {
      try {
        const sig = edfReader.current.getChunk(startSamp, len);
        if (id === reqId.current) {
          cache.current.set(k, sig);
          setSignals(sig);
          setLoadingWin(false);
        }
      } catch (e) {
        if (id === reqId.current) setFatalError(String(e));
      }
      return;
    }

    fetchChunk(studyId, startSamp, len)
      .then(r => {
        if (!r.ok) throw new Error((r as any).error);
        const nCh   = isFinite(hdrNum(r.headers, ["x-eeg-nchannels", "x-eeg-channel-count"])) ? hdrNum(r.headers, ["x-eeg-nchannels", "x-eeg-channel-count"]) : meta.n_channels;
        const nSamp = isFinite(hdrNum(r.headers, ["x-eeg-length", "x-eeg-samples-per-channel"])) ? hdrNum(r.headers, ["x-eeg-length", "x-eeg-samples-per-channel"]) : len;
        const f32   = new Float32Array(r.data);
        if (f32.length !== nCh * nSamp) throw new Error(`Payload mismatch: got ${f32.length}, expected ${nCh * nSamp}`);
        return reshapeAuto(f32, nCh, nSamp);
      })
      .then(sig => {
        if (id !== reqId.current) return;
        cache.current.set(k, sig);
        setSignals(sig);
      })
      .catch(e => { if (id === reqId.current && !signals) setFatalError(String(e)); })
      .finally(() => { if (id === reqId.current) setLoadingWin(false); });

    // Prefetch next window during playback
    if (playing) {
      const nextWs = clamp(ws + windowSec / 2, 0, max);
      const nk = keyFor(Math.floor(nextWs * fs), len);
      if (!cache.current.has(nk)) {
        fetchChunk(studyId, Math.floor(nextWs * fs), len)
          .then(r => {
            if (!r.ok) return;
            const f32 = new Float32Array(r.data);
            if (f32.length === meta.n_channels * len) cache.current.set(nk, reshapeAuto(f32, meta.n_channels, len));
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, studyId, windowStart, windowSec, playing]);

  // ── Effects: playback ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !meta) return;
    const dur    = meta.n_samples / meta.sampling_rate_hz;
    const max    = Math.max(0, dur - windowSec);
    const stride = windowSec / 2;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCursor(c => {
        const nc = c + dt * speed;
        if (nc < windowSec * 0.75) return nc;
        setWindowStart(ws => clamp(ws + stride, 0, max));
        return nc - stride;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, meta, windowSec, speed]);

  // ── Effects: keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      switch (e.key) {
        case " ":          e.preventDefault(); setPlaying(p => !p); break;
        case "ArrowLeft":  e.preventDefault(); seekTo(globalTime - windowSec); break;
        case "ArrowRight": e.preventDefault(); seekTo(globalTime + windowSec); break;
        case "=": case "+": e.preventDefault(); setAmplitude(a => +Math.min(10, a + 0.25).toFixed(2)); break;
        case "-":           e.preventDefault(); setAmplitude(a => +Math.max(0.1, a - 0.25).toFixed(2)); break;
        case "n": case "N":
          e.preventDefault();
          if (segments.length) gotoSegment(segments[(segIdx + 1) % segments.length]);
          break;
        case "p": case "P":
          e.preventDefault();
          if (segments.length) gotoSegment(segments[segIdx > 0 ? segIdx - 1 : segments.length - 1]);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [globalTime, windowSec, segments, segIdx, seekTo, gotoSegment]);

  // ── Window-local overlays ─────────────────────────────────────────────────────
  const winArtifacts = useMemo(() => {
    if (!showArtifacts) return [];
    return artifacts
      .filter(a => a.end_sec > windowStart && a.start_sec < windowStart + windowSec)
      .map(a => {
        const ac = artifactColor(a.artifact_type);
        return {
          start_sec: a.start_sec - windowStart,
          end_sec: a.end_sec - windowStart,
          label: artifactColor(a.artifact_type).label,
          artifact_type: a.artifact_type,
          channel: a.channel,
          color: ac.bg,
          borderColor: ac.border,
        };
      });
  }, [artifacts, showArtifacts, windowStart, windowSec]);

  const winMarkers = useMemo<Marker[]>(() => {
    return annotations
      .filter(a => a.start_sec >= windowStart && a.start_sec <= windowStart + windowSec)
      .map((a, i) => ({ id: `ann-${i}`, timestamp_sec: a.start_sec - windowStart, marker_type: "event", label: a.label ?? "annotation" }));
  }, [annotations, windowStart, windowSec]);

  const winSegments = useMemo(() => {
    if (!showSegments || !segments.length) return [];
    const we = windowStart + windowSec;
    return segments
      .filter(s => s.t_end_s > windowStart && s.t_start_s < we)
      .map(s => {
        const color = getSegmentColor(s.label);
        const focused = !!focusedSeg && s.t_start_s === focusedSeg.t_start_s && s.label === focusedSeg.label;
        return {
          start_sec: Math.max(0, s.t_start_s - windowStart),
          end_sec:   Math.min(windowSec, s.t_end_s - windowStart),
          label: s.label,
          color:       focused ? "rgba(59,130,246,0.25)" : color.bg,
          borderColor: focused ? "rgba(59,130,246,0.8)"  : color.border,
          isFocused: focused,
          channel: s.channel_index ?? undefined,
        };
      });
  }, [segments, showSegments, windowStart, windowSec, focusedSeg]);

  const winHighlight = useMemo(() => {
    if (!focusedSeg || showSegments) return null;
    const we = windowStart + windowSec;
    if (focusedSeg.t_end_s <= windowStart || focusedSeg.t_start_s >= we) return null;
    return { start_sec: Math.max(0, focusedSeg.t_start_s - windowStart), end_sec: Math.min(windowSec, focusedSeg.t_end_s - windowStart), label: focusedSeg.label };
  }, [focusedSeg, showSegments, windowStart, windowSec]);

  // ── Overlay legend counts ─────────────────────────────────────────────────────
  const artifactCount  = artifacts.length;
  const annotationCount = annotations.length;
  const artifactTypeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of artifacts) {
      const t = a.artifact_type ?? "artifact";
      m[t] = (m[t] ?? 0) + 1;
    }
    return m;
  }, [artifacts]);

  // ── Render: no study selected ────────────────────────────────────────────────
  if (!studyId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center">
          <WifiOff className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <p className="text-sm font-semibold">No study selected</p>
          <p className="text-xs text-muted-foreground">Open the viewer from a study page.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Go back
        </Button>
      </div>
    );
  }

  // ── Render: error ─────────────────────────────────────────────────────────────
  if (fatalError) {
    const isNotFound = fatalError.includes("404") || fatalError.includes("No blobs") || fatalError.includes("not yet available");
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center">
          <WifiOff className="h-7 w-7 text-muted-foreground/60" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <p className="text-sm font-semibold">
            {isNotFound ? "Waveform not yet available" : "Viewer unavailable"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isNotFound
              ? "The EEG waveform is still being processed. Return to the study and wait for analysis to complete — the viewer will work once processing finishes."
              : "Could not connect to the EEG data service. Check your connection and try again."}
          </p>
        </div>
        <details className="text-left">
          <summary className="text-xs text-muted-foreground/60 cursor-pointer">Technical details</summary>
          <pre className="mt-1 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 max-w-lg whitespace-pre-wrap break-words">{fatalError}</pre>
        </details>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Go back
          </Button>
          {isNotFound && (
            <Button size="sm" className="gap-2" onClick={() => navigate(0)}>
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Render: loading (study meta only — plot area handles signal fetch) ────────
  if (loadingMeta || !meta) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs">Loading study…</span>
      </div>
    );
  }

  const plotSignalsReady =
    !!signals && signals.length === meta.n_channels && (signals[0]?.length ?? 0) > 0;

  // ── Render: main ──────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden bg-background" tabIndex={-1}>

      {/* Always-visible escape hatch (avoids trap on loading / errors) */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b bg-background px-2 py-1.5">
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <span className="min-w-0 flex-1 truncate text-center text-[10px] font-mono text-muted-foreground" title={studyId}>
          {studyId}
        </span>
        <span className="w-[72px] shrink-0" aria-hidden />
      </div>

      {/* ── Raw EDF mode banner ── */}
      {rawEdfMode && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-700 dark:text-amber-400 flex-1">
            Raw signal — enhanced view processing
            {esfPollAttempt > 0 && (
              <span className="opacity-50 ml-1">(check {esfPollAttempt})</span>
            )}
          </span>
          <Loader2 className="h-3 w-3 text-amber-500 animate-spin shrink-0" />
        </div>
      )}

      {/* ── Focused segment banner ── */}
      {focusedSeg && (
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-primary/8 border-b border-primary/15 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <Badge variant="secondary" className="text-xs capitalize shrink-0">{focusedSeg.label}</Badge>
            <span className="text-xs font-mono text-muted-foreground">
              {fmtTime(focusedSeg.t_start_s)} – {fmtTime(focusedSeg.t_end_s)}
            </span>
            {focusedSeg.score != null && (
              <span className="text-xs text-muted-foreground">
                conf: {(focusedSeg.score * 100).toFixed(0)}%
              </span>
            )}
            {segments.length > 1 && (
              <div className="flex items-center gap-1 border-l pl-2 ml-1">
                <Button variant="ghost" size="icon" className="h-5 w-5"
                  onClick={() => gotoSegment(segments[segIdx > 0 ? segIdx - 1 : segments.length - 1])}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">{segIdx + 1}/{segments.length}</span>
                <Button variant="ghost" size="icon" className="h-5 w-5"
                  onClick={() => gotoSegment(segments[(segIdx + 1) % segments.length])}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={clearFocus}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ── Clinical toolbar ── */}
      <EEGControls
        isPlaying={playing}
        onPlayPause={() => setPlaying(p => !p)}
        currentTime={globalTime}
        duration={duration}
        onTimeChange={seekTo}
        timeWindow={windowSec}
        onTimeWindowChange={w => {
          setWindowSec(w);
          const stride = w / 2;
          const ws = Math.floor(globalTime / stride) * stride;
          setWindowStart(clamp(ws, 0, Math.max(0, duration - w)));
          setCursor(clamp(globalTime - ws, 0, w));
        }}
        amplitudeScale={amplitude}
        onAmplitudeScaleChange={setAmplitude}
        playbackSpeed={speed}
        onPlaybackSpeedChange={setSpeed}
        onSkipBackward={() => seekTo(globalTime - windowSec)}
        onSkipForward={() => seekTo(globalTime + windowSec)}
        onExport={() => {}}
        hfFilter={hfFilter}
        onHFFilterChange={setHfFilter}
        lfFilter={lfFilter}
        onLFFilterChange={setLfFilter}
        montage={montage}
        onMontageChange={setMontage}
        visibleChannelCount={meta?.n_channels}
      />

      {/* ── Timeline (mini-map) + ESF/Raw overlaid on the right (same h-8, no extra row) ── */}
      <div className="relative h-8 border-t bg-muted/10 flex-shrink-0 select-none overflow-hidden">
        {/* Seekable map — leave right rail for layer toggle */}
        <div
          className="absolute inset-y-0 left-0 right-[4.75rem] cursor-crosshair"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seekTo(((e.clientX - r.left) / r.width) * duration);
          }}
        >
          {showArtifacts && artifacts.map((a, i) => (
            <div key={`a${i}`} className="absolute top-0 bottom-0 bg-red-500/20 pointer-events-none"
              style={{ left: `${(a.start_sec / duration) * 100}%`, width: `${Math.max(0.15, ((a.end_sec - a.start_sec) / duration) * 100)}%` }} />
          ))}
          {segments.map((s, i) => {
            const c = getSegmentColor(s.label);
            return (
              <div key={`s${i}`} className="absolute top-1.5 bottom-1.5 pointer-events-none opacity-80 rounded-sm"
                style={{ left: `${(s.t_start_s / duration) * 100}%`, width: `${Math.max(0.15, ((s.t_end_s - s.t_start_s) / duration) * 100)}%`, background: c.border }} />
            );
          })}
          {annotations.map((a, i) => (
            <div key={`n${i}`} className="absolute top-0 bottom-0 w-px bg-blue-400/40 pointer-events-none"
              style={{ left: `${(a.start_sec / duration) * 100}%` }} />
          ))}
          <div className="absolute top-0 bottom-0 border-x border-primary/50 bg-primary/8 pointer-events-none"
            style={{ left: `${(windowStart / duration) * 100}%`, width: `${Math.max(0.5, (windowSec / duration) * 100)}%` }} />
          <span className="absolute right-1 top-0.5 text-[9px] text-muted-foreground/40 font-mono pointer-events-none">
            {fmtTime(duration)}
          </span>
        </div>

        {/* Overlay chips — float bottom-left, block seek clicks */}
        {(artifactCount > 0 || annotationCount > 0 || segments.length > 0) && (
          <div className="absolute bottom-0.5 left-1 z-10 flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {artifactCount > 0 && (
              <button onClick={() => setShowArtifacts(v => !v)}
                className={`flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] transition-colors ${showArtifacts ? "bg-background/80 border border-border/60 text-foreground" : "text-muted-foreground/40"}`}>
                {Object.entries(artifactTypeCounts).map(([type, count]) => {
                  const ac = artifactColor(type);
                  return <span key={type} className="flex items-center gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: ac.border }} />
                    <span style={{ color: ac.border }}>{count}</span>
                  </span>;
                })}
              </button>
            )}
            {annotationCount > 0 && (
              <div className="flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {annotationCount}
              </div>
            )}
            {segments.length > 0 && (
              <button onClick={e => { e.stopPropagation(); setShowSegments(v => !v); }}
                className={`flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] transition-colors ${showSegments ? "bg-background/80 text-primary border border-primary/25" : "text-muted-foreground/40"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {segments.length}
              </button>
            )}
            {artifactCount > 0 && showArtifacts && (
              <button onClick={e => { e.stopPropagation(); setSuppressArts(v => !v); }}
                className={`px-1.5 py-px rounded text-[10px] transition-colors ${suppressArts ? "bg-background/80 text-foreground border border-border" : "text-muted-foreground/40"}`}>
                dim
              </button>
            )}
          </div>
        )}

        {/* ESF / Raw — top of minimap strip, right edge (does not add vertical space) */}
        <div
          className="absolute inset-y-0 right-0 z-20 flex items-stretch border-l border-border/50 bg-background/95 pl-0.5 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex h-full items-stretch overflow-hidden rounded-sm border border-border/40 text-[10px] leading-none">
            <button
              type="button"
              disabled={!canonicalPresent}
              title={!canonicalPresent ? "Enhanced (ESF) view not available for this study yet" : "Canonical ESF view"}
              onClick={(e) => {
                e.stopPropagation();
                if (signalLayer === "esf") return;
                reqId.current += 1;
                edfReader.current = null;
                cache.current.clear();
                const canon = canonicalMetaRef.current;
                if (!canon) {
                  toast.message("ESF view not ready", { description: "Try again after processing completes." });
                  return;
                }
                setSignals(null);
                setMeta(canon);
                signalLayerRef.current = "esf";
                setSignalLayer("esf");
              }}
              className={`flex items-center px-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                signalLayer === "esf" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ESF
            </button>
            <button
              type="button"
              disabled={loadingRaw}
              title="Source EDF (all channels)"
              onClick={async (e) => {
                e.stopPropagation();
                if (signalLayer === "raw") return;
                if (!studyId) return;
                reqId.current += 1;
                if (rawEdfRef.current && rawMetaRef.current) {
                  edfReader.current = rawEdfRef.current;
                  cache.current.clear();
                  const rawM = rawMetaRef.current;
                  const fs = rawM.sampling_rate_hz;
                  const startSamp = Math.floor(windowStart * fs);
                  const len = Math.max(1, Math.floor(windowSec * fs));
                  try {
                    const sig = rawEdfRef.current.getChunk(startSamp, len);
                    setMeta(rawM);
                    setSignals(sig);
                    signalLayerRef.current = "raw";
                    setSignalLayer("raw");
                  } catch (err) {
                    console.warn("[viewer] raw chunk:", err);
                    toast.error("Could not read raw window", {
                      description: err instanceof Error ? err.message : String(err),
                    });
                  }
                  return;
                }
                setSignals(null);
                setLoadingRaw(true);
                try {
                  const buf = await downloadRawEdfBuffer(studyId);
                  const reader = new EdfChunkReader(buf);
                  const rawM: Meta = {
                    n_channels: reader.nChannels,
                    sampling_rate_hz: reader.sampleRate,
                    n_samples: reader.totalSamples,
                    channel_map: reader.labels.map((l, i) => ({ index: i, canonical_id: l, unit: "uV" })),
                  };
                  rawEdfRef.current = reader;
                  rawMetaRef.current = rawM;
                  edfReader.current = reader;
                  cache.current.clear();
                  const fs = rawM.sampling_rate_hz;
                  const startSamp = Math.floor(windowStart * fs);
                  const len = Math.max(1, Math.floor(windowSec * fs));
                  const sig = reader.getChunk(startSamp, len);
                  setMeta(rawM);
                  setSignals(sig);
                  signalLayerRef.current = "raw";
                  setSignalLayer("raw");
                } catch (e2) {
                  const msg = e2 instanceof Error ? e2.message : String(e2);
                  console.warn("[viewer] raw EDF load failed:", e2);
                  toast.error("Could not load raw file", { description: msg });
                } finally {
                  setLoadingRaw(false);
                }
              }}
              className={`flex items-center px-1.5 transition-colors ${
                signalLayer === "raw" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {loadingRaw ? <Loader2 className="h-3 w-3 animate-spin" /> : "Raw"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Canvas + sidebar (relative: collapsed sidebar is a floating control) ─ */}
      <div className="relative flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 min-w-0 min-h-0" onWheel={handleWheelScroll} style={{ touchAction: "none" }}>
          {plotSignalsReady ? (
            <WebGLEEGViewer
              signals={signals}
              channelLabels={channelLabels}
              sampleRate={meta.sampling_rate_hz}
              currentTime={cursor}
              timeWindow={windowSec}
              amplitudeScale={amplitude}
              visibleChannels={visibleChannels}
              theme={theme ?? "dark"}
              markers={winMarkers}
              artifactIntervals={winArtifacts}
              highlightInterval={winHighlight}
              segmentOverlays={winSegments}
              showArtifactsAsRed={true}
              suppressArtifacts={suppressArts}
              hfFilter={hfFilter}
              lfFilter={lfFilter}
              labelColumnWidth={72}
              onTimeClick={(t) => setCursor(clamp(t, 0, windowSec))}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">Loading waveform…</span>
            </div>
          )}
        </div>

        {segments.length > 0 && (
          <SegmentSidebar
            segments={segments}
            currentSegmentIndex={segIdx}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
            onSegmentClick={gotoSegment}
          />
        )}
      </div>

      {/* ── Status bar ── */}
      <div className="flex items-center gap-3 px-3 h-6 border-t bg-muted/20 flex-shrink-0 overflow-hidden">
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
          {fmtTime(globalTime)}
        </span>
        <span className="text-[10px] text-muted-foreground/40">·</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {meta.n_channels}ch · {meta.sampling_rate_hz} Hz
        </span>
        {rawEdfMode && (
          <>
            <span className="text-[10px] text-muted-foreground/40">·</span>
            <span className="text-[10px] text-amber-600 dark:text-amber-400">Raw EDF</span>
          </>
        )}
        <span className="text-[10px] text-muted-foreground/40">·</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {windowSecToMmSec(windowSec)} mm/s · {scaleToUVMM(amplitude).toFixed(1)} μV/mm
        </span>
        <span className="text-[10px] text-muted-foreground/40">·</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {hfFilter} Hz HF · {lfFilter === 0 ? "LF Off" : `${lfFilter < 0.1 ? lfFilter.toFixed(3) : lfFilter.toFixed(1)} Hz LF`} · Notch Off
        </span>
        <div className="flex-1" />
        {loadingWin && (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/50 shrink-0" />
        )}
      </div>
    </div>
  );
}
