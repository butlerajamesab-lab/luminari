
-- Add the full inventory extraction prompt
INSERT INTO research_prompts (
  prompt_id, prompt_type, prompt_name, scope, instructions, filename_convention, created_at
) VALUES (
  'thread-inventory',
  'thread_extraction',
  'Full Thread Inventory Extraction',
  'Extracts everything from a thread in any form — fully built, partial, scaffolded, mentioned, named, specced, or referenced. Nothing left behind.',
  'BEFORE YOU START:
Save your output file as:
luminari-inventory-[thread-ID-or-title]-[date].txt

EXTRACTION MODE — NO CREATION, NO INFERENCE, NO INVENTION.

You are auditing a Luminari platform thread. Your only job is to
pull forward every item that already exists in this thread in any
form — fully built, partially built, mentioned, named, specced,
or referenced. Nothing gets left behind.

THREAD_ID: [paste the conversation ID or thread title here]

For every item found, output it in this exact format:

NAME: [exact text as written in this thread]
TYPE: [engine / table / service / router / worker / pipeline_stage /
       governance_rule / ux_surface / data_structure / ontology_element /
       naming_convention / conceptual_component / schema_definition /
       seed_data / gap / constant / config]
STATUS: [fully_implemented / partial / scaffolded / defined /
         conceptual / mentioned_only / unknown]
LAYER: [L0-L11 / CROSS-CUTTING / unknown]
SOURCE: [exact location in thread — quote, code block, section title,
         or conversation turn where this appears]
NOTES: [only context from this thread — no invention, no inference,
        no filling in blanks]

Hard rules:
- Do NOT create anything. Do NOT infer anything. Do NOT normalize,
  merge, or reinterpret anything.
- Do NOT generate code. Do NOT invent missing structure.
- If something is mentioned but incomplete, extract it anyway and
  mark it mentioned_only or partial.
- If the thread names something without defining it, extract the
  name and mark it conceptual.
- Pull ALL of the following if they appear anywhere in the thread:
  machines, engines, services, tables, data structures, pipeline
  stages, governance rules, UX surfaces, ontology elements, naming
  conventions, conceptual components, seed data, gaps, constants,
  config values, file paths, router keys, layer assignments,
  status flags, dependency relationships, warning codes.
- Jurisdiction coverage must be noted explicitly in NOTES.
- Law 17 (National Parity) applies: if coverage gaps exist for
  any state, note them.
- Tech stack is React 19 / Express 4 / tRPC 11 / Drizzle ORM /
  TiDB (MySQL-compatible). Note any items that conflict with this.
- Layer numbering is fixed: L0=Intake, L1=Ingestion, L2=Extraction,
  L3=Registry/Knowledge, L4=Validation, L5=Evidence,
  L6=Pattern/Signal, L7=Interpretation, L8=Procedural/Action,
  L9=Export/Assembly, L10=Oversight, L11=Sovereign Control.

Return ONLY the extracted inventory. No commentary. No summary.
No preamble. Nothing that is not in the thread.',
  'luminari-inventory-[thread-ID]-[date].txt',
  0
)
ON CONFLICT (prompt_id) DO UPDATE
  SET instructions = EXCLUDED.instructions,
      prompt_name = EXCLUDED.prompt_name;

-- Also update the two existing thread prompts to include
-- "pull everything regardless of completion state"
UPDATE research_prompts
SET instructions = instructions || '

IMPORTANT: Extract EVERYTHING — fully implemented, partial, spec-only,
mentioned-but-not-built, referenced, or implied. If it exists in this
thread in any form, capture it. Nothing gets left behind.'
WHERE prompt_id IN ('thread-engines', 'thread-data');

