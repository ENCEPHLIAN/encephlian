import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

const ENV_API_BASE = (import.meta.env.VITE_ENCEPH_READ_API_BASE as string) || "";
const API_KEY = (import.meta.env.VITE_ENCEPH_READ_API_KEY as string) || "";
const STUDY_ID = "TUH_CANON_001";

const LS_KEY = "enceph.admin.readApiBase.override";
const LOCAL_BASE = "http://127.0.0.1:8787"\;

type CheckRow = {
  name: string;
  ok: boolean;
  latencyMs: number;
  notes?: string;
};

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  if (crypto?.subtle?.digest) {
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return "";
}

function headerGet(headers: Headers, ...names: string[]): string {
  for (const n of names) {
    const v = headers.get(n);
    if (v) return v;
    const v2 = headers.get(n.toLowerCase());
    if (v2) return v2;
    const v3 = headers.get(n.toUpperCase());
    if (v3) return v3;
  }
  return "";
}

async function timedFetch(url: string): Promise<{ r: Response; ms: number }> {
  const t0 = performance.now();
  const r = await fetch(url, {
    method: "GET",
    headers: API_KEY ? { "X-API-KEY": API_KEY } : {},
  });
  const ms = performance.now() - t0;
  return { r, ms: Math.round(ms) };
}

function extractCount(j: any): number {
  if (Array.isArray(j)) return j.length;
  if (!j || typeof j !== "object") return 0;
  if (Array.isArray(j.items)) return j.items.length;
  if (Array.isArray(j.events)) return j.events.length;
  if (Array.isArray(j.annotations)) return j.annotations.length;
  if (Array.isArray(j.intervals)) return j.intervals.length;
  if (Array.isArray(j.segments)) return j.segments.length;
  return 0;
}

function extractRunId(j: any): string {
  if (!j || typeof j !== "object") return "";
  const rid = j.run_id;
  return typeof rid === "string" ? rid : "";
}

