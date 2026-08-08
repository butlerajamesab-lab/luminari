export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = { type: "text"; text: string };
export type ImageContent = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
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
  function: { name: string };
};
export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;
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
  documentHash: string;
  pass: string;
};
export type InteractiveParams = Omit<DeterministicParams, "documentHash" | "pass">;
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
export type InvokeResult = never;

export const PINNED_MODEL = "disabled";
export const DETERMINISTIC_TEMPERATURE = 0;
export const DETERMINISTIC_TOP_P = 1;

export function deriveSeedFromHash(sha256Hex: string): number {
  if (!sha256Hex || sha256Hex.length < 8) {
    throw new Error(`Invalid SHA-256 hash for seed derivation: "${sha256Hex}"`);
  }
  return parseInt(sha256Hex.slice(0, 8), 16) & 0x7fffffff;
}

function probabilisticRuntimeDisabled(): never {
  throw new Error(
    "probabilistic_runtime_disabled:Lighthouse canonical runtime permits deterministic code and declared rules only",
  );
}

export async function invokeLLMDeterministic(_params: DeterministicParams): Promise<never> {
  return probabilisticRuntimeDisabled();
}

export async function invokeLLMInteractive(_params: InteractiveParams): Promise<never> {
  return probabilisticRuntimeDisabled();
}

export async function invokeLLM(_params: InteractiveParams): Promise<never> {
  return probabilisticRuntimeDisabled();
}
