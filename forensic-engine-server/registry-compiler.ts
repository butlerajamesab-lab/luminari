/**
 * Registry Compiler — Luminari Session 36
 *
 * Compiles a state research document (Markdown/text) into the full 13-layer
 * Luminari state registry. Uses LLM extraction for structured data generation,
 * then validates the output against the canonical registry schema.
 *
 * Usage (via tRPC admin endpoint):
 *   1. Admin uploads a state research document
 *   2. Compiler reads the document and generates all 13 layers
 *   3. Each layer is validated against the canonical schema
 *   4. Valid layers are written to /config/states/{state}_*.json
 *
 * Layers generated:
 *   1.  manifest.json          — State metadata, supported pipelines, datasets
 *   2.  programs.json          — Benefits programs (SNAP, Medicaid, housing, etc.)
 *   3.  oversight.json         — Oversight chains (insurer, landlord, employer, etc.)
 *   4.  workflow_overrides.json — State-specific workflow step overrides
 *   5.  layer0_flags.json      — Always-on contextual policy warnings
 *   6.  layer1_cards.json      — Problem-cluster help cards
 *   7.  help.json              — Routing index (category → flags + cards + pipelines)
 *   8.  foia.json              — Public records request rules and templates
 *   9.  county_overrides.json  — County-level court/agency overrides
 *   10. tribal_overrides.json  — Tribal/ICWA overrides
 *   11. workflow_mappings.json — Workflow → pipeline trigger mappings
 *   12. pipeline_mappings.json — Pipeline → program/workflow/oversight mappings
 *   13. lens_mappings.json     — Lens → pipeline activation rules
 *
 * Architecture:
 *   C1. Parse input document (text/markdown)
 *   C2. Extract state metadata (name, code, key policy facts)
 *   C3. Generate each layer via targeted LLM prompts
 *   C4. Validate each layer against canonical schema
 *   C5. Write validated layers to config/states/
 *   C6. Run full registry validation via registry-manifest.ts
 */

import { invokeLLM } from "./_core/llm";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const statesDir = join(__dirname, "config", "states");

// ─── Types ───

export interface CompilerInput {
  /** The state research document content (markdown or plain text) */
  document: string;
  /** 2-letter state code (e.g., "FL", "NY", "TX") */
  stateCode: string;
  /** Full state name */
  stateName: string;
  /** Optional: source attribution */
  source?: string;
}

export interface CompilerLayerResult {
  layer: string;
  success: boolean;
  errors: string[];
  warnings: string[];
  filePath?: string;
}

export interface CompilerResult {
  stateCode: string;
  stateName: string;
  layers: CompilerLayerResult[];
  overallSuccess: boolean;
  totalErrors: number;
  totalWarnings: number;
}

// ─── Canonical pipelines and entity types ───

const CANONICAL_PIPELINES = [
  "tenant_rights", "wage_theft", "benefits_denial", "insurance_claim_denial",
  "immigration_case", "asylum_claim", "work_authorization_dispute",
  "domestic_violence", "child_welfare", "housing_violation",
];

const CANONICAL_OVERSIGHT_ENTITIES = [
  "insurer", "landlord", "employer", "government_agency", "nursing_home", "family_court",
];

const CANONICAL_BENEFIT_CATEGORIES = [
  "food", "healthcare", "housing", "dv_safety", "legal_aid",
  "cash_assistance", "utilities", "tribal_indigenous", "immigration",
];

const CANONICAL_LENS_IDS = [
  "housing", "employment", "healthcare", "immigration", "family",
  "insurance", "elder_care", "disability", "education", "consumer",
];

// ─── LLM Helper ───

async function llmExtract<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "registry_layer",
        strict: false,
        schema: {
          type: "object",
          additionalProperties: true,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty response");
  const text = typeof content === "string" ? content : JSON.stringify(content);
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`Failed to parse LLM response as JSON: ${(e as Error).message}`);
  }
}

