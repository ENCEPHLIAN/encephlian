// =============================================================================
// AdminFinance — CFO dashboard + scenario simulator
//
// Pricing model:
//   • Platform access: ₹3,000/month → includes 10 study tokens (bonus)
//   • Topup pack:      ₹15,000 → 15 additional study tokens (usage-based)
//   Revenue per clinic = base_fee + (topup_packs × topup_price)
//   where topup_packs = ceil(max(0, token_consumption - base_tokens) / topup_tokens)
//
// Study types (token consumption):
//   • TAT  (Turnaround) = 1 token per study  — standard EEG
//   • STAT (Stat/urgent) = 2 tokens per study — priority processing
//
// COGS model (two tracks):
//   • Cash COGS   = only Vercel + Supabase while Azure credits active
//   • True COGS   = full Azure per-clinic compute + platform (for unit economics)
//
// Projection: 36-month, with configurable growth scenarios.
// =============================================================================

import { useState, useMemo, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell, ComposedChart,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import {
  TrendingUp, TrendingDown, DollarSign, Users,
  ChevronDown, ChevronUp, Zap, Target, Rocket, BarChart2,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TopupPack {
  tokens: number;
  priceInr: number;
  popular?: boolean;
}

interface TokenPricing {
  baseFeeInr: number;       // monthly subscription fee
  baseTokens: number;       // tokens included in base fee
  packs: TopupPack[];       // available topup packs (tiered, volume discount)
}

// Study types — token consumption per study
const STUDY_TYPES = [
  { id: "tat",  name: "TAT",  label: "Turnaround",     tokensPerStudy: 1, color: "#60a5fa", description: "Standard EEG — 1 token" },
  { id: "stat", name: "STAT", label: "Stat / Priority", tokensPerStudy: 2, color: "#f87171", description: "Priority processing — 2 tokens" },
] as const;

interface ClinicTier {
  id: string;
  name: string;
  studiesPerMonth: number;  // total studies/month
  statPct: number;          // fraction that are STAT (rest are TAT)
  azureVarUsd: number;      // Azure compute+storage+egress per clinic/month
  color: string;
  icon: string;
}

interface GrowthScenario {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  newClinicsPerMonth: { light: number; mid: number; heavy: number };
  churnMonthly: number;
}

interface Assumptions {
  usdInrRate: number;
  creditMonths: number;
  vercelUsd: number;
  acrUsd: number;
  supabaseProThreshold: number;
  founderOpexUsd: number;
  pricing: TokenPricing;
  tiers: ClinicTier[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PRICING: TokenPricing = {
  baseFeeInr: 3_000,
  baseTokens: 10,
  packs: [
    { tokens: 10,  priceInr: 1_500  },   // ₹150/token
    { tokens: 25,  priceInr: 3_499, popular: true },  // ₹140/token
    { tokens: 50,  priceInr: 6_499  },   // ₹130/token
    { tokens: 100, priceInr: 11_999 },   // ₹120/token
  ],
};

const DEFAULT_TIERS: ClinicTier[] = [
  { id: "light",  name: "Light Clinic",  studiesPerMonth: 25,  statPct: 0.10, azureVarUsd: 35, color: "#60a5fa", icon: "🏥" },
  { id: "mid",    name: "Mid Clinic",    studiesPerMonth: 75,  statPct: 0.20, azureVarUsd: 52, color: "#34d399", icon: "🏨" },
  { id: "heavy",  name: "Heavy Clinic",  studiesPerMonth: 300, statPct: 0.25, azureVarUsd: 65, color: "#a78bfa", icon: "🏦" },
];

const SCENARIOS: GrowthScenario[] = [
  {
    id: "conservative", name: "Conservative", icon: "🐢",
    description: "1 light + 0.5 mid clinic/month. Slow but steady.",
    color: "#94a3b8",
    newClinicsPerMonth: { light: 1, mid: 0, heavy: 0 },
    churnMonthly: 0.05,
  },
  {
    id: "base", name: "Base Case", icon: "📈",
    description: "1 light + 1 mid/month. Realistic year-1 target.",
    color: "#60a5fa",
    newClinicsPerMonth: { light: 1, mid: 1, heavy: 0 },
    churnMonthly: 0.03,
  },
  {
    id: "growth", name: "Growth", icon: "🚀",
    description: "2 light + 1 mid + 0.5 heavy/month. Strong sales motion.",
    color: "#34d399",
    newClinicsPerMonth: { light: 2, mid: 1, heavy: 0 },
    churnMonthly: 0.02,
  },
  {
    id: "aggressive", name: "Aggressive", icon: "⚡",
    description: "3 light + 2 mid + 1 heavy/month. Channel partners or enterprise deals.",
    color: "#f59e0b",
    newClinicsPerMonth: { light: 3, mid: 2, heavy: 1 },
    churnMonthly: 0.02,
  },
  {
    id: "moonshot", name: "Moonshot", icon: "🌕",
    description: "5 light + 3 mid + 2 heavy/month. Institutional rollout.",
    color: "#a78bfa",
    newClinicsPerMonth: { light: 5, mid: 3, heavy: 2 },
    churnMonthly: 0.01,
  },
];

const DEFAULT_ASSUMPTIONS: Assumptions = {
  usdInrRate: 84,
  creditMonths: 12,
  vercelUsd: 20,
  acrUsd: 5,
  supabaseProThreshold: 10,
  founderOpexUsd: 0,
  pricing: DEFAULT_PRICING,
  tiers: DEFAULT_TIERS,
};

// ─────────────────────────────────────────────────────────────────────────────
// Revenue model
// ─────────────────────────────────────────────────────────────────────────────

// Token consumption: TAT = 1 token/study, STAT = 2 tokens/study
function calcTokensConsumed(studies: number, statPct: number): number {
  const statStudies = Math.round(studies * statPct);
  const tatStudies  = studies - statStudies;
  return tatStudies * 1 + statStudies * 2;
}

// Greedy pack selection: satisfy deficit at minimum cost.
// Clinics rationally pick the cheapest pack(s) that cover their token need.
// Uses largest-first packs to minimize total spend.
function calcTopupCostInr(deficit: number, packs: TopupPack[]): { costInr: number; breakdown: { pack: TopupPack; qty: number }[] } {
  if (deficit <= 0) return { costInr: 0, breakdown: [] };
  // Sort packs largest → smallest to greedily cover deficit cheaply
  const sorted = [...packs].sort((a, b) => b.tokens - a.tokens);
  let remaining = deficit;
  let costInr = 0;
  const breakdown: { pack: TopupPack; qty: number }[] = [];
  for (const pack of sorted) {
    if (remaining <= 0) break;
    const qty = Math.floor(remaining / pack.tokens);
    if (qty > 0) {
      remaining -= qty * pack.tokens;
      costInr += qty * pack.priceInr;
      breakdown.push({ pack, qty });
    }
  }
  // Cover any remainder with smallest pack
  if (remaining > 0) {
    const smallest = sorted[sorted.length - 1];
    costInr += smallest.priceInr;
    const existing = breakdown.find(b => b.pack.tokens === smallest.tokens);
    if (existing) existing.qty++;
    else breakdown.push({ pack: smallest, qty: 1 });
  }
  return { costInr, breakdown };
}

function clinicMonthlyRevenueInr(
  studies: number,
  statPct: number,
  p: TokenPricing,
): number {
  const tokensConsumed = calcTokensConsumed(studies, statPct);
  const deficit = Math.max(0, tokensConsumed - p.baseTokens);
  const { costInr } = calcTopupCostInr(deficit, p.packs);
  return p.baseFeeInr + costInr;
}

// Per-study effective token cost (for unit economics display)
function effectiveTokensPerStudy(statPct: number): number {
  return (1 - statPct) * 1 + statPct * 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Projection engine
// ─────────────────────────────────────────────────────────────────────────────

interface MonthRow {
  month: number;
  label: string;
  yearLabel: string;
  clinics: { light: number; mid: number; heavy: number; total: number };
  mrrInr: number;
  mrrUsd: number;
  arrUsd: number;
  cogsCashUsd: number;
  cogsTrueUsd: number;
  grossProfitCashUsd: number;
  grossMarginCash: number;
  ebitdaCashUsd: number;
  ebitdaTrueUsd: number;
  ebitdaMarginCash: number;
  cumulativeEbitdaCash: number;
  creditActive: boolean;
}

function buildProjection(
  a: Assumptions,
  scenario: GrowthScenario,
  months = 36,
): MonthRow[] {
  const rows: MonthRow[] = [];
  let light = 0, mid = 0, heavy = 0;
  let cumEbitda = 0;

  for (let m = 1; m <= months; m++) {
    light  = Math.floor((light  + scenario.newClinicsPerMonth.light)  * (1 - scenario.churnMonthly));
    mid    = Math.floor((mid    + scenario.newClinicsPerMonth.mid)    * (1 - scenario.churnMonthly));
    heavy  = Math.floor((heavy  + scenario.newClinicsPerMonth.heavy)  * (1 - scenario.churnMonthly));
    const total = light + mid + heavy;

    // Revenue
    let mrrInr = 0;
    for (const [count, tier] of [[light, a.tiers[0]], [mid, a.tiers[1]], [heavy, a.tiers[2]]] as [number, ClinicTier][]) {
      mrrInr += count * clinicMonthlyRevenueInr(tier.studiesPerMonth, tier.statPct, a.pricing);
    }
    const mrrUsd = mrrInr / a.usdInrRate;

    // COGS
    const azureVar = light * a.tiers[0].azureVarUsd
                   + mid   * a.tiers[1].azureVarUsd
                   + heavy * a.tiers[2].azureVarUsd;
    const supaUsd = total >= a.supabaseProThreshold ? 25 : 0;
    const platformCash = a.vercelUsd + supaUsd;
    const creditActive = m <= a.creditMonths;

    const cogsCash = platformCash + (creditActive ? 0 : azureVar + a.acrUsd);
    const cogsTrue = platformCash + azureVar + a.acrUsd;

    const gpCash = mrrUsd - cogsCash;
    const gmCash = mrrUsd > 0 ? gpCash / mrrUsd : 0;
    const ebitdaCash = gpCash - a.founderOpexUsd;
    const ebitdaTrue = mrrUsd - cogsTrue - a.founderOpexUsd;
    cumEbitda += ebitdaCash;

    rows.push({
      month: m,
      label: m <= 12 ? `M${m}` : m <= 24 ? `M${m}` : `M${m}`,
      yearLabel: m <= 12 ? `Y1 M${m}` : m <= 24 ? `Y2 M${m - 12}` : `Y3 M${m - 24}`,
      clinics: { light, mid, heavy, total },
      mrrInr, mrrUsd,
      arrUsd: mrrUsd * 12,
      cogsCashUsd: cogsCash,
      cogsTrueUsd: cogsTrue,
      grossProfitCashUsd: gpCash,
      grossMarginCash: gmCash,
      ebitdaCashUsd: ebitdaCash,
      ebitdaTrueUsd: ebitdaTrue,
      ebitdaMarginCash: mrrUsd > 0 ? ebitdaCash / mrrUsd : 0,
      cumulativeEbitdaCash: cumEbitda,
      creditActive,
    });
  }
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

const fmtUsd = (v: number, compact = false) => {
  if (compact) {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
    return `$${v.toFixed(0)}`;
  }
  return `$${v.toFixed(2)}`;
};

const fmtInr = (v: number) => {
  if (Math.abs(v) >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(v) >= 100_000) return `₹${(v / 100_000).toFixed(2)}L`;
  if (Math.abs(v) >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${v.toFixed(0)}`;
};

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
  fontSize: 11,
  color: "hsl(var(--foreground))",
  padding: "8px 12px",
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, trend }: {
  label: string; value: string; sub?: string;
  trend?: "up" | "down" | "neutral";
}) {
  const clr = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-1 backdrop-blur-sm">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${clr}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest">{title}</h2>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function NumInput({ label, value, onChange, prefix, suffix, step, min }: {
  label: string; value: number; onChange: (v: number) => void;
  prefix?: string; suffix?: string; step?: number; min?: number;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 bg-muted/30 rounded px-2 py-1.5 border border-border/40 text-[12px]">
        {prefix && <span className="text-muted-foreground shrink-0">{prefix}</span>}
        <input
          type="number"
          step={step ?? 1}
          min={min ?? 0}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="bg-transparent w-full tabular-nums text-foreground outline-none min-w-0"
        />
        {suffix && <span className="text-muted-foreground shrink-0">{suffix}</span>}
      </div>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminFinance() {
  const [a, setA] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const [activeScenario, setActiveScenario] = useState<string>("base");
  const [compareScenario, setCompareScenario] = useState<string | null>(null);
  const [viewMonths, setViewMonths] = useState<12 | 24 | 36>(24);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const scenario = SCENARIOS.find(s => s.id === activeScenario)!;
  const compareS = compareScenario ? SCENARIOS.find(s => s.id === compareScenario) ?? null : null;

  const rows     = useMemo(() => buildProjection(a, scenario,   36), [a, scenario]);
  const cmpRows  = useMemo(() => compareS ? buildProjection(a, compareS, 36) : null, [a, compareS]);
  const view     = rows.slice(0, viewMonths);
  const cmpView  = cmpRows?.slice(0, viewMonths) ?? null;

  // Milestones
  const breakEven   = rows.find(r => r.ebitdaCashUsd > 0);
  const mrrMilestone100k = rows.find(r => r.mrrInr >= 100_000);
  const mrrMilestone1cr  = rows.find(r => r.mrrInr >= 10_000_000); // 1 crore INR
  const y1row = rows[11], y2row = rows[23], y3row = rows[35];

  // Revenue per clinic per tier (for display)
  const revenueByTier = a.tiers.map(t => {
    const tokensConsumed = calcTokensConsumed(t.studiesPerMonth, t.statPct);
    const deficit = Math.max(0, tokensConsumed - a.pricing.baseTokens);
    const { costInr: topupCostInr, breakdown: topupBreakdown } = calcTopupCostInr(deficit, a.pricing.packs);
    const monthlyRevenueInr = a.pricing.baseFeeInr + topupCostInr;
    const tatStudies  = Math.round(t.studiesPerMonth * (1 - t.statPct));
    const statStudies = t.studiesPerMonth - tatStudies;
    return {
      ...t, tokensConsumed, deficit, topupCostInr, topupBreakdown,
      monthlyRevenueInr,
      monthlyRevenueUsd: monthlyRevenueInr / a.usdInrRate,
      tatStudies, statStudies,
    };
  });

  // Chart data — merge primary + comparison
  const chartData = view.map((r, i) => ({
    label: r.month % 3 === 0 || r.month <= 3 ? r.yearLabel : "",
    m: r.month,
    mrrUsd: r.mrrUsd,
    ebitdaCash: r.ebitdaCashUsd,
    cogsCash: r.cogsCashUsd,
    mrrUsd_cmp: cmpView?.[i]?.mrrUsd ?? null,
    ebitda_cmp: cmpView?.[i]?.ebitdaCashUsd ?? null,
    cumEbitda: r.cumulativeEbitdaCash,
    lightRev: (r.clinics.light * revenueByTier[0].monthlyRevenueInr) / a.usdInrRate,
    midRev:   (r.clinics.mid   * revenueByTier[1].monthlyRevenueInr) / a.usdInrRate,
    heavyRev: (r.clinics.heavy * revenueByTier[2].monthlyRevenueInr) / a.usdInrRate,
    clinics: r.clinics.total,
    creditActive: r.creditActive ? 1 : 0,
  }));


  return (
    <div className="p-6 space-y-8 max-w-7xl">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-400" />
            Financial Model &amp; Projections
          </h1>
          <p className="text-[12px] text-muted-foreground mt-1">
            Token-based revenue model · EBITDA projections · Scenario simulator · Live unit economics
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAssumptions(v => !v)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border/60 rounded-lg px-3 py-1.5 transition-colors"
          >
            {showAssumptions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Assumptions
          </button>
          <div className="flex gap-1 text-[11px] border border-border/60 rounded-lg overflow-hidden">
            {([12, 24, 36] as const).map(n => (
              <button key={n} onClick={() => setViewMonths(n)}
                className={`px-3 py-1.5 transition-colors ${viewMonths === n ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {n}mo
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Assumptions panel ── */}
      {showAssumptions && (
        <div className="rounded-xl border border-border/60 bg-muted/10 p-5 space-y-5">
          <SectionHead title="Model Assumptions" sub="All projections recompute in real-time." />

          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Token pricing</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <NumInput label="Platform fee (base/mo)" value={a.pricing.baseFeeInr}
                onChange={v => setA(p => ({ ...p, pricing: { ...p.pricing, baseFeeInr: v } }))} prefix="₹" suffix="/mo" />
              <NumInput label="Tokens included in base" value={a.pricing.baseTokens}
                onChange={v => setA(p => ({ ...p, pricing: { ...p.pricing, baseTokens: v } }))} suffix="tokens" />
            </div>
            <p className="text-[10px] text-muted-foreground mb-1.5">Topup packs (tiered)</p>
            <div className="rounded border border-border/40 overflow-hidden">
              <table className="w-full text-[11px]">
                <thead><tr className="text-muted-foreground border-b border-border/40 text-right bg-muted/20">
                  <th className="text-left py-1.5 px-3">Pack</th>
                  <th className="py-1.5 px-3">Price (₹)</th>
                  <th className="py-1.5 px-3">₹/token</th>
                  <th className="py-1.5 px-3 text-center">Tag</th>
                </tr></thead>
                <tbody className="divide-y divide-border/20">
                  {a.pricing.packs.map((pack, i) => (
                    <tr key={i} className={`text-right ${pack.popular ? "bg-primary/5" : ""}`}>
                      <td className="py-1.5 px-3 text-left text-foreground">{pack.tokens} tokens</td>
                      <td className="py-1.5 px-3">
                        <input type="number" step={100} value={pack.priceInr}
                          onChange={e => setA(p => ({ ...p, pricing: { ...p.pricing, packs: p.pricing.packs.map((pk, j) => j === i ? { ...pk, priceInr: Number(e.target.value) } : pk) } }))}
                          className="bg-transparent w-24 text-right tabular-nums text-foreground outline-none" />
                      </td>
                      <td className="py-1.5 px-3 text-muted-foreground tabular-nums">{Math.round(pack.priceInr / pack.tokens)}</td>
                      <td className="py-1.5 px-3 text-center">
                        {pack.popular ? <span className="text-[9px] bg-primary/20 text-primary rounded px-1.5 py-0.5">Popular</span> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Azure COGS per clinic / month</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {a.tiers.map((t, i) => (
                <div key={t.id} className="rounded-lg border border-border/40 p-3 space-y-2">
                  <p className="text-[11px] font-medium" style={{ color: t.color }}>{t.icon} {t.name} — {t.studiesPerMonth} studies/mo</p>
                  <NumInput label="Studies/month" value={t.studiesPerMonth} step={5}
                    onChange={v => setA(p => ({ ...p, tiers: p.tiers.map((x, j) => j === i ? { ...x, studiesPerMonth: v } : x) }))} />
                  <NumInput label="STAT study mix %" value={Math.round(t.statPct * 100)} step={5} suffix="% STAT"
                    onChange={v => setA(p => ({ ...p, tiers: p.tiers.map((x, j) => j === i ? { ...x, statPct: Math.min(1, v / 100) } : x) }))} />
                  <NumInput label="Azure COGS (USD/mo)" value={t.azureVarUsd} step={0.5} prefix="$"
                    onChange={v => setA(p => ({ ...p, tiers: p.tiers.map((x, j) => j === i ? { ...x, azureVarUsd: v } : x) }))} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <NumInput label="₹ / USD" value={a.usdInrRate} step={0.5} onChange={v => setA(p => ({ ...p, usdInrRate: v }))} prefix="₹" />
            <NumInput label="Azure credit months" value={a.creditMonths} onChange={v => setA(p => ({ ...p, creditMonths: v }))} suffix="mo" />
            <NumInput label="Vercel (fixed)" value={a.vercelUsd} onChange={v => setA(p => ({ ...p, vercelUsd: v }))} prefix="$" suffix="/mo" />
            <NumInput label="Founder OpEx (imputed)" value={a.founderOpexUsd} onChange={v => setA(p => ({ ...p, founderOpexUsd: v }))} prefix="$" suffix="/mo" />
          </div>
        </div>
      )}

      {/* ── Token pricing explainer ── */}
      <div className="rounded-xl border border-border/60 bg-card/40 p-5">
        <SectionHead title="Revenue Model — Token Economics" sub="Each study consumes 1 token. Clinics buy topup packs when base tokens run out." />
        <div className="grid sm:grid-cols-3 gap-4">
          {revenueByTier.map(t => {
            const revenueUsd = t.monthlyRevenueUsd;
            const cogsTrue = t.azureVarUsd + (a.acrUsd / 3); // ACR split
            const contrTrue = revenueUsd - cogsTrue - (a.vercelUsd / 5); // Vercel split over ~5 clinics
            const contrCash = revenueUsd - (a.vercelUsd / 5);
            const gmTrue = revenueUsd > 0 ? contrTrue / revenueUsd : 0;
            const gmCash = revenueUsd > 0 ? contrCash / revenueUsd : 0;
            const ltv = contrCash * (1 / 0.03); // 3% default churn

            return (
              <div key={t.id} className="rounded-lg border p-4 space-y-3" style={{ borderColor: t.color + "50" }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: t.color }}>{t.icon} {t.name}</p>
                  <span className="text-[10px] text-muted-foreground">{t.studiesPerMonth} studies/mo</span>
                </div>

                <div className="space-y-1 text-[11px]">
                  {/* Study type breakdown */}
                  <div className="flex justify-between">
                    <span className="text-blue-300">TAT studies (1 token each)</span>
                    <span className="tabular-nums">{t.tatStudies} × 1 = {t.tatStudies} tkn</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-300">STAT studies (2 tokens each)</span>
                    <span className="tabular-nums">{t.statStudies} × 2 = {t.statStudies * 2} tkn</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground border-b border-border/30 pb-1">
                    <span>Total tokens consumed</span>
                    <span className="tabular-nums font-medium text-foreground">{t.tokensConsumed} tokens</span>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span className="text-muted-foreground">Base fee</span>
                    <span>{fmtInr(a.pricing.baseFeeInr)} <span className="text-muted-foreground">({a.pricing.baseTokens} tokens incl.)</span></span>
                  </div>
                  {t.topupBreakdown.length === 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Topup</span>
                      <span className="text-muted-foreground">none needed</span>
                    </div>
                  ) : t.topupBreakdown.map(({ pack, qty }) => (
                    <div key={pack.tokens} className="flex justify-between">
                      <span className="text-muted-foreground">{qty}× {pack.tokens}-token pack{pack.popular ? " ⭐" : ""}</span>
                      <span className="text-emerald-400 tabular-nums">+{fmtInr(qty * pack.priceInr)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border/40 pt-1 font-medium">
                    <span>Monthly revenue</span>
                    <span style={{ color: t.color }}>{fmtInr(t.monthlyRevenueInr)} <span className="text-muted-foreground font-normal">({fmtUsd(revenueUsd)})</span></span>
                  </div>
                </div>

                <div className="space-y-1 text-[11px] border-t border-border/40 pt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Azure COGS (true)</span>
                    <span className="text-blue-300">{fmtUsd(t.azureVarUsd)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Azure COGS (credit period)</span>
                    <span className="text-emerald-400">$0.00 ✓</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross margin (cash)</span>
                    <span className="text-emerald-400 font-medium">{fmtPct(gmCash)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Gross margin (true)</span>
                    <span className={`font-medium ${gmTrue >= 0.3 ? "text-emerald-400" : gmTrue >= 0 ? "text-yellow-400" : "text-red-400"}`}>{fmtPct(gmTrue)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/40 pt-1 font-semibold">
                    <span>LTV (cash basis)</span>
                    <span className="text-foreground">{fmtUsd(ltv, true)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scenario selector ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHead title="Growth Scenario" sub="Select primary scenario. Optionally compare against a second." />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {SCENARIOS.map(s => (
            <button
              key={s.id}
              onClick={() => { setActiveScenario(s.id); if (compareScenario === s.id) setCompareScenario(null); }}
              className={`rounded-xl border p-3 text-left transition-all space-y-1 ${
                activeScenario === s.id
                  ? "border-2 bg-card/80 shadow-md"
                  : "border-border/40 bg-card/20 opacity-70 hover:opacity-90"
              }`}
              style={{ borderColor: activeScenario === s.id ? s.color : undefined }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-lg">{s.icon}</span>
                <span className="text-[12px] font-semibold" style={{ color: s.color }}>{s.name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">{s.description}</p>
              <p className="text-[10px] text-muted-foreground">churn {fmtPct(s.churnMonthly)}/mo</p>
            </button>
          ))}
        </div>

        {/* Compare toggle */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
          <span>Compare against:</span>
          {SCENARIOS.filter(s => s.id !== activeScenario).map(s => (
            <button key={s.id} onClick={() => setCompareScenario(compareScenario === s.id ? null : s.id)}
              className={`px-2 py-1 rounded border transition-colors ${
                compareScenario === s.id ? "border-current text-foreground" : "border-border/40 hover:text-foreground"
              }`}
              style={{ color: compareScenario === s.id ? s.color : undefined }}>
              {s.icon} {s.name}
            </button>
          ))}
          {compareScenario && <button onClick={() => setCompareScenario(null)} className="text-muted-foreground/50 hover:text-muted-foreground">✕ clear</button>}
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label={`MRR at M${viewMonths}`}
          value={fmtInr(rows[viewMonths - 1]?.mrrInr ?? 0)}
          sub={fmtUsd(rows[viewMonths - 1]?.mrrUsd ?? 0, true) + "/mo"}
          trend="up"
        />
        <KpiCard
          label={`ARR at M${viewMonths}`}
          value={fmtUsd(rows[viewMonths - 1]?.arrUsd ?? 0, true)}
          sub={fmtInr((rows[viewMonths - 1]?.mrrInr ?? 0) * 12) + " annual"}
          trend="up"
        />
        <KpiCard
          label="GM% at M12 (cash)"
          value={fmtPct(y1row.grossMarginCash)}
          sub={"true: " + fmtPct(y1row.grossMarginCash === 1 ? 0 : (y1row.mrrUsd - y1row.cogsTrueUsd) / Math.max(y1row.mrrUsd, 0.01))}
          trend={y1row.grossMarginCash > 0.6 ? "up" : "neutral"}
        />
        <KpiCard
          label="EBITDA margin Y1"
          value={fmtPct(y1row.ebitdaMarginCash)}
          sub={fmtUsd(y1row.ebitdaCashUsd, true) + "/mo at M12"}
          trend={y1row.ebitdaCashUsd > 0 ? "up" : "down"}
        />
        <KpiCard
          label="Break-even"
          value={breakEven ? `Month ${breakEven.month}` : "> 36mo"}
          sub={breakEven ? `${breakEven.clinics.total} clinics, ${fmtInr(breakEven.mrrInr)} MRR` : "adjust growth rate"}
          trend={breakEven && breakEven.month <= 12 ? "up" : breakEven ? "neutral" : "down"}
        />
        <KpiCard
          label="₹1Cr MRR"
          value={mrrMilestone1cr ? `Month ${mrrMilestone1cr.month}` : "> 36mo"}
          sub={mrrMilestone1cr ? `${mrrMilestone1cr.clinics.total} clinics` : "with current growth"}
          trend={mrrMilestone1cr && mrrMilestone1cr.month <= 24 ? "up" : "neutral"}
        />
      </div>

      {/* ── MRR growth + COGS chart ── */}
      <div className="rounded-xl border border-border/60 p-5 space-y-3">
        <SectionHead
          title="MRR Trajectory"
          sub="Revenue (solid) vs COGS cash (dashed red). Amber line = Azure credit cliff."
        />
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={scenario.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={scenario.color} stopOpacity={0} />
              </linearGradient>
              {compareS && (
                <linearGradient id="cmpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={compareS.color} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={compareS.color} stopOpacity={0} />
                </linearGradient>
              )}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="m" tickFormatter={v => `M${v}`} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tickFormatter={v => fmtUsd(v, true)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={48} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number, name: string) => [
                name.startsWith("MRR") ? `${fmtUsd(v)} (${fmtInr(v * a.usdInrRate)})` : fmtUsd(v),
                name,
              ]}
              labelFormatter={l => `Month ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {a.creditMonths <= viewMonths && (
              <ReferenceLine x={a.creditMonths} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5}
                label={{ value: `Credit cliff (M${a.creditMonths})`, position: "insideTopRight", fontSize: 10, fill: "#f59e0b" }} />
            )}
            {breakEven && breakEven.month <= viewMonths && (
              <ReferenceLine x={breakEven.month} stroke="#34d399" strokeDasharray="4 2" strokeWidth={1}
                label={{ value: "Break-even", position: "insideTopLeft", fontSize: 10, fill: "#34d399" }} />
            )}
            <Area type="monotone" dataKey="mrrUsd" name={`MRR — ${scenario.name}`}
              stroke={scenario.color} fill="url(#mrrGrad)" strokeWidth={2.5} dot={false} />
            {compareS && (
              <Area type="monotone" dataKey="mrrUsd_cmp" name={`MRR — ${compareS.name}`}
                stroke={compareS.color} fill="url(#cmpGrad)" strokeWidth={1.5} dot={false} strokeDasharray="6 2" />
            )}
            <Line type="monotone" dataKey="cogsCash" name="COGS (cash)"
              stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── EBITDA + Revenue mix ── */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* EBITDA bars */}
        <div className="rounded-xl border border-border/60 p-5 space-y-3">
          <SectionHead title="Monthly EBITDA (Cash)" sub="Green = profitable. Dashed line = EBITDA on true cost." />
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
              <XAxis dataKey="m" tickFormatter={v => `M${v}`} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={v => fmtUsd(v, true)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={44} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmtUsd(v), n]} labelFormatter={l => `Month ${l}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
              <Bar dataKey="ebitdaCash" name="EBITDA (cash)" radius={[3, 3, 0, 0]}>
                {chartData.map((row, i) => (
                  <Cell key={i} fill={row.ebitdaCash >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.85} />
                ))}
              </Bar>
              {compareS && cmpView && (
                <Line type="monotone" dataKey="ebitda_cmp" name={`EBITDA — ${compareS.name}`}
                  stroke={compareS.color} strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue mix stacked */}
        <div className="rounded-xl border border-border/60 p-5 space-y-3">
          <SectionHead title="Revenue Mix by Tier" sub="Stacked MRR (USD) — shows contribution of each clinic tier." />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData.filter((_, i) => i % (viewMonths > 12 ? 2 : 1) === 0)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
              <XAxis dataKey="m" tickFormatter={v => `M${v}`} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={v => fmtUsd(v, true)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={44} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmtUsd(v), n]} labelFormatter={l => `Month ${l}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="lightRev"  name={`${a.tiers[0].icon} ${a.tiers[0].name}`} stackId="r" fill={a.tiers[0].color} />
              <Bar dataKey="midRev"    name={`${a.tiers[1].icon} ${a.tiers[1].name}`} stackId="r" fill={a.tiers[1].color} />
              <Bar dataKey="heavyRev"  name={`${a.tiers[2].icon} ${a.tiers[2].name}`} stackId="r" fill={a.tiers[2].color} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Cumulative EBITDA ── */}
      <div className="rounded-xl border border-border/60 p-5 space-y-3">
        <SectionHead title="Cumulative EBITDA (Cash)" sub="Crosses zero = all historical cash losses recouped. This is the J-curve." />
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cumGreenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#34d399" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="m" tickFormatter={v => `M${v}`} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tickFormatter={v => fmtUsd(v, true)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={52} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtUsd(v), "Cumulative EBITDA"]} labelFormatter={l => `Month ${l}`} />
            <ReferenceLine y={0} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: "Break-even (cumulative)", position: "insideTopLeft", fontSize: 10, fill: "#f59e0b" }} />
            <Area type="monotone" dataKey="cumEbitda" stroke="#34d399" fill="url(#cumGreenGrad)" strokeWidth={2.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Monthly P&L table ── */}
      <div className="rounded-xl border border-border/60 p-5 space-y-3">
        <SectionHead title="Monthly P&L" sub="First 24 months. CLIFF row = Azure credits expire, COGS jumps." />
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[860px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border/50 text-right">
                <th className="text-left py-2 pr-3 font-medium w-20">Period</th>
                <th className="py-2 px-2 font-medium">Clinics</th>
                <th className="py-2 px-2 font-medium">MRR (₹)</th>
                <th className="py-2 px-2 font-medium">MRR ($)</th>
                <th className="py-2 px-2 font-medium">COGS cash</th>
                <th className="py-2 px-2 font-medium">COGS true</th>
                <th className="py-2 px-2 font-medium">Gross profit</th>
                <th className="py-2 px-2 font-medium">GM %</th>
                <th className="py-2 px-2 font-medium">EBITDA cash</th>
                <th className="py-2 px-2 font-medium">EBITDA true</th>
                <th className="py-2 px-2 font-medium">Cumulative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {rows.slice(0, 24).map(r => {
                const isCliff = r.month === a.creditMonths + 1;
                const isBreakEven = r.month === breakEven?.month;
                return (
                  <tr key={r.month}
                    className={`text-right transition-colors hover:bg-muted/20 ${
                      isCliff ? "bg-amber-500/8 ring-1 ring-inset ring-amber-500/30" :
                      isBreakEven ? "bg-emerald-500/8 ring-1 ring-inset ring-emerald-500/30" : ""
                    }`}>
                    <td className="text-left py-1.5 pr-3 tabular-nums text-muted-foreground">
                      {r.yearLabel}
                      {isCliff && <span className="ml-1 text-amber-500 text-[9px] font-medium">CLIFF↑</span>}
                      {isBreakEven && <span className="ml-1 text-emerald-500 text-[9px] font-medium">BREAK-EVEN</span>}
                    </td>
                    <td className="py-1.5 px-2 text-foreground">{r.clinics.total}</td>
                    <td className="py-1.5 px-2 tabular-nums text-foreground">{fmtInr(r.mrrInr)}</td>
                    <td className="py-1.5 px-2 tabular-nums text-foreground">{fmtUsd(r.mrrUsd, true)}</td>
                    <td className="py-1.5 px-2 tabular-nums text-orange-300">{fmtUsd(r.cogsCashUsd, true)}</td>
                    <td className="py-1.5 px-2 tabular-nums text-blue-300/70">{fmtUsd(r.cogsTrueUsd, true)}</td>
                    <td className={`py-1.5 px-2 tabular-nums ${r.grossProfitCashUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUsd(r.grossProfitCashUsd, true)}</td>
                    <td className="py-1.5 px-2 tabular-nums text-foreground">{fmtPct(r.grossMarginCash)}</td>
                    <td className={`py-1.5 px-2 tabular-nums font-medium ${r.ebitdaCashUsd >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUsd(r.ebitdaCashUsd, true)}</td>
                    <td className={`py-1.5 px-2 tabular-nums ${r.ebitdaTrueUsd >= 0 ? "text-emerald-300/50" : "text-red-400/50"}`}>{fmtUsd(r.ebitdaTrueUsd, true)}</td>
                    <td className={`py-1.5 px-2 tabular-nums font-semibold ${r.cumulativeEbitdaCash >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtUsd(r.cumulativeEbitdaCash, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 3-year milestone summary ── */}
      <div className="rounded-xl border border-border/60 p-5 space-y-4">
        <SectionHead title="3-Year Milestones" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "ARR — Year 1",   value: fmtUsd(y1row.arrUsd, true),  sub: fmtInr(y1row.mrrInr * 12),         ok: y1row.arrUsd > 0 },
            { label: "ARR — Year 2",   value: fmtUsd(y2row.arrUsd, true),  sub: fmtInr(y2row.mrrInr * 12),         ok: y2row.arrUsd > 5000 },
            { label: "ARR — Year 3",   value: fmtUsd(y3row.arrUsd, true),  sub: fmtInr(y3row.mrrInr * 12),         ok: y3row.arrUsd > 50000 },
            { label: "Clinics — Y3",   value: String(y3row.clinics.total),  sub: `L:${y3row.clinics.light} M:${y3row.clinics.mid} H:${y3row.clinics.heavy}`, ok: true },
            { label: "Cum. EBITDA Y1", value: fmtUsd(y1row.cumulativeEbitdaCash, true), sub: "cash basis total",   ok: y1row.cumulativeEbitdaCash >= 0 },
            { label: "Cum. EBITDA Y2", value: fmtUsd(y2row.cumulativeEbitdaCash, true), sub: "cash basis total",   ok: y2row.cumulativeEbitdaCash >= 0 },
            { label: "EBITDA Margin Y3 (cash)",  value: fmtPct(y3row.ebitdaMarginCash),  sub: "monthly at M36",   ok: y3row.ebitdaMarginCash > 0.4 },
            { label: "EBITDA Margin Y3 (true)",  value: fmtPct(y3row.ebitdaTrueUsd / Math.max(y3row.mrrUsd, 0.01)), sub: "full Azure cost", ok: y3row.ebitdaTrueUsd > 0 },
          ].map(({ label, value, sub, ok }) => (
            <div key={label} className="rounded-lg border border-border/40 p-3 space-y-0.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`text-xl font-bold tabular-nums ${ok ? "text-emerald-400" : "text-red-400"}`}>{value}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scenario comparison table ── */}
      {compareS && cmpRows && (
        <div className="rounded-xl border border-border/60 p-5 space-y-3">
          <SectionHead title={`Scenario Comparison — ${scenario.name} vs ${compareS.name}`} />
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border/50 text-right">
                <th className="text-left py-2 font-medium">Metric</th>
                <th className="py-2 font-medium" style={{ color: scenario.color }}>{scenario.icon} {scenario.name}</th>
                <th className="py-2 font-medium" style={{ color: compareS.color }}>{compareS.icon} {compareS.name}</th>
                <th className="py-2 font-medium text-muted-foreground">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {[
                { label: "MRR at M12", a: rows[11].mrrUsd, b: cmpRows[11].mrrUsd, fmt: (v: number) => fmtUsd(v, true) },
                { label: "ARR at M12", a: rows[11].arrUsd, b: cmpRows[11].arrUsd, fmt: (v: number) => fmtUsd(v, true) },
                { label: "MRR at M24", a: rows[23].mrrUsd, b: cmpRows[23].mrrUsd, fmt: (v: number) => fmtUsd(v, true) },
                { label: "Clinics at M24", a: rows[23].clinics.total, b: cmpRows[23].clinics.total, fmt: (v: number) => String(v) },
                { label: "EBITDA at M12 (cash)", a: rows[11].ebitdaCashUsd, b: cmpRows[11].ebitdaCashUsd, fmt: (v: number) => fmtUsd(v, true) },
                { label: "Break-even month", a: (rows.find(r => r.ebitdaCashUsd > 0)?.month ?? 999), b: (cmpRows.find(r => r.ebitdaCashUsd > 0)?.month ?? 999), fmt: (v: number) => v >= 999 ? ">36" : `M${v}` },
                { label: "Cum. EBITDA Y2 (cash)", a: rows[23].cumulativeEbitdaCash, b: cmpRows[23].cumulativeEbitdaCash, fmt: (v: number) => fmtUsd(v, true) },
              ].map(({ label, a: av, b: bv, fmt }) => {
                const delta = av - bv;
                return (
                  <tr key={label} className="text-right hover:bg-muted/20">
                    <td className="text-left py-1.5 text-muted-foreground">{label}</td>
                    <td className="py-1.5 px-3 tabular-nums font-medium" style={{ color: scenario.color }}>{fmt(av)}</td>
                    <td className="py-1.5 px-3 tabular-nums font-medium" style={{ color: compareS.color }}>{fmt(bv)}</td>
                    <td className={`py-1.5 px-3 tabular-nums ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                      {delta > 0 ? "+" : ""}{fmt(delta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Methodology ── */}
      <div className="rounded-xl border border-border/60 p-5 text-[11px] text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground text-xs">Definitions &amp; Methodology</p>
        <p><span className="text-foreground">Token model</span> — ₹{a.pricing.baseFeeInr.toLocaleString()} base fee gives {a.pricing.baseTokens} tokens/month. Additional tokens bought as packs: {a.pricing.packs.map(pk => `${pk.tokens}tkn=₹${pk.priceInr.toLocaleString()}`).join(", ")}. Greedy pack selection: largest pack first to minimise per-token cost. Revenue per clinic scales with actual study volume and TAT/STAT mix.</p>
        <p><span className="text-foreground">Study types</span> — TAT (Turnaround) = 1 token per study. STAT (Stat/priority) = 2 tokens per study. A clinic doing 20 TAT + 5 STAT consumes 20 + 10 = 30 tokens — not 25. STAT studies drive disproportionate token revenue. Adjustable per tier in Assumptions.</p>
        <p><span className="text-foreground">COGS (cash)</span> — Only Vercel + Supabase while Azure credits active (M1–M{a.creditMonths}). After credit cliff: full Azure compute + ACR added.</p>
        <p><span className="text-foreground">COGS (true)</span> — Full Azure variable COGS + ACR always. Use for long-run unit economics and pricing decisions.</p>
        <p><span className="text-foreground">EBITDA</span> — Revenue − COGS − OpEx. No D&A (no significant depreciable assets). Pre-tax, pre-interest. Suitable for early-stage SaaS modelling.</p>
        <p><span className="text-foreground">LTV</span> — Contribution margin × (1 / monthly churn). Not discounted. Use as directional upper bound.</p>
        <p><span className="text-foreground">Azure credit cliff</span> — At month {a.creditMonths + 1}, Azure COGS becomes real cash outflow. Model highlights this row in amber.</p>
        <p className="pt-1 opacity-50">This is a planning tool. Actuals will differ. Update assumptions as real revenue data comes in.</p>
      </div>
    </div>
  );
}
