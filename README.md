# encephlian (E-Plane)

ENCEPHLIAN's clinician-facing surface — upload wizard, EEG viewer, triage results, structured report drafts, admin. React + TypeScript + Vite, served from Vercel.

Backend (C-Plane, I-Plane, training, vendor adapters) lives in [`../encephlian-core`](../encephlian-core). Strategic doc: [`../encephlian-core/docs/ENCEPHLIAN_ARCHITECTURE_v2.2.md`](../encephlian-core/docs/ENCEPHLIAN_ARCHITECTURE_v2.2.md).

---

## Architecture — Four Planes (E-Plane scope)

| Plane | Role | Where |
|---|---|---|
| **A-Plane** — Acquisition | Browser upload wizard, direct-to-blob SAS upload, multi-file vendor bundle support, vendor registry. | `src/pages/app/Studies.tsx`, `src/components/upload/`, `src/shared/uploadVendor*` |
| **C-Plane** — Canonicalize | (External) Vendor file → ESF v1.0. | `encephlian-core/apps/cplane/` |
| **I-Plane** — Intelligence | (External) MIND Triage v3, MIND Clean v1, spectral rules, biomarkers; ARIA tier (AEGIS, FORGE, VERTEX) in build. | `encephlian-core/apps/iplane/` |
| **E-Plane** — Experience | This repo. EEG viewer (WebGL/Three.js), triage panel, biomarker findings, report editor, clinic admin, super-admin tools. | `src/` |

**Two-tier model surface**
- **ARIA tier** (future) — AEGIS artifact head, FORGE clinic-invariant embedding, VERTEX clinical heads.
- **MIND tier** (current) — Triage v3 + Clean v1 + deterministic biomarkers + SCORE §9 ontology gates.

**Model validation gate.** No model goes to `model_versions.status='serving'` without an independent validation run in `model_validation_runs` with verdict ∈ {functional, excellent}. A DB trigger enforces this. Admin viewer: `src/pages/admin/AdminValidationRuns.tsx`. Post-mortem: [`docs/postmortem_vigil_clean_v2.md`](docs/postmortem_vigil_clean_v2.md).

---

## Quickstart (fresh contributor)

```sh
npm install            # or: bun install
npm run dev            # http://localhost:5173
npm run typecheck
npm run test           # vitest
npm run lint
npm run build
```

Env vars (read from `.env.local`, never commit):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase remote (no local Docker).
- `VITE_ENCEPH_READ_API_BASE` — Read API in Azure.
- Any service-role keys — **never in the frontend bundle**; only used by server-side scripts via env.

Deploy is Vercel for the SPA and `supabase functions deploy <name>` for edge functions. We do not run `supabase start` or local Docker — environment is Azure + Supabase remote.

---

## Recent infrastructure (2026-06-02)

Shipped today (see `git log --since=2026-06-01`):

- **Validation gate trigger** (`8080986`, `c7c2720`) — `model_validation_runs` table + `enforce_model_validation_for_serving` trigger. Admin viewer at `/admin/validation-runs` (`AdminValidationRuns.tsx`).
- **Failover UX** (`74efdd5`, `212e542`) — 9 prebuilt failover scenario reports surfaced through `systemFeedback`. Honest-copy refactor across StudyDetail, viewer, wizard. Design: [`docs/failover_ux_design.md`](docs/failover_ux_design.md).
- **Pilot/internal split design** (`d65909b`) — page-tree separation `/pilot/*` vs `/app/*`. Design: [`docs/pilot_internal_split_design.md`](docs/pilot_internal_split_design.md).
- **VIGIL + Clean v2 post-mortem** (`d65909b`) — [`docs/postmortem_vigil_clean_v2.md`](docs/postmortem_vigil_clean_v2.md). Reads in 5 min, prevents the next silent-failure pattern.
- **Predictive prefetch in viewer** (`bb0a159`) — chunk prefetch cuts perceived seek latency ~50%.
- **Edit-delta capture flywheel closed for biomarkers** (`63c7af9`) — inline accept/uncertain/reject on biomarker events writes `biomarker_event_feedback` rows. Feeds the AEGIS/VERTEX retraining loop.
- **Clean v2 deprecation surfaced honestly** (`44cfa2b`) — viewer no longer claims artifact-classified windows when Clean v2 is off; trust panel reflects deprecation.
- **Hardcoded chrome lies removed** (`de0e80e`, `85e7da1`, `f46c9b9`) — no more "MIND-Triage v3 · AUC 85.7%" in viewer header; duplicate CTAs collapsed, debug surfaces hidden, dead code killed.
- **Multi-file vendor bundle upload UX** (`db599ed`) — wizard accepts Natus `.e + .erd + .ncs`, EGI `.mff` directory, Persyst `.lay + .dat`, etc.
- **Edge function audit** (`247e237`) — [`docs/edge_functions_audit_20260602.md`](docs/edge_functions_audit_20260602.md). 3 dead, 1 broken, 1 dangerous, 2 consolidation candidates.

