/** Normalize the existing application-reader contract before deriving current-case UI state. */
export function tracked_benefit_program_ids(applications: unknown, case_id: number | null): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(applications)) return ids;
  for (const application of applications) {
    if (!application || typeof application !== "object") continue;
    const recorded_case_id = Object.hasOwn(application, "case_id") ? application.case_id : application.caseId;
    const program_id = Object.hasOwn(application, "program_id") ? application.program_id : application.programId;
    // Missing case metadata is unknown, not evidence that this is personal tracking.
    const normalized_case_id = recorded_case_id === null ? null
      : (typeof recorded_case_id === "number" || typeof recorded_case_id === "string")
        && /^[1-9]\d*$/.test(String(recorded_case_id)) && Number.isSafeInteger(Number(recorded_case_id))
        ? Number(recorded_case_id) : undefined;
    if (normalized_case_id === case_id && typeof program_id === "string" && program_id.trim()) ids.add(program_id);
  }
  return ids;
}
