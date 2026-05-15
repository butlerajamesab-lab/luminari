import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

// ─── Gate 3: Determinism Boundary Types ───

/** Parameters for the deterministic extraction wrapper */
export type DeterministicParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /** SHA-256 hash of the source document bytes (hex string). Used for seed derivation. */
  documentHash: string;
  /** Pipeline pass identifier for audit trail (e.g., "pass1", "pass2", "pass3", "dedup", "backfill", "cda-t7") */
  pass: string;
};

/** Parameters for the interactive (non-extraction) wrapper */
export type InteractiveParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

/** Internal params — used only by the low-level invokeLLM function */
type InternalInvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /** Internal: deterministic overrides applied by the wrapper */
  _deterministic?: {
    temperature: number;
    top_p: number;
    seed?: number;
  };
};

// ─── Gate 3: LLM Determinism Constants ───

/** Pinned model identifier — no floating alias */
export const PINNED_MODEL = "gemini-2.5-flash";

/** Extraction-stage temperature — always 0 for reproducibility */
export const DETERMINISTIC_TEMPERATURE = 0;

/** Extraction-stage top_p — always 1 (provider default, no nucleus sampling) */
export const DETERMINISTIC_TOP_P = 1;

/**
 * Derive a deterministic seed from a document SHA-256 hash.
 * Takes the first 8 hex characters (32 bits) and converts to a positive integer.
 * Returns a stable integer in range [0, 2^31-1] for the same document.
 */
export function deriveSeedFromHash(sha256Hex: string): number {
  if (!sha256Hex || sha256Hex.length < 8) {
    throw new Error(`Invalid SHA-256 hash for seed derivation: "${sha256Hex}"`);
  }
  // First 32 bits → positive 31-bit integer (avoid sign issues)
  return parseInt(sha256Hex.slice(0, 8), 16) & 0x7FFFFFFF;
}

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

const assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ─── Internal low-level LLM call (not exported for direct use) ───

async function _invokeLLMInternal(params: InternalInvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    _deterministic,
  } = params;

  const payload: Record<string, unknown> = {
    model: PINNED_MODEL,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 32768;
  payload.thinking = {
    "budget_tokens": 128
  };

  // Apply deterministic overrides if present
  if (_deterministic) {
    payload.temperature = _deterministic.temperature;
    payload.top_p = _deterministic.top_p;
    if (_deterministic.seed !== undefined) {
      payload.seed = _deterministic.seed;
    }
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  return (await response.json()) as InvokeResult;
}

// ─── Gate 3: Boundary-Enforced Wrappers ───

/**
 * Deterministic extraction wrapper.
 * MUST be used for ALL extraction-stage LLM calls.
 * Enforces: temperature=0, top_p=1, pinned model, deterministic seed.
 * Throws if documentHash is missing or invalid.
 */
export async function invokeLLMDeterministic(params: DeterministicParams): Promise<InvokeResult> {
  // Validate required determinism fields
  if (!params.documentHash || params.documentHash.length < 8) {
    throw new Error(
      `[Gate 3] invokeLLMDeterministic requires a valid documentHash (got: "${params.documentHash || ""}"). ` +
      `All extraction-stage calls must provide the source document SHA-256 hash.`
    );
  }
  if (!params.pass || params.pass.trim().length === 0) {
    throw new Error(
      `[Gate 3] invokeLLMDeterministic requires a pass identifier (e.g., "pass1", "pass2", "dedup").`
    );
  }

  const seed = deriveSeedFromHash(params.documentHash);

  return _invokeLLMInternal({
    messages: params.messages,
    tools: params.tools,
    toolChoice: params.toolChoice,
    tool_choice: params.tool_choice,
    maxTokens: params.maxTokens,
    max_tokens: params.max_tokens,
    outputSchema: params.outputSchema,
    output_schema: params.output_schema,
    responseFormat: params.responseFormat,
    response_format: params.response_format,
    _deterministic: {
      temperature: DETERMINISTIC_TEMPERATURE,
      top_p: DETERMINISTIC_TOP_P,
      seed,
    },
  });
}

/**
 * Interactive wrapper.
 * Used for conversational / non-extraction LLM calls (e.g., chat).
 * Does NOT enforce determinism parameters.
 * MUST NOT be used in extraction pipeline code.
 */
export async function invokeLLMInteractive(params: InteractiveParams): Promise<InvokeResult> {
  return _invokeLLMInternal({
    messages: params.messages,
    tools: params.tools,
    toolChoice: params.toolChoice,
    tool_choice: params.tool_choice,
    maxTokens: params.maxTokens,
    max_tokens: params.max_tokens,
    outputSchema: params.outputSchema,
    output_schema: params.output_schema,
    responseFormat: params.responseFormat,
    response_format: params.response_format,
    // No _deterministic overrides — provider defaults apply
  });
}

/**
 * Legacy wrapper — kept for backward compatibility during migration.
 * @deprecated Use invokeLLMDeterministic or invokeLLMInteractive instead.
 */
export async function invokeLLM(params: InteractiveParams): Promise<InvokeResult> {
  console.warn("[Gate 3] WARNING: invokeLLM() called without boundary enforcement. Migrate to invokeLLMDeterministic or invokeLLMInteractive.");
  return invokeLLMInteractive(params);
}