// ─── Layer Generators ───

async function generateManifest(input: CompilerInput): Promise<Record<string, unknown>> {
  const today = new Date().toISOString().split("T")[0];
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a manifest.json for a US state registry.

Output MUST be valid JSON matching this exact structure:
{
  "state": "<2-letter code>",
  "state_name": "<full name>",
  "version": "1.0.0",
  "schema": "luminari-registry-v1",
  "date_created": "${today}",
  "date_verified": "${today}",
  "source": "<source attribution>",
  "datasets": ["programs", "workflows", "oversight", "layer0_flags", "layer1_cards", "help", "foia", "county_overrides", "tribal_overrides"],
  "pipelines_supported": [<list from: ${CANONICAL_PIPELINES.join(", ")}>],
  "oversight_entities": [<list from: ${CANONICAL_OVERSIGHT_ENTITIES.join(", ")}>],
  "policy_flags": [<array of key policy flag strings for this state>],
  "statistics": {
    "programs": { "total_programs": <number>, "categories": {<category: count>}, "layers": ["state", "federal", "local", "tribal"] },
    "workflows": { "total_workflows": <number>, "total_steps": <number> },
    "oversight": { "total_entity_types": <number>, "total_oversight_bodies": <number>, "pattern_threshold_coverage": "<percentage>" }
  }
}

Include ALL pipelines that are relevant to this state. Include all oversight entity types that have regulatory bodies in this state.
For policy_flags, list 5-10 critical state-specific policy facts (e.g., minimum wage, SNAP rules, tenant protections, etc.).`,
    `Generate the manifest for ${input.stateName} (${input.stateCode}).

Source: ${input.source || "Luminari Registry Compiler"}

Research document:
${input.document.slice(0, 8000)}`
  );
}

async function generatePrograms(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a programs.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "state_name": "<full name>",
    "layer": "programs",
    "version": "1.0.0",
    "date_created": "<today>",
    "date_verified": "<today>",
    "source": "<source>",
    "program_count": <number>,
    "critical_policy_flags": [<5-10 key policy facts>],
    "total_programs": <number>,
    "categories": { ${CANONICAL_BENEFIT_CATEGORIES.map(c => `"${c}": <count>`).join(", ")} },
    "last_updated": "<today>"
  },
  "programs": [
    {
      "program_id": "<state>_<short_id>",
      "program_name": "<official name>",
      "layer": "state|federal|local|tribal",
      "benefit_category": "<from: ${CANONICAL_BENEFIT_CATEGORIES.join(", ")}>",
      "pipeline_ids": [<relevant pipeline IDs>],
      "agency": "<administering agency>",
      "phone": "<phone number>",
      "website": "<url>",
      "eligibility": "<eligibility criteria>",
      "apply_notes": "<how to apply>",
      "source": "<source url>"
    }
  ]
}

Generate at least 80 programs across all benefit categories. Include SNAP, Medicaid, TANF, housing assistance, DV services, legal aid, utility assistance, tribal services, and immigration services.
Use real agency names, phone numbers, and websites for the state. If you don't know the exact details, use the most accurate information you have.`,
    `Generate the programs registry for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 12000)}`
  );
}

async function generateOversight(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate an oversight.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "state_name": "<full name>",
    "layer": "oversight",
    "version": "1.0.0",
    "date_created": "<today>",
    "date_verified": "<today>",
    "source": "<source>"
  },
  "oversight_chains": [
    {
      "entity_type": "<from: ${CANONICAL_OVERSIGHT_ENTITIES.join(", ")}>",
      "state": "<2-letter code>",
      "bodies": [
        {
          "body_name": "<regulatory body name>",
          "role": "<role description>",
          "jurisdiction": "state|federal|local",
          "phone": "<phone>",
          "website": "<url>",
          "complaint_url": "<complaint filing url>",
          "escalation_order": <1-based order>,
          "pattern_thresholds": [
            { "pattern": "<violation pattern>", "threshold": <count>, "action": "<required action>" }
          ]
        }
      ]
    }
  ]
}

