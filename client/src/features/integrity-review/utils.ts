export function readable(value: string | null | undefined): string {
  return value ? value.replaceAll("_", " ") : "not recorded";
}

export function short_hash(value: string | null | undefined): string {
  if (!value) return "not recorded";
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-12)}` : value;
}

export function format_confidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function error_message(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected integrity review error";
}