---

## Working norms

**MCP-first for Supabase.** Never paste a service-role JWT into a shell command or commit one (we have scrubbed leaks — `3f7cd8c`). Use the Supabase MCP tools (`mcp__plugin_supabase_supabase__*`) for DB ops. For migrations: `apply_migration`. For schema reads: `list_tables`, `execute_sql`. For ad-hoc scripts in `scripts/`: read keys from env, never from string literals. Rotate any key that ever appeared in git history.

**Validation gate discipline.** No model goes to `status='serving'` without an independent validation run logged. The trigger enforces this; the gate is dumb on purpose so a tired engineer can't bypass it by mistake.

**Honesty primacy.** When the model has nothing to say, the UI says "no finding available" or "pending" with `derived_from = "pending"`. We do not paint confidence bars on absent data. See `aesthetic_encephlian.md` for the design philosophy.

**Smallest diff.** Verify against the deployed surface, not against your own diff. `get_edge_function`, real curl, real network tab.

---

## Layout

```
src/
  pages/
    admin/            Super-admin + management surface (~28 pages)
    app/              Clinician surface (Dashboard, Studies, StudyDetail, SignalViewer, Reports, ...)
    legal/            Public legal tree (Terms, Privacy, Refund, Support)
    Login.tsx, ResetPassword.tsx, NotFound.tsx, Index.tsx
  components/         Shared UI (shadcn-derived + custom)
  contexts/, hooks/   Session, SKU, system feedback, query helpers
  integrations/       Supabase client, edge function wrappers
  shared/             Cross-cutting helpers (upload vendor handling, reports, etc.)
  docs/               In-app docs surface
supabase/
  functions/          Edge functions (~20 total — see edge_functions_audit_20260602.md)
  migrations/         SQL migrations (apply via Supabase MCP)
docs/                 Design docs, post-mortems, audits, ops notes
scripts/              Build helpers, schema export, one-off backfills
public/, index.html, vite.config.ts, vitest.config.ts, vercel.json
```

---

## Pointers

- Architecture (strategic): [`../encephlian-core/docs/ENCEPHLIAN_ARCHITECTURE_v2.2.md`](../encephlian-core/docs/ENCEPHLIAN_ARCHITECTURE_v2.2.md)
- ESF v1 spec: [`../encephlian-core/docs/specs/esf-v1.md`](../encephlian-core/docs/specs/esf-v1.md)
- Pilot/internal split: [`docs/pilot_internal_split_design.md`](docs/pilot_internal_split_design.md)
- Failover UX: [`docs/failover_ux_design.md`](docs/failover_ux_design.md)
- VIGIL + Clean v2 post-mortem: [`docs/postmortem_vigil_clean_v2.md`](docs/postmortem_vigil_clean_v2.md)
- Edge function audit: [`docs/edge_functions_audit_20260602.md`](docs/edge_functions_audit_20260602.md)
- Migration drift audit: [`docs/migration_drift_audit_20260602.md`](docs/migration_drift_audit_20260602.md)
- Backup verification: [`docs/backup-verification.md`](docs/backup-verification.md)
- Migrations runbook: [`docs/migrations.md`](docs/migrations.md)
- AUGUR (structured report) design: [`../encephlian-core/docs/specs/augur-design.md`](../encephlian-core/docs/specs/augur-design.md)
- VERTEX heads design: [`../encephlian-core/docs/vertex_heads_design.md`](../encephlian-core/docs/vertex_heads_design.md)
- Edit-delta retraining design: [`../encephlian-core/docs/edit_delta_retraining_design.md`](../encephlian-core/docs/edit_delta_retraining_design.md)
