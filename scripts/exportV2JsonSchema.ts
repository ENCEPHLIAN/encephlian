#!/usr/bin/env tsx
/**
 * Generates the canonical JSON Schema for mind.report.v2 from the Zod
 * source of truth (src/shared/mindReportV2.ts) and writes:
 *
 *   src/shared/mindReportV2.schema.json           ← for app code + iplane
 *   supabase/migrations/_generated/<latest>.sql   ← seed for schema_definitions
 *
 * The migration that registers this schema in PG (schema_definitions row +
 * pg_jsonschema validator) references the generated SQL file. Update
 * cadence:
 *   1. Edit src/shared/mindReportV2.ts (the Zod source)
 *   2. Run `npm run export:v2-schema`
 *   3. Both .json and .sql get regenerated together
 *   4. Apply the seed migration via Studio SQL Editor
 *
 * CI should fail if either committed file diverges from this output.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { MindReportV2Schema } from "../src/shared/mindReportV2";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, "..");
const JSON_OUT   = path.join(REPO_ROOT, "src/shared/mindReportV2.schema.json");
const SQL_OUT    = path.join(REPO_ROOT, "supabase/migrations/20260528010001_seed_mind_report_v2_schema.sql");

const SCHEMA_NAME    = "mind.report.v2";
const SCHEMA_VERSION = "2.0.0";

// ─── Generate JSON Schema ───────────────────────────────────────────────
const schema = zodToJsonSchema(MindReportV2Schema, {
  name: "MindReportV2",
  $refStrategy: "none",
  target: "jsonSchema7",
});
(schema as any).$id   = "https://encephlian.cloud/schemas/mind.report.v2.json";
(schema as any).title = "MindReportV2";
const schemaJson = JSON.stringify(schema, null, 2) + "\n";

// ─── Write JSON file ────────────────────────────────────────────────────
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, schemaJson, "utf-8");
console.log(`✓ ${path.relative(REPO_ROOT, JSON_OUT)} (${schemaJson.length} bytes)`);

// ─── Compute sha256 of the schema (canonical content address) ──────────
const sha256 = crypto.createHash("sha256").update(schemaJson).digest("hex");

// ─── Write seed SQL ─────────────────────────────────────────────────────
// Dollar-quoted with a delimiter that doesn't appear in the JSON.
const DELIM = "mind_v2";
if (schemaJson.includes(`$${DELIM}$`)) {
  throw new Error(`Delimiter $${DELIM}$ collides with schema content; pick another`);
}

const sqlOut = `-- GENERATED FILE — DO NOT EDIT MANUALLY.
-- Source: src/shared/mindReportV2.ts (Zod)
-- Regenerate with: npm run export:v2-schema
--
-- Seeds the canonical mind.report.v2 JSON Schema into schema_definitions.
-- The schema is referenced by validate_triage_draft_json() to gate writes
-- via pg_jsonschema's jsonb_matches_schema().
--
-- IDEMPOTENT: re-running INSERTs nothing if the (name, version) row exists.
-- To publish a new schema version, bump SCHEMA_VERSION in the export script
-- and re-run; this file generates a new INSERT with the new version.

INSERT INTO public.schema_definitions (name, version, schema, description, schema_sha256)
VALUES (
  '${SCHEMA_NAME}',
  '${SCHEMA_VERSION}',
  $${DELIM}$${schemaJson}$${DELIM}$::jsonb,
  'Honest-output clinical report contract. Per-field provenance discriminated union (model/rule/biomarker/pending/clinician); pending fields require pending_reason and value=null; channel-dependency gate enforced server-side.',
  '${sha256}'
)
ON CONFLICT (name, version) DO NOTHING;
`;

fs.mkdirSync(path.dirname(SQL_OUT), { recursive: true });
fs.writeFileSync(SQL_OUT, sqlOut, "utf-8");
console.log(`✓ ${path.relative(REPO_ROOT, SQL_OUT)} (${sqlOut.length} bytes, sha256=${sha256.slice(0, 12)}…)`);