export default function AdminDiagnostics() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string>("");

  const initialBase = useMemo(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
    return (saved || ENV_API_BASE || "").trim();
  }, []);

  const [apiBase, setApiBase] = useState<string>(initialBase);
  const [editBase, setEditBase] = useState<string>(initialBase);

  const missingEnv = useMemo(() => {
    const issues: string[] = [];
    if (!apiBase) issues.push("Missing Read API base URL (set env or override below)");
    if (!API_KEY) issues.push("Missing VITE_ENCEPH_READ_API_KEY (requests will 401)");
    return issues;
  }, [apiBase]);

  const applyBase = useCallback((next: string) => {
    const v = next.trim();
    setApiBase(v);
    setEditBase(v);
    if (typeof window !== "undefined") window.localStorage.setItem(LS_KEY, v);
    toast.success("Read API base updated");
  }, []);

  const run = useCallback(async () => {
    if (!apiBase) {
      toast.error("Missing Read API base URL");
      return;
    }

    setRunning(true);
    setRows([]);
    const out: CheckRow[] = [];

    try {
      // 1) Health
      {
        const { r, ms } = await timedFetch(`${apiBase}/health`);
        const ok = r.ok;
        out.push({ name: "Read API /health", ok, latencyMs: ms, notes: ok ? "" : `HTTP ${r.status}` });
      }

      // 2) Meta
      let metaJson: any = null;
      {
        const { r, ms } = await timedFetch(`${apiBase}/studies/${STUDY_ID}/meta?root=.`);
        const ok = r.ok;
        if (ok) metaJson = await r.json();
        const notes = ok
          ? `channels=${metaJson?.n_channels ?? "?"}, sr=${metaJson?.sampling_rate_hz ?? metaJson?.sample_rate_hz ?? "?"}`
          : `HTTP ${r.status}`;
        out.push({ name: "Meta (C-plane)", ok, latencyMs: ms, notes });
      }

      const chunkUrl = `${apiBase}/studies/${STUDY_ID}/chunk.bin?root=.&start=0&length=250`;

      // 3) Chunk #1 (binary + headers)
      let c1Buf: ArrayBuffer | null = null;
      let c1HdrSha = "";
      let c1CalcSha = "";
      let c1Ch = "";
      let c1Layout = "";
      {
        const { r, ms } = await timedFetch(chunkUrl);
        const ok = r.ok;
        if (ok) {
          c1HdrSha = headerGet(r.headers, "x-eeg-content-sha256");
          c1Ch = headerGet(r.headers, "x-eeg-channel-ids");
          c1Layout = headerGet(r.headers, "x-eeg-layout");
          c1Buf = await r.arrayBuffer();
          c1CalcSha = await sha256Hex(c1Buf);
        }
        const notes = ok
          ? `sha_hdr=${c1HdrSha ? "yes" : "no"}, sha_calc=${c1CalcSha ? "yes" : "no"}, layout=${c1Layout || "?"}, ch_ids=${c1Ch ? "yes" : "no"}`
          : `HTTP ${r.status}`;
        out.push({ name: "Chunk #1 (binary + headers)", ok, latencyMs: ms, notes });
      }

      // 4) Chunk determinism (same request twice)
      {
        const { r, ms } = await timedFetch(chunkUrl);
        let ok = r.ok;
        let notes = "";
        if (ok) {
          const hdrSha2 = headerGet(r.headers, "x-eeg-content-sha256");
          const buf2 = await r.arrayBuffer();
          const calcSha2 = await sha256Hex(buf2);

          const hdrMatches = c1HdrSha && hdrSha2 ? c1HdrSha === hdrSha2 : true;
          const calcMatches = c1CalcSha && calcSha2 ? c1CalcSha === calcSha2 : true;

          let bytesMatch = true;
          if (c1Buf) {
            const a = new Uint8Array(c1Buf);
            const b = new Uint8Array(buf2);
            if (a.byteLength !== b.byteLength) bytesMatch = false;
            else {
              for (let i = 0; i < a.byteLength; i++) {
                if (a[i] !== b[i]) {
                  bytesMatch = false;
                  break;
                }
              }
            }
          }

          ok = ok && hdrMatches && calcMatches && bytesMatch;
          notes = `hdr_sha=${hdrMatches ? "match" : "DIFF"}, calc_sha=${calcMatches ? "match" : "DIFF"}, bytes=${bytesMatch ? "match" : "DIFF"}`;
        } else {
          notes = `HTTP ${r.status}`;
        }
        out.push({ name: "Chunk determinism (same request twice)", ok, latencyMs: ms, notes });
      }

      let artifactsRunId = "";
      let annotationsRunId = "";
      let segmentsRunId = "";

      // 5) Artifacts (derived)
      {
        const { r, ms } = await timedFetch(`${apiBase}/studies/${STUDY_ID}/artifacts?root=.`);
        const ok = r.ok;
        let notes = ok ? "" : `HTTP ${r.status}`;
        if (ok) {
          const j = await r.json();
          artifactsRunId = extractRunId(j);
          notes = `items=${extractCount(j)}${artifactsRunId ? `, run_id=${artifactsRunId.slice(0, 12)}…` : ""}`;
        }
        out.push({ name: "Artifacts (derived)", ok, latencyMs: ms, notes });
      }

      // 6) Annotations (derived)
      {
        const { r, ms } = await timedFetch(`${apiBase}/studies/${STUDY_ID}/annotations?root=.`);
        const ok = r.ok;
        let notes = ok ? "" : `HTTP ${r.status}`;
        if (ok) {
          const j = await r.json();
          annotationsRunId = extractRunId(j);
          notes = `items=${extractCount(j)}${annotationsRunId ? `, run_id=${annotationsRunId.slice(0, 12)}…` : ""}`;
        }
        out.push({ name: "Annotations (derived)", ok, latencyMs: ms, notes });
      }

      // 7) Segments (derived)
      {
        const { r, ms } = await timedFetch(`${apiBase}/studies/${STUDY_ID}/segments?root=.`);
        const ok = r.ok;
        let notes = ok ? "" : `HTTP ${r.status}`;
        if (ok) {
          const j = await r.json();
          segmentsRunId = extractRunId(j);
          notes = `items=${extractCount(j)}${segmentsRunId ? `, run_id=${segmentsRunId.slice(0, 12)}…` : ""}`;
        }
        out.push({ name: "Segments (derived)", ok, latencyMs: ms, notes });
      }

      // 8) I-plane publish consistency (run_id match)
      {
        const haveAny = Boolean(artifactsRunId || annotationsRunId || segmentsRunId);
        const allPresent = Boolean(artifactsRunId && annotationsRunId && segmentsRunId);
        const allEqual = allPresent && artifactsRunId === annotationsRunId && annotationsRunId === segmentsRunId;

        const ok = haveAny && allPresent && allEqual;
        const notes = !haveAny
          ? "no run_id fields found"
          : !allPresent
            ? `missing run_id: artifacts=${artifactsRunId ? "yes" : "no"}, annotations=${annotationsRunId ? "yes" : "no"}, segments=${segmentsRunId ? "yes" : "no"}`
            : allEqual
              ? `run_id consistent: ${artifactsRunId.slice(0, 12)}…`
              : `DIFF: art=${artifactsRunId.slice(0, 8)}…, ann=${annotationsRunId.slice(0, 8)}…, seg=${segmentsRunId.slice(0, 8)}…`;

        out.push({ name: "I-plane publish consistency (run_id match)", ok, latencyMs: 0, notes });
      }

      setRows(out);
      setLastRunAt(new Date().toISOString());

      const failed = out.filter((x) => !x.ok).length;
      if (failed === 0) toast.success("Diagnostics PASS");
      else toast.error(`Diagnostics FAIL (${failed})`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Diagnostics error");
      out.push({ name: "Runner", ok: false, latencyMs: 0, notes: e?.message || String(e) });
      setRows(out);
    } finally {
      setRunning(false);
    }
  }, [apiBase]);

  useEffect(() => {
    if (apiBase) run();
  }, [apiBase, run]);

  const passCount = rows.filter((r) => r.ok).length;
  const failCount = rows.filter((r) => !r.ok).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Diagnostics</CardTitle>
          <CardDescription>
            Validates Read API health, meta, binary chunk determinism, derived endpoints, and I-plane publish consistency.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">Read API base</div>
            <div className="flex gap-2">
              <Input value={editBase} onChange={(e) => setEditBase(e.target.value)} placeholder="http://127.0.0.1:8787" />
              <Button variant="secondary" onClick={() => applyBase(editBase)} disabled={!editBase.trim()}>
                Apply
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => applyBase(LOCAL_BASE)}>
                Use Local
              </Button>
              {ENV_API_BASE && (
                <Button variant="outline" onClick={() => applyBase(ENV_API_BASE)}>
                  Use Env Default
                </Button>
              )}
            </div>
            <div className="text-xs">
              Target: <span className="font-mono">{apiBase || "(missing)"}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={running || !apiBase}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Run Diagnostics
            </Button>

            <Badge variant={failCount ? "destructive" : "secondary"}>
              {rows.length ? (failCount ? `FAIL (${failCount})` : `PASS (${passCount})`) : "Not run"}
            </Badge>

            {lastRunAt && <span className="text-sm text-muted-foreground">Last run: {lastRunAt}</span>}
          </div>
        </CardContent>
      </Card>

      {missingEnv.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Configuration</AlertTitle>
          <AlertDescription className="space-y-1">
            {missingEnv.map((x) => (
              <div key={x} className="font-mono text-xs">
                {x}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Checks</CardTitle>
          <CardDescription>Each row includes PASS/FAIL and measured latency (ms). Consistency is a hard gate.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Check</TableHead>
                <TableHead className="text-right">Latency (ms)</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="w-[90px]">
                    {r.ok ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs">PASS</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-600">
                        <XCircle className="h-4 w-4" />
                        <span className="text-xs">FAIL</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.latencyMs}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.notes || ""}</TableCell>
                </TableRow>
              ))}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    {running ? "Running…" : "No results yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
