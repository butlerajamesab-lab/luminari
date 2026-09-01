export function isMissingCaseCommitmentRelation(error: unknown): boolean {
  let current: unknown = error;
  for (
    let depth = 0;
    current && typeof current === "object" && depth < 4;
    depth++
  ) {
    const candidate = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (candidate.code === "42P01") return true;
    if (
      typeof candidate.message === "string" &&
      /relation\s+["']?(?:public\.)?case_(?:state|flags)["']?\s+does not exist/i.test(
        candidate.message,
      )
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}
