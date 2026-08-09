export function normalizeCaseId(value: number | string | null | undefined): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function caseWorkspacePath(value: number | string | null | undefined): string {
  const caseId = normalizeCaseId(value);
  return caseId === null ? "/cases" : `/guide/${caseId}`;
}
