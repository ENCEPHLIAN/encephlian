import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function BackendStatusCard(props: {
  base: string;
  keyPresent: boolean;
  err?: string;
  health?: any;
  segments?: any;
  chunk?: { ms: number; headers: Record<string, string> } | null;
  ts: number;
}) {
  const h = props.chunk?.headers || {};
  const schema = props.segments?.schema_version || props.segments?.schema || "unknown";
  const runId = props.segments?.run_id || null;

  const warnLocal = props.base.includes("127.0.0.1") || props.base.includes("localhost");
  const sha = h["x-eeg-content-sha256"] || "";
  const serverMs = h["x-eeg-server-ms"] || "";
  const dtype = h["x-eeg-dtype"] || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Backend
          <div className="flex gap-2">
            {props.err ? <Badge variant="destructive">FAIL</Badge> : <Badge variant="default">OK</Badge>}
            {warnLocal ? <Badge variant="secondary">LOCAL</Badge> : <Badge variant="secondary">PROD</Badge>}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div><span className="font-medium">Base:</span> {props.base}</div>
        <div><span className="font-medium">API key:</span> {props.keyPresent ? "present" : "missing"}</div>
        {props.err ? (
          <div className="text-red-600">{props.err}</div>
        ) : (
          <>
            <div><span className="font-medium">Segments:</span> schema={schema} run_id={runId || "null"}</div>
            <div><span className="font-medium">Chunk RTT:</span> {props.chunk?.ms ?? "?"}ms, server_ms={serverMs || "?"}, dtype={dtype || "?"}</div>
            <div className="break-all"><span className="font-medium">Chunk sha256:</span> {sha || "?"}</div>
          </>
        )}
        <div className="text-xs opacity-70">Last refresh: {new Date(props.ts).toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}
