import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { getSegments } from "@/admin/readApi";
import { resolveReadApiBase } from "@/shared/readApiConfig";

interface Segment {
  t_start_s: number;
  t_end_s: number;
  label: string;
  channel_index?: number | null;
  score?: number | null;
}

interface SegmentsResponse {
  schema_version?: string;
  study_id?: string;
  run_id?: string;
  segments?: Segment[];
}

interface AdminSegmentsPanelProps {
  studyId?: string;
  root?: string;
}

export default function AdminSegmentsPanel({ 
  studyId = "TUH_CANON_001",
  root = "/app/data"
}: AdminSegmentsPanelProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SegmentsResponse | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    
    const result = await getSegments(studyId, root);
    
    if (result.ok) {
      setData(result.data as SegmentsResponse);
    } else {
      setError((result as { ok: false; error: string; ms: number }).error);
      setData(null);
    }
    
    setLoading(false);
  };

  const handleSeekToViewer = (seg: Segment) => {
    const effectiveStudyId = data?.study_id ?? studyId;
    const params = new URLSearchParams({
      study_id: effectiveStudyId,
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

  const resolvedBase = resolveReadApiBase();
  const segments = data?.segments ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Segments</CardTitle>
            <CardDescription className="text-xs font-mono mt-1">
              GET {resolvedBase}/studies/{studyId}/segments?root={root}
            </CardDescription>
          </div>
          <Button 
            onClick={handleFetch} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {data ? "Refresh" : "Load Segments"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded bg-destructive/10 border border-destructive/30 text-destructive text-sm font-mono">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Header metadata */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">schema_version:</span>
                <Badge variant="secondary" className="font-mono">
                  {data.schema_version ?? "—"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">study_id:</span>
                <Badge variant="outline" className="font-mono">
                  {data.study_id ?? studyId}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">run_id:</span>
                <Badge variant="outline" className="font-mono text-xs max-w-[300px] truncate" title={data.run_id}>
                  {data.run_id ?? "—"}
                </Badge>
              </div>
            </div>

            {/* Segments table */}
            {segments.length > 0 ? (
              <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-[100px]">t_start_s</TableHead>
                      <TableHead className="w-[100px]">t_end_s</TableHead>
                      <TableHead>label</TableHead>
                      <TableHead className="w-[100px]">channel_index</TableHead>
                      <TableHead className="w-[80px]">score</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {segments.map((seg, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">
                          {seg.t_start_s.toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {seg.t_end_s.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{seg.label}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-center">
                          {seg.channel_index ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {seg.score != null ? seg.score.toFixed(3) : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSeekToViewer(seg)}
                            className="h-7 px-2"
                          >
                            <Play className="h-3 w-3 mr-1" />
                            Seek
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground p-4 text-center border rounded-md">
                No segments found.
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              {segments.length} segment{segments.length !== 1 ? "s" : ""} loaded
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <div className="text-sm text-muted-foreground p-4 text-center">
            Click "Load Segments" to fetch segment data for <code className="bg-muted px-1 rounded">{studyId}</code>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
