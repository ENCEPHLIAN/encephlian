import { fetchBinary, fetchJson } from "@/shared/readApiClient";

export type SmokeReport = {
  base: string;
  steps: Array<{
    name: string;
    ok: boolean;
    status: number | null;
    ms: number;
    note?: string;
  }>;
};

export async function runReadApiSmoke(studyId: string, root = "."): Promise<SmokeReport> {
  const steps: SmokeReport["steps"] = [];

  const health = await fetchJson<{ ok?: boolean; status?: string }>("/health", { timeoutMs: 8000 });
  steps.push({
    name: "health",
    ok: health.ok,
    status: health.status ?? null,
    ms: health.ms,
    note: health.ok ? "" : (health as any).error,
  });

  const meta = await fetchJson<any>(`/studies/${studyId}/meta?root=${encodeURIComponent(root)}`, {
    timeoutMs: 20000,
    requireKey: true,
  });
  steps.push({
    name: "meta",
    ok: meta.ok,
    status: meta.status ?? null,
    ms: meta.ms,
    note: meta.ok ? "" : (meta as any).error,
  });

  const chunk = await fetchBinary(
    `/studies/${studyId}/chunk.bin?root=${encodeURIComponent(root)}&start=0&length=1024`,
    { timeoutMs: 20000, requireKey: true }
  );
  steps.push({
    name: "chunk.bin",
    ok: chunk.ok,
    status: chunk.status ?? null,
    ms: chunk.ms,
    note: chunk.ok ? `bytes=${chunk.data.byteLength}` : (chunk as any).error,
  });

  const artifacts = await fetchJson<any>(
    `/studies/${studyId}/artifacts?root=${encodeURIComponent(root)}`,
    { timeoutMs: 20000, requireKey: true }
  );
  steps.push({
    name: "artifacts",
    ok: artifacts.ok,
    status: artifacts.status ?? null,
    ms: artifacts.ms,
    note: artifacts.ok ? "" : (artifacts as any).error,
  });

  const annotations = await fetchJson<any>(
    `/studies/${studyId}/annotations?root=${encodeURIComponent(root)}`,
    { timeoutMs: 20000, requireKey: true }
  );
  steps.push({
    name: "annotations",
    ok: annotations.ok,
    status: annotations.status ?? null,
    ms: annotations.ms,
    note: annotations.ok ? "" : (annotations as any).error,
  });

  return {
    base: "(resolved in client)",
    steps,
  };
}
