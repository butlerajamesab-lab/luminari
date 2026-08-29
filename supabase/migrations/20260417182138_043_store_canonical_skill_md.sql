
CREATE TABLE IF NOT EXISTS canonical_skill (
  id          BIGSERIAL PRIMARY KEY,
  version     VARCHAR(32) NOT NULL,
  content     TEXT NOT NULL,
  stored_at   BIGINT NOT NULL DEFAULT 0,
  note        TEXT
);

INSERT INTO canonical_skill (version, content, note) VALUES
('1.0-rebuild-apr-2026',
'# LUMINARI SKILL — CANONICAL PLATFORM REFERENCE
## Single source of truth. Load this before touching anything.

---

## WHAT LUMINARI IS
Luminari is a forensic civic-legal intelligence platform. It helps people navigating broken civil systems — housing, benefits, employment, healthcare, mental health, immigration. It is not a chatbot. It is a navigation engine that turns raw documents and signals into structured legal intelligence, routes people to real help, and detects systemic patterns of harm.

**Platform URL:** luminari.manus.space
**Supabase Project:** wepxlinwbjrkqdzkqpar (us-west-2, Postgres 17)
**Manus Tech Stack:** React 19 / Express 4 / tRPC 11 / Drizzle ORM / TiDB (MySQL-compatible)
**This knowledge spine:** Postgres / Supabase — built from scratch, clean

---

## ABSOLUTE LAWS — NEVER VIOLATE

**Law 17 — National Parity:** No region over another. WA is true north for research order only, not priority. Every state equal.

**Law 5 — Immediate Help:** Track 1 fires at intake (programs table) before case analysis. No dead ends. Verified next action OR verified fallback OR verified escalation OR honest logged gap.

**Layer 7 Rule — ABSOLUTE:** No tables at L7. No side effects. No mutations. interpretation-service.ts is READ-ONLY, deterministic, same snapshot = same output. One instance only. Ever.

---

## CANONICAL LAYERS (L0–L11)
L0  = Source Intake
L1  = Ingestion + Provenance
L2  = Extraction + Structuring
L3  = Registry + Knowledge Backbone
L4  = Validation + Normalization
L5  = Evidence / Claim / Finding
L6  = Pattern + Signal
L7  = Interpretation — THE TRUST CORE (projection only, no tables, no writes)
L8  = Procedural / Action
L9  = Export / Assembly
L10 = Operations / Oversight
L11 = Public / Admin UI Surfaces / Sovereign Control

---

## PROTECTED ENGINES — BREAK = SYSTEM LOSES INTEGRITY
1. interpretation_engine (L7) — Trust boundary. Projection-only. One instance ONLY EVER.
2. sunam_execution_engine (L11) — Sovereign control plane.
3. service_dispatcher_engine (L11) — Control-plane routing.
4. constitutional_guard_engine (L10) — Governance enforcement, blocking layer.

---

## CURRENT DATABASE STATE (as of migration 043)
- 42 migrations locked
- 91 tables total
- programs: 109 rows (WA + 10 states + national)
- tribal_jurisdictions: 39 rows
- engine_registry_v3: 69 engines (target: 359)
- schema_table_registry: 292 tables mapped
- advocacy_organizations: 46
- legislator_contacts: 28
- claim_elements_matrix: 28 elements (target: ~100)
- statutes_registry: 14 (federal only, target: 50+)
- filing_templates_registry: 5 (target: 20+)
- damages_matrix: 24 (target: 80+)
- workflows: 8 (target: 81)
- legal_cases: 0 (entire table empty — highest priority)
- architecture_gaps_log: 23 open gaps
- research_prompts: 9 prompts stored

---

## STATES WITH ZERO PROGRAM COVERAGE (40 states)
AK AZ CA CO DE FL GA HI IA ID IL IN KS KY MA ME MI MN MO MT
NE NH NJ NM NV NY OH OK OR PA RI SD TX UT VA VT WI WV WY DC

---

## CRITICAL ARCHITECTURAL GAPS
GAP_PATTERN_FEEDBACK_LOOP_EMPTY — patternFeedbackLoop never written to. PAT-557 spec defined. This is the threshold between analysis platform and navigation engine.
GAP_GATE_2_5_SNAPSHOTID — 3-line fix in routers.ts lines ~180, 201, 267
GAP_ENGINE_REGISTRY_POPULATION — 69 of 359 engines. Full INSERT in Manus conversation 12971568.
GAP_CASE_LAW_TABLE_EMPTY — legal_cases: 0 rows. Highest priority enrichment.
GAP_AKB_COVERAGE_WA_ONLY — AKB WA only. 45 of 51 pipeline types have no domain rules.

---

## V3 → CURRENT TABLE NAME TRANSLATIONS (CRITICAL)
data_streams → dataStreamRegistry (NAME CHANGED)
pattern_signatures → patternRegistry + patternMetadata (RESTRUCTURED)
cda_runs → dossierPackages (ABSORBED)
signals → signalFlags + signalRegistry + detectedSignals + liveSignals (SPLIT)
All Drizzle names are camelCase.

---

## WORKFLOW RULES
- One action per instruction. Never chain.
- Confirm before generating large output.
- All data arriving from teams goes straight to Postgres via migration — no MySQL translation needed.
- Everything that enters the database must be fully metadata-wrapped: source, layer, family, status, version.
- Do not drop any table. Empty tables are placeholders for data that existed in Manus and will be repopulated.
- Pull everything from threads — fully implemented, partial, spec-only, mentioned-but-not-built. Nothing gets left behind.

---

## RESEARCH PROMPTS (stored in research_prompts table)
- thread-engines: Engine & code extraction from any thread
- thread-data: Data & knowledge extraction from any thread
- research-A through research-F: Knowledge gap research prompts
- research-STATE-programs: 40-state programs research

Filename convention: luminari-[type]-[thread-ID]-[date].txt

---

## HOW TO START EVERY SESSION
1. Check this skill loaded (SELECT content FROM canonical_skill ORDER BY id DESC LIMIT 1)
2. Check migration count (SELECT COUNT(*) FROM supabase_migrations.schema_migrations)
3. Check gap log (SELECT gap_id, gap_type FROM architecture_gaps_log WHERE resolution_status = ''open'' ORDER BY gap_type)
4. Confirm before generating any large output
',
'Rebuilt 2026-04-17 after /mnt/skills/user/luminari/ directory disappeared. Stored in DB as permanent backup. This is the authoritative reference for all future sessions.');

