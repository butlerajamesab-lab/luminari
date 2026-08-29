
-- ============================================================
-- MIGRATION 042: Store all research prompts
-- So they survive session end and can be retrieved any time
-- ============================================================

CREATE TABLE IF NOT EXISTS research_prompts (
  id            BIGSERIAL PRIMARY KEY,
  prompt_id     VARCHAR(64) NOT NULL UNIQUE,
  prompt_type   TEXT NOT NULL CHECK (prompt_type IN ('thread_extraction','data_research','state_programs')),
  prompt_name   VARCHAR(256) NOT NULL,
  scope         TEXT,
  instructions  TEXT NOT NULL,
  output_format TEXT,
  filename_convention TEXT,
  created_at    BIGINT NOT NULL DEFAULT 0
);

INSERT INTO research_prompts (prompt_id, prompt_type, prompt_name, scope, instructions, filename_convention) VALUES

('thread-engines','thread_extraction','Engine & Code Thread Extraction',
'Extracts all engines, routers, schema tables, services from a Manus/Claude thread',
'BEFORE YOU START: Save your output file as: luminari-engines-[thread-ID-or-title]-[date].txt

You are working inside the Luminari platform codebase. Before generating any code, schema, or architecture, you must extract and align with what already exists.

Search this thread for every machine, engine, router, schema table, service, and data structure that has been defined or developed. For each one found, output it in the following format:

THREAD_ID: [paste the conversation ID or thread title here]

ENGINE/MACHINE NAME: [exact name as defined in code]
FILE PATH: [e.g. server/routers/meaning-layer-router.ts]
ROUTER EXPORT: [e.g. export const meaningLayerRouter = router({...})]
TABLES USED: [comma-separated list of Drizzle table names from schema.ts]
LAYER: [L0-L11]
FAMILY: [Intake / Parsing / Intelligence / Procedural / Oversight / Control / etc.]
STATUS: [fully_implemented / partial / scaffolded / unknown]
APPROUTER KEY: [the key it is registered under in appRouter]
NOTES: [anything important - duplicates, drift, missing wiring, etc.]

Hard rules:
- Tech stack is React 19 / Express 4 / tRPC 11 / Drizzle ORM / TiDB (MySQL-compatible). Do NOT use PostgreSQL syntax, raw class-based patterns, or direct pool.execute() outside the governed db layer.
- All tables must exist in the canonical Drizzle schema (drizzle/schema.ts). Do not invent new tables.
- All engines must be registered in engineRegistry and wrapped with withEngineTracking().
- Layer numbering is fixed: L0=Intake, L1=Ingestion, L2=Extraction, L3=Registry/Knowledge, L4=Validation, L5=Evidence, L6=Pattern/Signal, L7=Interpretation, L8=Procedural/Action, L9=Export/Assembly, L10=Oversight, L11=Sovereign Control.
- Do not generate new code. Extract only what this thread has already built.

Output the full list. Nothing else.',
'luminari-engines-[thread-ID]-[date].txt'),

('thread-data','thread_extraction','Data & Knowledge Thread Extraction',
'Extracts all data tables, seed datasets, knowledge records, and gaps from a Manus/Claude thread',
'BEFORE YOU START: Save your output file as: luminari-data-[thread-ID-or-title]-[date].txt

You are working inside the Luminari platform knowledge base. Before producing any output, you must extract and align with what already exists in this thread.

Search this thread for every data table, seed dataset, knowledge record, reference list, and data structure that has been defined, seeded, or discussed. For each one found, output it in the following format:

THREAD_ID: [paste the conversation ID or thread title here]

TABLE NAME: [exact table name as used in schema.ts or SQL]
DATA FAMILY: [Programs / Statutes / Claims / Signals / Patterns / Advocacy / Workflows / Remedies / Agencies / Jurisdictions / Engines / Streams / Knowledge / Reform / Platform State]
LAYER: [L0-L11, or CROSS-CUTTING if it spans layers]
CURRENT COUNT: [rows confirmed in this thread, or UNKNOWN]
TARGET COUNT: [rows the system needs at full population, or UNKNOWN]
STATUS: [seeded / partial / empty / schema_only / unknown]
WHAT EXISTS: [one sentence - what data is actually in this table]
WHAT IS MISSING: [one sentence - what should be here but is not]
SOURCE: [conversation ID, file name, or migration number]
NOTES: [duplicates, drift, wrong format, jurisdiction gaps, stale data, missing foreign keys]

Hard rules:
- Tech stack is React 19 / Express 4 / tRPC 11 / Drizzle ORM / TiDB (MySQL-compatible).
- All table names must match the canonical Drizzle schema (drizzle/schema.ts). Do not invent new tables.
- Jurisdiction coverage must be noted explicitly. If a table has data for WA only, say WA only.
- Law 17 (National Parity) applies: no state is prioritized over another. Coverage gaps for any state are gaps.
- Do not generate seed data. Extract and audit only what this thread has already produced.
- If a table is referenced in code but has no seed data, mark it schema_only.
- If a table has data that is stale, incorrect, or missing required fields, note it in NOTES.

Output the full audit list. Nothing else.',
'luminari-data-[thread-ID]-[date].txt'),

