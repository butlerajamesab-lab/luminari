import { TRPCError } from "@trpc/server";

import {
  verifyCaseOwnership,
} from "./db-legacy";
import {
  decode_intake_projection_case_id,
  get_projected_entity,
  get_projected_entity_roles,
  get_projected_relationships_for_entity,
  get_projected_relationships_for_entity_enriched,
  is_intake_projection_id,
  project_case_entities,
  project_case_relationships,
} from "./intake-case-runtime-projection";

function externalize_entity(entity: any) {
  const {
    canonicalEntityId,
    canonicalOutputHashes,
    canonicalReceiptHashes,
    projectionSource,
    ...legacy_shape
  } = entity;
  return {
    ...legacy_shape,
    canonical_entity_id: canonicalEntityId,
    canonical_output_hashes: canonicalOutputHashes,
    canonical_receipt_hashes: canonicalReceiptHashes,
    projection_source: projectionSource,
  };
}

function externalize_entity_role(role: any) {
  const {
    canonicalArtifactKey,
    canonicalSpanOffset,
    projectionSource,
    ...legacy_shape
  } = role;
  return {
    ...legacy_shape,
    canonical_artifact_key: canonicalArtifactKey,
    canonical_span_offset: canonicalSpanOffset,
    projection_source: projectionSource,
  };
}

function externalize_relationship_evidence(evidence: any) {
  const {
    canonicalArtifactKey,
    canonicalMarkerText,
    canonicalMarkerOffset,
    projectionSource,
    ...legacy_shape
  } = evidence;
  return {
    ...legacy_shape,
    canonical_artifact_key: canonicalArtifactKey,
    canonical_marker_text: canonicalMarkerText,
    canonical_marker_offset: canonicalMarkerOffset,
    projection_source: projectionSource,
  };
}

function externalize_relationship(relationship: any) {
  const {
    canonicalRelationshipId,
    canonicalOutputHashes,
    canonicalReceiptHashes,
    projectionSource,
    evidence,
    backingEvidence,
    ...legacy_shape
  } = relationship;
  const external_evidence = Array.isArray(evidence)
    ? evidence.map(externalize_relationship_evidence)
    : [];
  return {
    ...legacy_shape,
    canonical_relationship_id: canonicalRelationshipId,
    canonical_output_hashes: canonicalOutputHashes,
    canonical_receipt_hashes: canonicalReceiptHashes,
    projection_source: projectionSource,
    evidence: external_evidence,
    backingEvidence: Array.isArray(backingEvidence)
      ? backingEvidence.map(externalize_relationship_evidence)
      : external_evidence,
  };
}

/**
 * Compatibility boundary between the UUID/receipt-based Universal Intake Spine
 * and the existing integer case workspace API. Canonical Intake outputs win
 * only when a sealed layer-execution receipt exists for the relevant surface.
 * Otherwise the surface returns an explicit empty projection. The pre-cutover
 * entity/relationship tables are not a second runtime authority.
 *
 * Existing legacy compatibility fields retain their historical UI casing. Any
 * metadata introduced by the Intake projection is emitted in snake_case.
 */
export async function listEntities(caseId: number) {
  const projection = await project_case_entities(caseId);
  if (projection.state === "canonical_projection") {
    return projection.entities.map(externalize_entity);
  }
  return [];
}

export async function getEntity(id: number) {
  if (is_intake_projection_id(id)) {
    const entity = await get_projected_entity(id);
    return entity ? externalize_entity(entity) : null;
  }
  return null;
}

export async function verifyEntityOwnership(entityId: number, userId: number) {
  if (!is_intake_projection_id(entityId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
  }

  const case_id = decode_intake_projection_case_id(entityId);
  if (!case_id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
  }
  await verifyCaseOwnership(case_id, userId);
  const entity = await get_projected_entity(entityId);
  if (!entity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Entity not found" });
  }
  return externalize_entity(entity);
}

export async function getEntityRolesForEntity(entityId: number) {
  if (!is_intake_projection_id(entityId)) return [];
  const roles = await get_projected_entity_roles(entityId);
  return (roles ?? []).map(externalize_entity_role);
}

export async function listRelationships(caseId: number) {
  const projection = await project_case_relationships(caseId);
  if (projection.state === "canonical_projection") {
    return projection.relationships.map(externalize_relationship);
  }
  return [];
}

export async function getRelationshipsForEntity(entityId: number) {
  if (!is_intake_projection_id(entityId)) return [];
  const relationships = await get_projected_relationships_for_entity(entityId);
  return (relationships ?? []).map(externalize_relationship);
}

export async function listRelationshipsEnriched(caseId: number) {
  const projection = await project_case_relationships(caseId);
  if (projection.state === "canonical_projection") {
    return projection.relationships.map(externalize_relationship);
  }
  return [];
}

export async function getRelationshipsForEntityEnriched(entityId: number) {
  if (!is_intake_projection_id(entityId)) {
    return [];
  }
  const relationships = await get_projected_relationships_for_entity_enriched(entityId);
  return (relationships ?? []).map(externalize_relationship);
}
