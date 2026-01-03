import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type SmokeRow = {
  step: string;
  status: "PASS" | "FAIL";
  latency_ms: number;
  note?: string;
};

export function SmokeRunnerCard(props: {
  baseUrl: string;
  runSmoke: () => Promise<SmokeRow[]>;
}) {
  const { baseUrl, runSmoke } = props;
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SmokeRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const title = useMemo(() => `Read API Smoke`, []);

  async function onRun() {
    setBusy(true);
    try {
      const r = await runSmoke();
      setRows(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Run Smoke
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[900px] max-h-[75vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <div className="text-xs opacity-70 break-all">{baseUrl}</div>
        </DialogHeader>

        <div className="flex gap-2 py-2">
          <Button onClick={onRun} disabled={busy}>
            {busy ? "Running..." : "Run Smoke"}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>

        <div className="rounded-md border">
          <div className="grid grid-cols-4 gap-2 p-2 text-xs font-medium opacity-70">
            <div>Step</div>
            <div>Status</div>
            <div>Latency</div>
            <div>Note</div>
          </div>

          {(rows || []).map((r) => (
            <div key={r.step} className="grid grid-cols-4 gap-2 p-2 text-sm border-t">
              <div className="truncate">{r.step}</div>
              <div className={r.status === "PASS" ? "text-green-500" : "text-red-500"}>
                {r.status}
              </div>
              <div>{r.latency_ms} ms</div>
              <div className="truncate opacity-80">{r.note || ""}</div>
            </div>
          ))}

          {!rows && <div className="p-3 text-sm opacity-70">No results yet.</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