Generate oversight chains for ALL entity types: insurer, landlord, employer, government_agency, nursing_home, family_court.
Each chain should have 3-6 oversight bodies in escalation order (local → state → federal).
Include real agency names, phone numbers, complaint URLs.`,
    `Generate the oversight registry for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 10000)}`
  );
}

async function generateWorkflowOverrides(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a workflow_overrides.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "state_name": "<full name>",
    "layer": "workflow_overrides",
    "version": "1.0.0",
    "date_created": "<today>",
    "date_verified": "<today>",
    "source": "<source>"
  },
  "workflow_overrides": [
    {
      "workflow_id": "<pipeline>_workflow",
      "state": "<2-letter code>",
      "steps": [
        {
          "step_id": "<workflow_id>_step_<N>",
          "step_name": "<step name>",
          "description": "<what to do>",
          "deadline_days": <number or null>,
          "deadline_source": "<legal citation>",
          "documents_needed": ["<doc1>", "<doc2>"],
          "escalation_if_missed": "<what happens if deadline missed>",
          "notes": "<state-specific notes>"
        }
      ]
    }
  ]
}

Generate workflow overrides for at least 6 workflows: tenant_rights_workflow, wage_theft_workflow, benefits_denial_workflow, insurance_claim_denial_workflow, domestic_violence_workflow, child_welfare_workflow.
Each workflow should have 4-8 steps with state-specific deadlines, legal citations, and required documents.`,
    `Generate the workflow overrides for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 10000)}`
  );
}

async function generateLayer0Flags(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a layer0_flags.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "state_name": "<full name>",
    "schema_version": "1.0.0",
    "last_updated": "<today>",
    "description": "Layer 0 policy flags — always-on contextual warnings activated by pipeline and user context"
  },
  "flags": [
    {
      "flag_id": "<state>_<short_id>",
      "title": "<flag title>",
      "severity": "warning|alert|info",
      "trigger": {
        "pipelines": [<pipeline IDs>],
        "benefit_categories": [<categories>],
        "conditions": []
      },
      "message": "<detailed warning message>",
      "action_items": ["<action 1>", "<action 2>"],
      "legal_basis": "<legal citation>",
      "bundle_pairings": []
    }
  ]
}

Generate 8-15 policy flags covering: SNAP rules, Medicaid, tenant protections, wage laws, DV protections, utility shutoff rules, immigration impacts, and any unique state policies.`,
    `Generate the Layer 0 policy flags for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 10000)}`
  );
}

async function generateLayer1Cards(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a layer1_cards.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "state_name": "<full name>",
    "schema_version": "1.0.0",
    "last_updated": "<today>",
    "description": "Layer 1 help cards — problem-cluster-organized guidance cards"
  },
  "clusters": [
    {
      "cluster_id": "<state>_<category>",
      "cluster_name": "<cluster name>",
      "icon": "<icon name>",
      "cards": [
        {
          "card_id": "<state>_<category>_<short_id>",
          "title": "<card title>",
          "summary": "<1-2 sentence summary>",
          "who_qualifies": "<eligibility>",
          "how_to_apply": "<application process>",
          "phone": "<phone>",
          "website": "<url>",
          "documents_needed": ["<doc1>", "<doc2>"],
          "program_ids": ["<program_id>"],
          "urgency": "emergency|urgent|standard",
          "routing_tags": ["<tag1>", "<tag2>"],
          "region": "statewide|<region name>",
          "federal_interface": true|false
        }
      ]
    }
  ]
}

Generate 8 clusters: food, healthcare, housing_utilities, dv_safety, legal_aid, children_families, cash_assistance, immigration.
Each cluster should have 4-8 cards with real program information for the state.`,
    `Generate the Layer 1 help cards for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 12000)}`
  );
}

