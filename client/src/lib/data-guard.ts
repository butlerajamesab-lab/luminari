/**
 * LUMINARI V2 — UI DATA GUARD
 *
 * Prevents invalid, unstable, or malformed data from reaching UI components.
 * This is a GUARD PATCH — not a refactor.
 *
 * RULES:
 *   1. No mock data in runtime (test-only)
 *   2. Validate shape and types before render
 *   3. Safe string rendering (never null/undefined/object)
 *   4. Fail closed — render nothing or placeholder, never partial/corrupt UI
 *
 * CONSTRAINTS:
 *   - Frontend only — no backend modifications
 *   - No Metadata Machine changes
 *   - No validation layer changes
 */

// ─── SAFE TEXT ───────────────────────────────────────────────────────────────
// Wrap all dynamic text outputs. Returns empty string for invalid values.

export function safeText(value: unknown, fallback: string = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Objects, arrays, symbols, functions → reject
  return fallback;
}

// ─── SAFE NUMBER ─────────────────────────────────────────────────────────────
// Safely coerce to number. Returns fallback for NaN/Infinity/non-numeric.

export function safeNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (isFinite(parsed)) return parsed;
  }
  return fallback;
}

// ─── SAFE ARRAY ──────────────────────────────────────────────────────────────
// Ensures value is an array. Returns empty array for non-arrays.

export function safeArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

// ─── SAFE OBJECT ─────────────────────────────────────────────────────────────
// Ensures value is a non-null object. Returns empty object for non-objects.

export function safeObject<T extends Record<string, unknown> = Record<string, unknown>>(
  value: unknown
): T {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as T;
  }
  return {} as T;
}

// ─── VALIDATE RENDER DATA ────────────────────────────────────────────────────
// Validates data shape against a schema before rendering.
// Returns { valid: true, data } or { valid: false, errors }.
//
// Schema is a map of field names to expected types:
//   { name: "string", age: "number", items: "array", meta: "object" }

type SchemaType = "string" | "number" | "boolean" | "array" | "object" | "any";

interface SchemaMap {
  [key: string]: SchemaType | { type: SchemaType; required?: boolean };
}

interface ValidResult<T> {
  valid: true;
  data: T;
}

interface InvalidResult {
  valid: false;
  errors: string[];
}

export type ValidationResult<T> = ValidResult<T> | InvalidResult;

export function validateRenderData<T extends Record<string, unknown>>(
  data: unknown,
  schema: SchemaMap
): ValidationResult<T> {
  const errors: string[] = [];

  if (data === null || data === undefined) {
    return { valid: false, errors: ["Data is null or undefined"] };
  }

  if (typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, errors: ["Data is not an object"] };
  }

  const obj = data as Record<string, unknown>;

  for (const [key, spec] of Object.entries(schema)) {
    const expectedType = typeof spec === "string" ? spec : spec.type;
    const required = typeof spec === "string" ? false : (spec.required ?? false);
    const value = obj[key];

    if (value === undefined || value === null) {
      if (required) {
        errors.push(`Missing required field: ${key}`);
      }
      continue;
    }

    if (expectedType === "any") continue;

    if (expectedType === "array") {
      if (!Array.isArray(value)) {
        errors.push(`Field "${key}" expected array, got ${typeof value}`);
      }
    } else if (expectedType === "object") {
      if (typeof value !== "object" || Array.isArray(value)) {
        errors.push(`Field "${key}" expected object, got ${Array.isArray(value) ? "array" : typeof value}`);
      }
    } else if (typeof value !== expectedType) {
      errors.push(`Field "${key}" expected ${expectedType}, got ${typeof value}`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: obj as T };
}

// ─── STABLE KEY ──────────────────────────────────────────────────────────────
// Generate stable keys for list rendering. Prevents duplicate rendering.

export function stableKey(item: unknown, index: number, prefix: string = "item"): string {
  if (item && typeof item === "object" && "id" in item) {
    return `${prefix}-${(item as { id: string }).id}`;
  }
  if (item && typeof item === "object" && "record_id" in item) {
    return `${prefix}-${(item as { record_id: string }).record_id}`;
  }
  return `${prefix}-idx-${index}`;
}

// ─── IS VALID DATA ───────────────────────────────────────────────────────────
// Quick boolean check — is data non-null, non-undefined, and an object?

export function isValidData(data: unknown): data is Record<string, unknown> {
  return data !== null && data !== undefined && typeof data === "object" && !Array.isArray(data);
}

// ─── IS VALID ARRAY DATA ────────────────────────────────────────────────────
// Quick boolean check — is data a non-empty array?

export function isValidArrayData(data: unknown): data is unknown[] {
  return Array.isArray(data) && data.length > 0;
}

// ─── MOCK GUARD ──────────────────────────────────────────────────────────────
// Hard guard: disable mock data paths in runtime.

export function isMockDisabled(): boolean {
  // In production/runtime, mock data is ALWAYS disabled.
  // Only test environment may use mocks.
  if (typeof import.meta !== "undefined" && import.meta.env) {
    return import.meta.env.MODE !== "test";
  }
  return true; // Default: mocks disabled
}

// ─── SAFE JSON PARSE ─────────────────────────────────────────────────────────
// Parse JSON safely. Returns null on failure instead of throwing.

export function safeJsonParse<T = unknown>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
