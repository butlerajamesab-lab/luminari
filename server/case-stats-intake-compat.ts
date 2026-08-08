import { getCaseStats as get_legacy_case_stats } from "./case-contract-compat";
import { listEvents } from "./case-runtime-chronology-compat";
import { project_case_entities, project_case_relationships } from "./intake-case-runtime-projection";

/**
 * Case statistics are a presentation projection, not a second canonical store.
 * Where a sealed Universal Intake Spine layer has cut over a case surface, the
 * count shown in Lighthouse must be derived from that same canonical projection.
 * Surfaces that have not yet cut over retain the legacy count until their own
 * governed projection exists.
 */
export async function getCaseStats(caseId: number) {
  const [legacy, entities, relationships, events] = await Promise.all([
    get_legacy_case_stats(caseId),
    project_case_entities(caseId),
    project_case_relationships(caseId),
    listEvents(caseId),
  ]);

  return {
    ...legacy,
    entities: entities.state === "canonical_projection"
      ? entities.entities.length
      : legacy.entities,
    relationships: relationships.state === "canonical_projection"
      ? relationships.relationships.length
      : legacy.relationships,
    events: events.length,
  };
}