async function generateHelp(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a help.json routing index for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "state_name": "<full name>",
    "schema_version": "1.0.0",
    "last_updated": "<today>",
    "status": "active",
    "description": "<state> help routing index"
  },
  "routing_index": {
    "food": {
      "layer0_flags": ["<flag_ids>"],
      "layer1_cluster": "<state>_food",
      "primary_pipeline": "benefits_denial",
      "secondary_pipelines": ["snap_denial"]
    },
    "healthcare": { ... },
    "housing": { ... },
    "dv_safety": { ... },
    "legal_aid": { ... },
    "cash_assistance": { ... },
    "utilities": { ... },
    "tribal_indigenous": { ... },
    "immigration": { ... }
  }
}

Map each benefit category to its Layer 0 flags, Layer 1 cluster, and primary/secondary pipelines.`,
    `Generate the help routing index for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 6000)}`
  );
}

async function generateFoia(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a foia.json for a US state's public records law.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "state_name": "<full name>",
    "schema_version": "2.0.0",
    "last_updated": "<today>",
    "status": "active",
    "description": "<state> public records law layer"
  },
  "statute": {
    "name": "<official name of public records law>",
    "citation": "<legal citation>",
    "chapter": "<chapter reference>",
    "response_deadline_days": <number>,
    "response_deadline_unit": "business_days|calendar_days",
    "fee_structure": "<fee description>",
    "appeal_body": "<body that handles appeals>",
    "appeal_deadline_days": <number>,
    "penalties_for_noncompliance": "<penalties>",
    "key_exemptions": ["<exemption 1>", "<exemption 2>"]
  },
  "agency_targets": [
    {
      "agency_id": "<state>_<agency_short>",
      "agency_name": "<full name>",
      "foia_contact": "<contact info>",
      "online_portal": "<url or null>",
      "common_requests": ["<request type 1>"]
    }
  ],
  "template": {
    "greeting": "<standard greeting>",
    "body_template": "<template text with {placeholders}>",
    "closing": "<standard closing>",
    "required_fields": ["requester_name", "requester_address", "records_description", "date_range"]
  }
}

Use the actual public records law for this state (e.g., Florida Sunshine Law, New York FOIL, Texas PIA).`,
    `Generate the FOIA layer for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 8000)}`
  );
}

async function generateCountyOverrides(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a county_overrides.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "state_name": "<full name>",
    "schema_version": "2.0.0",
    "last_updated": "<today>",
    "status": "active",
    "description": "<state> county-level overrides"
  },
  "regions": {
    "<region_id>": {
      "label": "<region name>",
      "counties": ["<county1>", "<county2>"],
      "overrides": {
        "courts": [{ "name": "<court name>", "address": "<address>", "phone": "<phone>", "website": "<url>" }],
        "prosecutor": { "name": "<name>", "office": "<office>", "phone": "<phone>" },
        "housing_authority": { "name": "<name>", "phone": "<phone>", "website": "<url>" },
        "legal_aid": [{ "name": "<org name>", "phone": "<phone>", "website": "<url>", "services": ["<service>"] }],
        "child_welfare": { "agency": "<name>", "phone": "<phone>" },
        "law_enforcement": { "agency": "<name>", "phone": "<phone>" }
      }
    }
  }
}

