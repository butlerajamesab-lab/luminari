export type GovernedRecord = Record<string, any>;

function asRecord(value: unknown): GovernedRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as GovernedRecord)
    : {};
}

function asRecords(value: unknown): GovernedRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function receiptSessionId(row: GovernedRecord): string | null {
  const value = asRecord(row._receipt).intake_session_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sessionScopedIdentity(sessionId: string, value: string): string {
  return `${sessionId}\u001f${value}`;
}

export function governedArtifactIdentitySet(
  artifacts: readonly GovernedRecord[],
  governedDocumentIds?: ReadonlySet<number>,
): Set<string> {
  return new Set(
    artifacts.flatMap((artifact) => {
      if (artifact.integrity_status !== "preserved") return [];
      const sessionId = artifact.intake_session_id;
      const artifactKey = artifact.artifact_key;
      if (
        typeof sessionId !== "string" ||
        sessionId.length === 0 ||
        typeof artifactKey !== "string" ||
        artifactKey.length === 0
      ) {
        return [];
      }
      if (governedDocumentIds) {
        const documentId = Number(artifact.legacy_document_id);
        if (
          !Number.isSafeInteger(documentId) ||
          documentId <= 0 ||
          !governedDocumentIds.has(documentId)
        ) {
          return [];
        }
      }
      return [sessionScopedIdentity(sessionId, artifactKey)];
    }),
  );
}

function recomputeVerificationRecords(
  rows: GovernedRecord[],
  governedArtifactIdentities: Set<string>,
): GovernedRecord[] {
  return rows.flatMap((row) => {
    const sessionId = receiptSessionId(row);
    if (sessionId === null) return [];
    const sourceRefs = asRecords(row.source_refs).filter((ref) =>
      governedArtifactIdentities.has(
        sessionScopedIdentity(sessionId, String(ref.artifact_key ?? "")),
      ),
    );
    if (sourceRefs.length === 0) return [];

    const valuesByArtifact = new Map<string, Set<string>>();
    for (const ref of sourceRefs) {
      const artifactKey = String(ref.artifact_key);
      const values = valuesByArtifact.get(artifactKey) ?? new Set<string>();
      values.add(String(ref.value_stated ?? ""));
      valuesByArtifact.set(artifactKey, values);
    }

    const originalContradictions = asRecords(row.contradiction_refs);
    const attribute = String(
      originalContradictions[0]?.attribute ??
        String(row.fact_key ?? "").split("|")[1] ??
        "unknown",
    );
    const contradictionRefs: GovernedRecord[] = [];
    const artifacts = [...valuesByArtifact.keys()].sort();
    for (let i = 0; i < artifacts.length; i += 1) {
      for (let j = i + 1; j < artifacts.length; j += 1) {
        for (const valueA of [
          ...(valuesByArtifact.get(artifacts[i]) ?? []),
        ].sort()) {
          for (const valueB of [
            ...(valuesByArtifact.get(artifacts[j]) ?? []),
          ].sort()) {
            if (valueA === valueB) continue;
            contradictionRefs.push({
              artifact_key_a: artifacts[i],
              value_a: valueA,
              artifact_key_b: artifacts[j],
              value_b: valueB,
              attribute,
            });
          }
        }
      }
    }

    const allValues = new Set(
      sourceRefs.map((ref) => String(ref.value_stated ?? "")),
    );
    const sameSourceConflict = [...valuesByArtifact.values()].some(
      (values) => values.size > 1,
    );
    const verificationState =
      contradictionRefs.length > 0
        ? "contradicted"
        : sameSourceConflict || allValues.size > 1
          ? "disputed"
          : valuesByArtifact.size >= 2
            ? "supported_by_multiple_sources"
            : "document_stated";

    return [
      {
        ...row,
        verification_state: verificationState,
        source_refs: sourceRefs,
        contradiction_refs: contradictionRefs,
      },
    ];
  });
}

function sourceBoundRegistryRows(
  rows: GovernedRecord[],
  governedArtifactIdentities: Set<string>,
): GovernedRecord[] {
  return rows.filter((row) => {
    const sessionId = receiptSessionId(row);
    if (sessionId === null) return false;
    const sourceArtifacts = stringArray(row.source_artifacts);
    return (
      sourceArtifacts.length > 0 &&
      sourceArtifacts.every((key) =>
        governedArtifactIdentities.has(sessionScopedIdentity(sessionId, key)),
      )
    );
  });
}

function sessionRecordIdentitySet(
  rows: GovernedRecord[],
  fields: string[],
): Set<string> {
  return new Set(
    rows.flatMap((row) => {
      const sessionId = receiptSessionId(row);
      if (sessionId === null) return [];
      for (const field of fields) {
        if (typeof row[field] === "string" && row[field].length > 0) {
          return [sessionScopedIdentity(sessionId, String(row[field]))];
        }
      }
      return [];
    }),
  );
}

function governedRelationshipIdentitySet(rows: GovernedRecord[]): Set<string> {
  const identities = new Set<string>();
  for (const row of rows) {
    const relationshipId =
      row.canonical_relationship_id ??
      row.canonicalRelationshipId ??
      row.relationship_id;
    if (typeof relationshipId !== "string" || relationshipId.length === 0) {
      continue;
    }
    for (const evidence of asRecords(
      row.evidence ?? row.backingEvidence ?? row.backing_evidence,
    )) {
      const sessionId =
        evidence.canonical_intake_session_id ??
        evidence.canonicalIntakeSessionId;
      if (typeof sessionId !== "string" || sessionId.length === 0) continue;
      identities.add(sessionScopedIdentity(sessionId, relationshipId));
    }
  }
  return identities;
}

function governedClaimCandidates(
  rows: GovernedRecord[],
  governedRelationshipIds: Set<string>,
  governedTransitionIds: Set<string>,
  governedPatternIds: Set<string>,
): GovernedRecord[] {
  return rows.filter((row) => {
    const sessionId = receiptSessionId(row);
    if (sessionId === null) return false;
    const relationshipIds = stringArray(row.triggering_relationship_ids);
    const transitionIds = stringArray(row.triggering_transition_ids);
    const patternIds = stringArray(row.triggering_pattern_ids);
    return (
      relationshipIds.length > 0 &&
      relationshipIds.every((id) =>
        governedRelationshipIds.has(sessionScopedIdentity(sessionId, id)),
      ) &&
      transitionIds.every((id) =>
        governedTransitionIds.has(sessionScopedIdentity(sessionId, id)),
      ) &&
      patternIds.every((id) =>
        governedPatternIds.has(sessionScopedIdentity(sessionId, id)),
      )
    );
  });
}

export function projectGovernedDerivedRows(input: {
  verificationRows: GovernedRecord[];
  stateRows: GovernedRecord[];
  patternRows: GovernedRecord[];
  cascadeRows: GovernedRecord[];
  claimRows: GovernedRecord[];
  relationships: GovernedRecord[];
  governedArtifactIdentities: Set<string>;
}): {
  verificationRecords: GovernedRecord[];
  stateTransitions: GovernedRecord[];
  patterns: GovernedRecord[];
  cascades: GovernedRecord[];
  claimCandidates: GovernedRecord[];
} {
  const stateTransitions = input.stateRows.filter((transition) => {
    const sessionId = receiptSessionId(transition);
    if (sessionId === null) return false;
    const artifactKey = String(
      transition.source_artifact_key ??
        transition.canonical_source_artifact_key ??
        "",
    );
    return input.governedArtifactIdentities.has(
      sessionScopedIdentity(sessionId, artifactKey),
    );
  });
  const verificationRecords = recomputeVerificationRecords(
    input.verificationRows,
    input.governedArtifactIdentities,
  );
  const governedTransitionIds = sessionRecordIdentitySet(stateTransitions, [
    "transition_id",
  ]);
  const governedRelationshipIds = governedRelationshipIdentitySet(
    input.relationships,
  );
  const patterns = sourceBoundRegistryRows(
    input.patternRows,
    input.governedArtifactIdentities,
  ).filter((pattern) => {
    const sessionId = receiptSessionId(pattern);
    if (sessionId === null) return false;
    const matchingTransitions = asRecords(pattern.matching_transitions);
    return (
      matchingTransitions.length > 0 &&
      matchingTransitions.every((transition) =>
        governedTransitionIds.has(
          sessionScopedIdentity(
            sessionId,
            String(transition.transition_id ?? ""),
          ),
        ),
      )
    );
  });
  const governedPatternIds = sessionRecordIdentitySet(patterns, ["pattern_id"]);
  const cascades = sourceBoundRegistryRows(
    input.cascadeRows,
    input.governedArtifactIdentities,
  ).filter((cascade) => {
    const sessionId = receiptSessionId(cascade);
    if (sessionId === null) return false;
    const transitions = asRecords(cascade.transitions_in_chain);
    return (
      transitions.length > 0 &&
      transitions.every((transition) =>
        governedTransitionIds.has(
          sessionScopedIdentity(
            sessionId,
            String(transition.transition_id ?? ""),
          ),
        ),
      )
    );
  });
  const claimCandidates = governedClaimCandidates(
    input.claimRows,
    governedRelationshipIds,
    governedTransitionIds,
    governedPatternIds,
  );

  return {
    verificationRecords,
    stateTransitions,
    patterns,
    cascades,
    claimCandidates,
  };
}
