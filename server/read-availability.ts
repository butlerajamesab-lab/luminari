export type read_availability_result = {
  status: "available" | "empty" | "unavailable" | "error";
  error: { code: string | null; message: string } | null;
};

export function read_availability(count: number | null, failure?: unknown): read_availability_result {
  if (failure !== undefined) {
    const code = failure && typeof failure === "object" && "code" in failure ? String(failure.code) : null;
    return { status: code === "42P01" || code === "42501" ? "unavailable" : "error",
      error: { code, message: failure instanceof Error ? failure.message : String(failure) } };
  }
  return { status: count === null ? "unavailable" : count === 0 ? "empty" : "available", error: null };
}