Generate overrides for 3-5 major metro regions in the state. Include the largest cities and their surrounding counties.`,
    `Generate the county overrides for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 8000)}`
  );
}

async function generateTribalOverrides(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a tribal_overrides.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "state_name": "<full name>",
    "schema_version": "2.0.0",
    "last_updated": "<today>",
    "status": "active",
    "description": "<state> tribal overrides"
  },
  "tribal_context": {
    "federally_recognized_tribes_in_state": <number>,
    "historical_tribal_nations": ["<tribe1>", "<tribe2>"],
    "ihs_area_office": "<IHS area office name>",
    "ihs_area_phone": "<phone>",
    "icwa_applies": true|false,
    "state_icwa_statute": "<citation or null>"
  },
  "tribes": [
    {
      "tribe_id": "<state>_<tribe_short>",
      "tribe_name": "<official name>",
      "reservation": "<reservation name or null>",
      "tribal_court": true|false,
      "icwa_contact": "<contact info>",
      "social_services": "<phone or url>",
      "website": "<url>"
    }
  ],
  "urban_native_services": [
    {
      "org_name": "<organization name>",
      "city": "<city>",
      "phone": "<phone>",
      "website": "<url>",
      "services": ["<service1>", "<service2>"]
    }
  ]
}

Include all federally recognized tribes in or historically connected to this state. Include urban Native services in major cities.`,
    `Generate the tribal overrides for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 8000)}`
  );
}

async function generateWorkflowMappings(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a workflow_mappings.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "type": "workflow_mappings",
    "version": "1.0.0",
    "status": "active",
    "description": "Maps workflow IDs to pipeline triggers, escalation rules, FOIA restrictions, and resolution chains"
  },
  "workflow_mappings": [
    {
      "workflow_id": "<pipeline>_workflow",
      "trigger_pipelines": ["<pipeline_id>"],
      "trigger_conditions": { "document_types": ["<type>"], "entity_types": ["<type>"] },
      "escalation_rules": [
        { "condition": "<condition>", "escalate_to": "<body>", "deadline_days": <number> }
      ],
      "foia_restrictions": ["<restriction>"],
      "resolution_chain": ["<step1>", "<step2>"]
    }
  ]
}

Generate mappings for at least 6 workflows covering tenant rights, wage theft, benefits denial, insurance claims, DV, and child welfare.`,
    `Generate the workflow mappings for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 6000)}`
  );
}

async function generatePipelineMappings(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a pipeline_mappings.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "type": "pipeline_mappings",
    "version": "1.0.0",
    "status": "active",
    "description": "Maps canonical pipeline IDs to state-specific programs, workflows, oversight chains, and Layer 0/1 resources"
  },
  "pipeline_mappings": [
    {
      "pipeline_id": "<from: ${CANONICAL_PIPELINES.join(", ")}>",
      "workflow_id": "<pipeline>_workflow",
      "oversight_entity_types": ["<entity_type>"],
      "program_ids": ["<program_id>"],
      "layer0_flag_ids": ["<flag_id>"],
      "layer1_cluster_ids": ["<cluster_id>"],
      "benefit_categories": ["<category>"]
    }
  ]
}

Generate mappings for ALL canonical pipelines: ${CANONICAL_PIPELINES.join(", ")}.`,
    `Generate the pipeline mappings for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 6000)}`
  );
}

async function generateLensMappings(input: CompilerInput): Promise<Record<string, unknown>> {
  return llmExtract(
    `You are a registry compiler for the Luminari forensic advocacy platform. Generate a lens_mappings.json for a US state.

Output MUST be valid JSON with this structure:
{
  "meta": {
    "state": "<2-letter code>",
    "type": "lens_mappings",
    "version": "1.0.0",
    "status": "active",
    "description": "Maps canonical lens IDs to state-specific activation rules, pipeline associations, and state-specific parameters"
  },
  "lens_mappings": [
    {
      "lens_id": "<from: ${CANONICAL_LENS_IDS.join(", ")}>",
      "activation_pipelines": ["<pipeline_id>"],
      "state_parameters": {
        "key_statutes": ["<statute citation>"],
        "filing_deadlines": { "<type>": "<deadline>" },
        "notable_protections": ["<protection>"]
      },
      "priority_programs": ["<program_id>"],
      "related_lenses": ["<lens_id>"]
    }
  ]
}

Generate mappings for ALL canonical lenses: ${CANONICAL_LENS_IDS.join(", ")}.`,
    `Generate the lens mappings for ${input.stateName} (${input.stateCode}).

Research document:
${input.document.slice(0, 6000)}`
  );
}

