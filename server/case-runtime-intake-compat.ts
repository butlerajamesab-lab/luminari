import { TRPCError } from "@trpc/server";

import {
  getEntity as get_legacy_entity_runtime,
  listEntities as list_legacy_entities_runtime,
  listRelationships as list_legacy_relationships_runtime,
  listRelationshipsEnriched as list_legacy_relationships_enriched_runtime,
} from "./case-runtime-read-compat";
import {
  getEntityRolesForEntity as get_legacy_entity_roles,
  getRelationshipsForEntity as get_legacy_relationships_for_entity,
  getRelationshipsForEntityEnriched as get_legacy_relationships_for_entity_enriched,
  verifyCaseOwnership,
  verifyEntityOwnership as verify_legacy_entity_ownership,
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

/**
 * Compatibility boundary between the UUID/receipt-based Universal Intake Spine
 * and the existing integer case workspace API. Canonical Intake outputs win
 * only when a sealed layer-execution receipt exists for the relevant surface.
 * Otherwise the pre-cutover Lighthouse read remains available during migration.
 */
export async function listEntities(caseId: number) {
  const projection = await project_case_entities(caseId);
  if (projection.state === "canonical_projection") return projection.entities;
  return list_legacy_entities_runtime(caseId);
}

export async function getEntity(id: number) {
  if (is_intake_projection_id(id)) return get_projected_entity(id);
  return get_legacy_entity_runtime(id);
}

export async function verifyEntityOwnership(entityId: number, userId: number) {
  if (!is_intake_projection_id(entityId)) {
    return verify_legacy_entity_ownership(entityId, userId);
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
  return entity;
}

export async function getEntityRolesForEntity(entityId: number) {
  if (!is_intake_projection_id(entityId)) return get_legacy_entity_roles(entityId);
  const roles = await get_projected_entity_roles(entityId);
  return roles ?? [];
}

export async function listRelationships(caseId: number) {
  const projection = await project_case_relationships(caseId);
  if (projection.state === "canonical_projection") return projection.relationships;
  return list_legacy_relationships_runtime(caseId);
}

export async function getRelationshipsForEntity(entityId: number) {
  if (!is_intake_projection_id(entityId)) return get_legacy_relationships_for_entity(entityId);
  const relationships = await get_projected_relationships_for_entity(entityId);
  return relationships ?? [];
}

export async function listRelationshipsEnriched(caseId: number) {
  const projection = await project_case_relationships(caseId);
  if (projection.state === "canonical_projection") return projection.relationships;
  return list_legacy_relationships_enriched_runtime(caseId);
}

export async function getRelationshipsForEntityEnriched(entityId: number) {
  if (!is_intake_projection_id(entityId)) {
    return get_legacy_relationships_for_entity_enriched(entityId);
  }
  const relationships = await get_projected_relationships_for_entity_enriched(entityId);
  return relationships ?? [];
}