('research-A-claims','data_research','Prompt A: Claim Types & Elements',
'16 new claim types + elements for ADA, ADEA, Section 1983, FMLA, FDCPA, TILA, Medicare, Unlawful Eviction, VAWA, Section 504, Title IX, Equal Pay, ERISA, Civil Rights Conspiracy, ACA',
'Target tables: claim_type_metadata (add 16 new rows), claim_elements_matrix (add 64-96 new rows). Output two JSON arrays. Do not duplicate: SSDI_Denial, Medicaid_Wrongful_Denial, SNAP_Wrongful_Denial, Housing_Discrimination, Employment_Discrimination, Wage_Theft_Unpaid_Wages, Insurance_Coverage_Denial, FOIA_Wrongful_Withholding, Wrongful_Termination_At_Will. Filename: luminari-A-[scope]-[date].json',
'luminari-A-[scope]-[date].json'),

('research-B-statutes','data_research','Prompt B: Statutes Registry',
'13 missing federal statutes (ADA, ADEA, Title IX, Equal Pay, Rehab Act 504, CHIP, Medicare, VAWA, IDEA, ERISA, CFPA, FCRA, RICO, 42 USC 1985) + state statutes for CA/WA/NY',
'Target table: statutes_registry (add 30+ rows). Do not duplicate 14 existing federal statutes. Filename: luminari-B-[scope]-[date].json',
'luminari-B-[scope]-[date].json'),

('research-C-templates','data_research','Prompt C: Filing Templates',
'15 new filing templates: ADA/EEOC, Medicaid appeal, SNAP appeal, OSHA retaliation, FDCPA dispute letter, 1983 complaint, FMLA DOL, Medicare redetermination, eviction defense, ADA public, CFPB, Section 504, NLRB, CA DLSE wage, WA L&I wage',
'Target table: filing_templates_registry (add 15 rows). Do not duplicate 5 existing templates. Filename: luminari-C-[scope]-[date].json',
'luminari-C-[scope]-[date].json'),

('research-D-damages','data_research','Prompt D: Damages Matrix',
'Missing federal entries for ADA, ADEA, FMLA, FDCPA, Section 1983, unlawful eviction, OSHA, Medicare, ERISA. Plus state multipliers for WA/CA/NY wage theft and employment discrimination.',
'Target table: damages_matrix (add 50+ rows). Do not duplicate 24 existing entries. Filename: luminari-D-[scope]-[date].json',
'luminari-D-[scope]-[date].json'),

('research-E-workflows','data_research','Prompt E: Workflows Registry',
'73 missing workflows across: state wage enforcement (CA/WA/NY/TX), housing/eviction, federal agency complaints (FMLA/OSHA/NLRB/CFPB/Medicare/ADA), courts (1983/Title IX/ERISA), benefits (SSI/VA/CHIP/UI)',
'Target table: workflows (add 73 rows). Do not duplicate 8 existing workflows. Steps field is stringified JSON. Include deadlines with statute citations. Filename: luminari-E-[scope]-[date].json',
'luminari-E-[scope]-[date].json'),

('research-F-caselaw','data_research','Prompt F: Case Law Registry',
'40-60 landmark cases covering: employment discrimination (McDonnell Douglas), wage theft/FLSA, housing discrimination, ADA, Section 1983/qualified immunity, FMLA, FDCPA, SSA benefits, unlawful eviction, consumer/TILA',
'Target table: legal_case_law (currently 0 rows - entire table empty). Minimum 4 cases per area. Source URLs must be real (justia.com, law.cornell.edu, oyez.org, courtlistener.com). Filename: luminari-F-[scope]-[date].json',
'luminari-F-[scope]-[date].json'),

('research-STATE-programs','state_programs','State Programs Research',
'15-25 programs per state for all 40 uncovered states. Required coverage: SNAP, Medicaid, unemployment, rental assistance, LIHEAP, legal aid, DV services, mental health crisis, veterans, 211, FQHC.',
'Target table: programs (add 600-1000 rows across 40 states). Currently covered: WA(21), TN(10), SC(10), AR(9), CT(9), MD(9), MS(9), AL(8), NC(8), LA(8). Missing: AK AZ CA CO DE FL GA HI IA ID IL IN KS KY MA ME MI MN MO MT NE NH NJ NM NV NY OH OK OR PA RI SD TX UT VA VT WI WV WY DC. Filename: luminari-STATE-[state-code]-[date].json',
'luminari-STATE-[state-code]-[date].json');