// ─── Layer Validation ───

function validateLayer(layer: string, data: Record<string, unknown>, stateCode: string): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check meta exists
  if (layer !== "manifest") {
    if (!data.meta) {
      errors.push(`${layer}: Missing 'meta' field`);
    } else {
      const meta = data.meta as Record<string, unknown>;
      if (meta.state !== stateCode) {
        warnings.push(`${layer}: meta.state is '${meta.state}', expected '${stateCode}'`);
      }
    }
  }

  // Layer-specific checks
  switch (layer) {
    case "manifest": {
      if (!data.state) errors.push("manifest: Missing 'state'");
      if (!data.state_name) errors.push("manifest: Missing 'state_name'");
      if (!data.schema) errors.push("manifest: Missing 'schema'");
      if (!Array.isArray(data.datasets)) errors.push("manifest: 'datasets' must be an array");
      if (!Array.isArray(data.pipelines_supported)) errors.push("manifest: 'pipelines_supported' must be an array");
      if (!Array.isArray(data.oversight_entities)) errors.push("manifest: 'oversight_entities' must be an array");
      break;
    }
    case "programs": {
      if (!Array.isArray(data.programs)) errors.push("programs: 'programs' must be an array");
      else if (data.programs.length < 10) warnings.push(`programs: Only ${data.programs.length} programs — expected at least 80`);
      break;
    }
    case "oversight": {
      if (!Array.isArray(data.oversight_chains)) errors.push("oversight: 'oversight_chains' must be an array");
      else if (data.oversight_chains.length < 3) warnings.push(`oversight: Only ${data.oversight_chains.length} chains — expected at least 6`);
      break;
    }
    case "workflow_overrides": {
      if (!Array.isArray(data.workflow_overrides)) errors.push("workflow_overrides: 'workflow_overrides' must be an array");
      break;
    }
    case "layer0_flags": {
      if (!Array.isArray(data.flags)) errors.push("layer0_flags: 'flags' must be an array");
      break;
    }
    case "layer1_cards": {
      if (!Array.isArray(data.clusters)) errors.push("layer1_cards: 'clusters' must be an array");
      break;
    }
    case "help": {
      if (!data.routing_index) errors.push("help: Missing 'routing_index'");
      break;
    }
    case "foia": {
      if (!data.statute) errors.push("foia: Missing 'statute'");
      // Accept either agency_targets or agencies (both are valid schema variants)
      if (!Array.isArray(data.agency_targets) && !Array.isArray(data.agencies)) {
        errors.push("foia: 'agency_targets' or 'agencies' must be an array");
      }
      break;
    }
    case "county_overrides": {
      if (!data.regions) errors.push("county_overrides: Missing 'regions'");
      break;
    }
    case "tribal_overrides": {
      if (!data.tribal_context) errors.push("tribal_overrides: Missing 'tribal_context'");
      break;
    }
    case "workflow_mappings": {
      if (!Array.isArray(data.workflow_mappings)) errors.push("workflow_mappings: 'workflow_mappings' must be an array");
      break;
    }
    case "pipeline_mappings": {
      if (!Array.isArray(data.pipeline_mappings)) errors.push("pipeline_mappings: 'pipeline_mappings' must be an array");
      break;
    }
    case "lens_mappings": {
      if (!Array.isArray(data.lens_mappings)) errors.push("lens_mappings: 'lens_mappings' must be an array");
      break;
    }
  }

  return { errors, warnings };
}

// ─── File name mapping ───

const LAYER_FILE_MAP: Record<string, string> = {
  manifest: "_manifest.json",
  programs: "_programs.json",
  oversight: "_oversight.json",
  workflow_overrides: "_workflow_overrides.json",
  layer0_flags: "_layer0_flags.json",
  layer1_cards: "_layer1_cards.json",
  help: "_help.json",
  foia: "_foia.json",
  county_overrides: "_county_overrides.json",
  tribal_overrides: "_tribal_overrides.json",
  workflow_mappings: "_workflow_mappings.json",
  pipeline_mappings: "_pipeline_mappings.json",
  lens_mappings: "_lens_mappings.json",
};

