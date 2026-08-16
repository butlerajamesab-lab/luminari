/**
 * Sunam Service-Only Tools
 *
 * This is the RESTRICTED tool set visible to Sunam.
 * Sunam can only use the governed service tools declared here.
 *
 * System tools (streams, engines, UI, SQL) remain in SUNAM_TOOLS
 * but are NOT exposed to Sunam's LLM context.
 */

export const SUNAM_SERVICE_ONLY_TOOLS = [
  // ── Case Context (Read) ──
  {
    type: "function" as const,
    function: {
      name: "get_case_context",
      description: "Get unified context for a case. Returns case data, jurisdiction, workflows, programs, entities, signals, and diagnostics. Service layer only - no SQL.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "number", description: "The case ID to fetch context for" },
        },
        required: ["case_id"],
        additionalProperties: false,
      },
    },
  },

  // ── Case Data (Read) ──
  {
    type: "function" as const,
    function: {
      name: "get_case",
      description: "Get a single case by ID. Returns case data with registry context.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "number", description: "The case ID" },
        },
        required: ["case_id"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "get_case_timeline",
      description: "Get the timeline of events for a case.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "number", description: "The case ID" },
        },
        required: ["case_id"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "get_case_notes",
      description: "Get all notes for a case.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "number", description: "The case ID" },
        },
        required: ["case_id"],
        additionalProperties: false,
      },
    },
  },

  // ── Registry / Whole-Corpus Data (Read) ──
  {
    type: "function" as const,
    function: {
      name: "get_jurisdiction",
      description: "Get jurisdiction data from registry.",
      parameters: {
        type: "object",
        properties: {
          jurisdiction_id: { type: "number", description: "The jurisdiction ID" },
        },
        required: ["jurisdiction_id"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "get_workflows",
      description: "Get all workflows for a jurisdiction.",
      parameters: {
        type: "object",
        properties: {
          jurisdiction_id: { type: "number", description: "The jurisdiction ID" },
        },
        required: ["jurisdiction_id"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "get_programs",
      description: "Get all programs for a jurisdiction.",
      parameters: {
        type: "object",
        properties: {
          jurisdiction_id: { type: "number", description: "The jurisdiction ID" },
        },
        required: ["jurisdiction_id"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "get_entities",
      description: "Governed entity/civic-object reader. mode=registry preserves the existing jurisdiction registry behavior. mode=civic_state returns the current whole-corpus civic-object state. mode=civic_search performs bounded typed search across resources, programs, legal authorities, workflows, agencies, oversight, contacts, jurisdiction/tribal records, case-supporting objects, and policy context. Policy context is not a canonical signal.",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["registry", "civic_state", "civic_search"],
            description: "Read mode. Defaults to registry when jurisdiction_id is provided; use civic_state or civic_search for the whole-corpus substrate.",
          },
          jurisdiction_id: { type: "number", description: "Legacy registry jurisdiction ID, used by mode=registry" },
          query: { type: "string", description: "Optional text query for mode=civic_search" },
          jurisdiction: { type: "string", description: "Optional state/territory or jurisdiction filter for mode=civic_search" },
          object_classes: {
            type: "array",
            items: { type: "string" },
            description: "Optional exact civic-object classes for mode=civic_search",
          },
          ready_only: { type: "boolean", description: "Return only typed-ready objects for mode=civic_search" },
          limit: { type: "number", description: "Maximum civic search results; service caps at 200" },
          offset: { type: "number", description: "Civic search pagination offset" },
        },
        additionalProperties: false,
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "get_signals",
      description: "Get canonical signals through the governed signal service.",
      parameters: {
        type: "object",
        properties: {
          stream_id: { type: "string", description: "Optional source stream ID" },
          status: { type: "string", description: "Optional signal status" },
          severity: { type: "string", description: "Optional signal severity" },
          limit: { type: "number", description: "Maximum rows to return (default 50)" },
        },
        additionalProperties: false,
      },
    },
  },

  // ── Validation (Write) ──
  {
    type: "function" as const,
    function: {
      name: "record_validation",
      description: "Record a validation result for a case. Called after Sunam validation.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "number", description: "The case ID" },
          validation_type: { type: "string", description: "Type of validation (e.g. 'reconciliation', 'data_quality')" },
          result: { type: "string", description: "Result of validation (e.g. 'PASS', 'FAIL')" },
          confidence_score: { type: "number", description: "Optional confidence score (0-1)" },
          notes: { type: "string", description: "Optional notes about the validation" },
        },
        required: ["case_id", "validation_type", "result"],
        additionalProperties: false,
      },
    },
  },

  // ── Reconciliation (Write) ──
  {
    type: "function" as const,
    function: {
      name: "record_reconciliation",
      description: "Record reconciliation results for a case. Called after Sunam reconciliation.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "number", description: "The case ID" },
          run_id: { type: "string", description: "Unique ID for this reconciliation run" },
          total_rows: { type: "number", description: "Total rows processed" },
          discrepancy_count: { type: "number", description: "Number of discrepancies found" },
          status: { type: "string", description: "Status of reconciliation (e.g. 'COMPLETE', 'FAILED')" },
          notes: { type: "string", description: "Optional notes about reconciliation" },
        },
        required: ["case_id", "run_id", "total_rows", "discrepancy_count", "status"],
        additionalProperties: false,
      },
    },
  },

  // ── Case Actions (Write) ──
  {
    type: "function" as const,
    function: {
      name: "record_case_action",
      description: "Record an action taken on a case.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "number", description: "The case ID" },
          action_type: { type: "string", description: "Type of action" },
          details: { type: "object", description: "Action details" },
        },
        required: ["case_id", "action_type"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "add_case_note",
      description: "Add a note to a case.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "number", description: "The case ID" },
          note: { type: "string", description: "The note text" },
        },
        required: ["case_id", "note"],
        additionalProperties: false,
      },
    },
  },

  {
    type: "function" as const,
    function: {
      name: "update_case_status",
      description: "Update the status of a case.",
      parameters: {
        type: "object",
        properties: {
          case_id: { type: "number", description: "The case ID" },
          status: { type: "string", description: "New status" },
        },
        required: ["case_id", "status"],
        additionalProperties: false,
      },
    },
  },

  // ── System State (Read) ──
  {
    type: "function" as const,
    function: {
      name: "get_system_state",
      description: "Get current system state and diagnostics.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
];

/**
 * Get tool names visible to Sunam
 */
export function getSunamVisibleToolNames(): string[] {
  return SUNAM_SERVICE_ONLY_TOOLS.map((tool) => tool.function.name);
}

/**
 * Check if a tool is allowed for Sunam
 */
export function isSunamToolAllowed(toolName: string): boolean {
  return getSunamVisibleToolNames().includes(toolName);
}
