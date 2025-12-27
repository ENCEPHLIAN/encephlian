import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

const API_BASE = (import.meta.env.VITE_ENCEPH_READ_API_BASE as string) || "";
const API_KEY = (import.meta.env.VITE_ENCEPH_READ_API_KEY as string) || "";
const STUDY_ID = "TUH_CANON_001";

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
  // Fallback: keep UI functional even if hashing is unavailable.
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

export default function AdminDiagnostics() {
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string>("");

  const canRun = useMemo(() => Boolean(API_BASE), []);
  const missingEnv = useMemo(() => {
    const issues: string[] = [];
    if (!API_BASE) issues.push("Missing VITE_ENCEPH_READ_API_BASE");
    if (!API_KEY) issues.push("Missing VITE_ENCEPH_READ_API_KEY (requests will 401)");
    return issues;
  }, []);

  const run = useCallback(async () => {
    if (!API_BASE) {
      toast.error("Missing VITE_ENCEPH_READ_API_BASE");
      return;
    }

    setRunning(true);
    setRows([]);
    const out: CheckRow[] = [];

    try {
      // 1) Health
      {
        const { r, ms } = await timedFetch(`${API_BASE}/health`);
        const ok = r.ok;
        out.push({ name: "Read API /health", ok, latencyMs: ms, notes: ok ? "" : `HTTP ${r.status}` });
      }

      // 2) Meta
      let metaJson: any = null;
      {
        const { r, ms } = await timedFetch(`${API_BASE}/studies/${STUDY_ID}/meta?root=.`);
        const ok = r.ok;
        if (ok) metaJson = await r.json();
        const notes = ok
          ? `channels=${metaJson?.n_channels ?? "?"}, sr=${metaJson?.sampling_rate_hz ?? metaJson?.sample_rate_hz ?? "?"}`
          : `HTTP ${r.status}`;
        out.push({ name: "Meta (C-plane)", ok, latencyMs: ms, notes });
      }

      // Helper for chunk request (MVP lock)
      const chunkUrl = `${API_BASE}/studies/${STUDY_ID}/chunk.bin?root=.&start=0&length=250`;

      // 3) Chunk #1 (headers + sha256)
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

      // 4) Chunk #2 (determinism)
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

          // Strongest check: byte-for-byte equality (when we have the first buffer)
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
          notes = `hdr_sha=${hdrMatches ? "match" : "DIFF"}, calc_sha=${calcMatches ? "match" : "n/a/DIFF"}, bytes=${bytesMatch ? "match" : "DIFF"}`;
        } else {
          notes = `HTTP ${r.status}`;
        }
        out.push({ name: "Chunk determinism (same request twice)", ok, latencyMs: ms, notes });
      }

      // 5) Artifacts
      {
        const { r, ms } = await timedFetch(`${API_BASE}/studies/${STUDY_ID}/artifacts?root=.`);
        const ok = r.ok;
        let notes = ok ? "" : `HTTP ${r.status}`;
        if (ok) {
          const j = await r.json();
          const n = Array.isArray(j) ? j.length : (j?.intervals?.length ?? j?.artifacts?.length ?? 0);
          notes = `items=${n}`;
        }
        out.push({ name: "Artifacts (derived)", ok, latencyMs: ms, notes });
      }

      // 6) Annotations
      {
        const { r, ms } = await timedFetch(`${API_BASE}/studies/${STUDY_ID}/annotations?root=.`);
        const ok = r.ok;
        let notes = ok ? "" : `HTTP ${r.status}`;
        if (ok) {
          const j = await r.json();
          const n = Array.isArray(j) ? j.length : (j?.events?.length ?? j?.annotations?.length ?? 0);
          notes = `items=${n}`;
        }
        out.push({ name: "Annotations (derived)", ok, latencyMs: ms, notes });
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
  }, []);

  useEffect(() => {
    if (canRun) run();
  }, [canRun, run]);

  const passCount = rows.filter((r) => r.ok).length;
  const failCount = rows.filter((r) => !r.ok).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Diagnostics</CardTitle>
          <CardDescription>
            Validates Read API health, meta, binary chunk determinism, and derived endpoints. Target:{" "}
            <span className="font-mono">{API_BASE || "(missing)"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button onClick={run} disabled={running || !API_BASE}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Run Diagnostics
          </Button>

          <Badge variant={failCount ? "destructive" : "secondary"}>
            {rows.length ? (failCount ? `FAIL (${failCount})` : `PASS (${passCount})`) : "Not run"}
          </Badge>

          {lastRunAt && <span className="text-sm text-muted-foreground">Last run: {lastRunAt}</span>}
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
          <CardDescription>Each row includes PASS/FAIL and measured latency.</CardDescription>
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