// ─── Main Compiler ───

export async function compileRegistry(input: CompilerInput): Promise<CompilerResult> {
  const results: CompilerLayerResult[] = [];
  const statePrefix = input.stateCode.toLowerCase();

  // Ensure states directory exists
  if (!existsSync(statesDir)) {
    mkdirSync(statesDir, { recursive: true });
  }

  // Layer generators in order
  const layerGenerators: Array<[string, () => Promise<Record<string, unknown>>]> = [
    ["manifest", () => generateManifest(input)],
    ["programs", () => generatePrograms(input)],
    ["oversight", () => generateOversight(input)],
    ["workflow_overrides", () => generateWorkflowOverrides(input)],
    ["layer0_flags", () => generateLayer0Flags(input)],
    ["layer1_cards", () => generateLayer1Cards(input)],
    ["help", () => generateHelp(input)],
    ["foia", () => generateFoia(input)],
    ["county_overrides", () => generateCountyOverrides(input)],
    ["tribal_overrides", () => generateTribalOverrides(input)],
    ["workflow_mappings", () => generateWorkflowMappings(input)],
    ["pipeline_mappings", () => generatePipelineMappings(input)],
    ["lens_mappings", () => generateLensMappings(input)],
  ];

  for (const [layer, generator] of layerGenerators) {
    try {
      console.log(`[Registry Compiler] Generating ${layer} for ${input.stateCode}...`);
      const data = await generator();

      // Validate
      const validation = validateLayer(layer, data, input.stateCode);

      if (validation.errors.length > 0) {
        results.push({
          layer,
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
        });
        continue;
      }

      // Write to file
      const filename = `${statePrefix}${LAYER_FILE_MAP[layer]}`;
      const filepath = join(statesDir, filename);
      writeFileSync(filepath, JSON.stringify(data, null, 2));

      results.push({
        layer,
        success: true,
        errors: [],
        warnings: validation.warnings,
        filePath: filepath,
      });

      console.log(`[Registry Compiler] ✓ ${layer} written to ${filename}`);
    } catch (err) {
      results.push({
        layer,
        success: false,
        errors: [`Generation failed: ${(err as Error).message}`],
        warnings: [],
      });
      console.error(`[Registry Compiler] ✗ ${layer} failed: ${(err as Error).message}`);
    }
  }

  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

  return {
    stateCode: input.stateCode,
    stateName: input.stateName,
    layers: results,
    overallSuccess: totalErrors === 0,
    totalErrors,
    totalWarnings,
  };
}

/**
 * Validate an existing compiled registry by running all checks.
 */
export function validateCompiledRegistry(stateCode: string): {
  valid: boolean;
  layers: Array<{ layer: string; exists: boolean; errors: string[]; warnings: string[] }>;
} {
  const statePrefix = stateCode.toLowerCase();
  const layerResults: Array<{ layer: string; exists: boolean; errors: string[]; warnings: string[] }> = [];

  for (const [layer, suffix] of Object.entries(LAYER_FILE_MAP)) {
    const filepath = join(statesDir, `${statePrefix}${suffix}`);
    if (!existsSync(filepath)) {
      layerResults.push({ layer, exists: false, errors: [`File not found: ${statePrefix}${suffix}`], warnings: [] });
      continue;
    }

    try {
      const raw = readFileSync(filepath, "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const validation = validateLayer(layer, data, stateCode);
      layerResults.push({ layer, exists: true, errors: validation.errors, warnings: validation.warnings });
    } catch (err) {
      layerResults.push({ layer, exists: true, errors: [`Parse error: ${(err as Error).message}`], warnings: [] });
    }
  }

  const valid = layerResults.every(r => r.errors.length === 0);
  return { valid, layers: layerResults };
}
