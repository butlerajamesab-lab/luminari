export type EditableCaseMetadata = {
  name: string | null;
  description: string | null;
  domain: string | null;
  container: string | null;
};

export type CaseMetadataCorrection = {
  id: number;
  name?: string;
  description?: string;
  domain?: string;
  container?: string;
};

export function buildCaseMetadataCorrection(
  caseId: number,
  before: EditableCaseMetadata,
  after: Required<EditableCaseMetadata>,
): CaseMetadataCorrection {
  const correction: CaseMetadataCorrection = { id: caseId };
  const correctedName = after.name.trim();

  if (correctedName !== before.name) correction.name = correctedName;
  if (after.description !== (before.description ?? "")) {
    correction.description = after.description;
  }
  if (after.domain !== (before.domain ?? "")) correction.domain = after.domain;
  if (after.container !== (before.container ?? "")) {
    correction.container = after.container;
  }

  return correction;
}
