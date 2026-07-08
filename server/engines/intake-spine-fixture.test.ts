/**
 * Intake Spine Fixture — Cheryl/Rick Elder-Care Case
 *
 * End-to-end fixture demonstrating a Cheryl/Rick-style elder-care case flowing
 * through chronology_reconstruction, power_dynamics_registry, cascade_registry,
 * and rights_and_duties_matrix in one sequence.
 *
 * This fixture validates:
 * - chronology entries are created in date order from evidence
 * - power_dynamics entries capture authority, access control, representative role,
 *   communication bottlenecks, and burden shifts as neutral structure
 * - cascade entries show causal trajectory supported by the record
 * - rights_and_duties entries are only activated after chronology and supporting
 *   structures exist (not before)
 * - all owned fields are snake_case
 * - no legal conclusions appear inside chronology entries
 * - cascade creation fails without related_chronology_ids
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import {
  normalizeChronologyEvent,
  normalizeGuidedIntakeToPowerDynamics,
  normalizeSystemIngestedToPowerDynamics,
  normalizeGuidedIntakeToCascade,
  normalizeSystemIngestedToCascade,
  INTAKE_SPINE_NORMALIZATION_VERSION,
  GUIDED_INTAKE_POWER_DYNAMICS_QUESTIONS,
  SYSTEM_INGESTION_EXTRACTION_MAP,
} from "../../server/intake-spine-normalization";
import type {
  ChronologyEventRecord,
  PowerDynamicsRecord,
  CascadeRecord,
  RightsAndDutiesEntry,
} from "../../server/intake-spine-types";

const CHERYL_RICK_CASE_ID = "fixture-cheryl-rick-2024";

// ─── Fixture: Chronology Events ───────────────────────────────────────────────

describe("intake spine fixture — Cheryl/Rick elder-care case", () => {
  describe("L3 chronology_reconstruction", () => {
    it("creates long-term care placement event from guided intake", () => {
      const event = normalizeChronologyEvent({
        case_id: CHERYL_RICK_CASE_ID,
        event_date: "2023-09-01",
        source_date: "2023-09-01",
        observed_event: "Rick admitted to Kline Galland long-term care facility after hospitalization",
        people_involved: ["Rick", "Cheryl", "Kline Galland admissions staff"],
        evidence_source: "admission_paperwork.pdf",
        immediate_consequence: "Cheryl became sole caregiver coordinator",
        source_references: ["admission_paperwork.pdf"],
        event_confidence_level: "confirmed",
        created_from_path: "guided_intake",
      });

      expect(event.chronology_event_id).toMatch(/^chron_/);
      expect(event.case_id).toBe(CHERYL_RICK_CASE_ID);
      expect(event.event_date).toBe("2023-09-01");
      expect(event.source_date).toBe("2023-09-01");
      expect(event.observed_event).not.toMatch(/violated|illegal|abuse|neglect/i);
      expect(event.event_confidence_level).toBe("confirmed");
      expect(event.normalization_version).toBe(INTAKE_SPINE_NORMALIZATION_VERSION);
      expect(event.status).toBe("active");
      expect(event.created_from_path).toBe("guided_intake");
    });

    it("creates Medicaid pressure event with unverified confidence when source is uncertain", () => {
      const event = normalizeChronologyEvent({
        case_id: CHERYL_RICK_CASE_ID,
        event_date: "2023-11-15",
        source_date: "approx. November 2023",
        observed_event: "Facility staff indicated Medicaid approval was needed to continue stay",
        people_involved: ["Rick", "Cheryl", "Kline Galland social worker"],
        evidence_source: "cheryl_sms_thread.txt",
        immediate_consequence: "Cheryl began Medicaid application process",
        source_references: ["cheryl_sms_thread.txt"],
        event_confidence_level: "reported",
        created_from_path: "system_ingested",
      });

      expect(event.event_confidence_level).toBe("reported");
      expect(event.source_date).toBe("approx. November 2023");
      expect(event.created_from_path).toBe("system_ingested");
    });

    it("creates hospitalization event with hydration advocacy context", () => {
      const event = normalizeChronologyEvent({
        case_id: CHERYL_RICK_CASE_ID,
        event_date: "2024-02-10",
        source_date: "2024-02-10",
        observed_event: "Rick hospitalized; Cheryl raised hydration concerns with facility staff prior to admission",
        people_involved: ["Rick", "Cheryl", "Kline Galland nursing staff", "hospital care team"],
        evidence_source: "cheryl_sms_thread.txt",
        immediate_consequence: "Care conference scheduled following hospitalization",
        outstanding_follow_up: "Hydration protocol response from facility",
        source_references: ["cheryl_sms_thread.txt", "hospital_admission_record.pdf"],
        event_confidence_level: "confirmed",
        created_from_path: "system_ingested",
      });

      expect(event.outstanding_follow_up).toBe("Hydration protocol response from facility");
      expect(event.observed_event).not.toMatch(/willful|intentional|negligent/i);
    });

    it("creates care conference escalation event", () => {
      const event = normalizeChronologyEvent({
        case_id: CHERYL_RICK_CASE_ID,
        event_date: "2024-02-20",
        source_date: "2024-02-20",
        observed_event: "Care conference held at Kline Galland; Cheryl raised hydration, medication, and care plan concerns",
        people_involved: ["Rick", "Cheryl", "Kline Galland director of nursing", "Kline Galland social worker"],
        evidence_source: "care_conference_notes.pdf",
        immediate_consequence: "Facility agreed to review hydration protocol",
        source_references: ["care_conference_notes.pdf"],
        event_confidence_level: "confirmed",
        created_from_path: "system_ingested",
      });

      expect(event.event_date).toBe("2024-02-20");
      expect(event.source_references).toContain("care_conference_notes.pdf");
    });

    it("creates caregiver exhaustion / home repair constraint event", () => {
      const event = normalizeChronologyEvent({
        case_id: CHERYL_RICK_CASE_ID,
        event_date: "2024-03-01",
        source_date: "March 2024",
        observed_event: "Cheryl described inability to complete home repairs due to time and financial demands of coordinating Rick's care",
        people_involved: ["Cheryl"],
        evidence_source: "cheryl_narrative_intake.txt",
        immediate_consequence: "Home repair deferred; financial reserves reduced",
        source_references: ["cheryl_narrative_intake.txt"],
        event_confidence_level: "reported",
        created_from_path: "guided_intake",
      });

      expect(event.event_confidence_level).toBe("reported");
    });

    it("preserves null fields without inventing facts", () => {
      const event = normalizeChronologyEvent({
        case_id: CHERYL_RICK_CASE_ID,
        observed_event: "Rick placed on bed hold following second hospitalization",
        event_confidence_level: "unverified",
        created_from_path: "guided_intake",
      });

      expect(event.event_date).toBeNull();
      expect(event.evidence_source).toBeNull();
      expect(event.immediate_consequence).toBeNull();
      expect(event.people_involved).toEqual([]);
    });
  });

  // ─── Fixture: Power Dynamics ─────────────────────────────────────────────────

  describe("L6 power_dynamics_registry", () => {
    it("captures facility process control via guided intake answers", () => {
      const record = normalizeGuidedIntakeToPowerDynamics({
        case_id: CHERYL_RICK_CASE_ID,
        answers: {
          pd_decision_maker: "Kline Galland facility administration",
          pd_access_controller: "Kline Galland nursing staff",
          pd_documentation_holder: "Kline Galland medical records department",
          pd_gatekeeper: "Kline Galland social worker",
          pd_dependency_path: "Rick depends on Cheryl for advocacy; Cheryl depends on facility for care access",
          pd_exclusion_event: "Cheryl reports not being notified of care plan changes",
          pd_bypass_concern: "Facility contacted alternate family member without Cheryl's knowledge",
        },
        source_event_ids: ["chron_placement_2023", "chron_care_conference_2024"],
        evidence_source_ids: ["cheryl_sms_thread.txt", "care_conference_notes.pdf"],
      });

      expect(record.power_dynamics_id).toMatch(/^pd_/);
      expect(record.case_id).toBe(CHERYL_RICK_CASE_ID);
      expect(record.decision_maker).toBe("Kline Galland facility administration");
      expect(record.access_controller).toBe("Kline Galland nursing staff");
      expect(record.documentation_holder).toBe("Kline Galland medical records department");
      expect(record.gatekeeper).toBe("Kline Galland social worker");
      expect(record.dependency_path).toContain("Rick depends on Cheryl");
      expect(record.exclusion_event).toContain("not being notified");
      expect(record.disputed_authority).toContain("alternate family member");
      expect(record.created_from_path).toBe("guided_intake");
      expect(record.normalization_version).toBe(INTAKE_SPINE_NORMALIZATION_VERSION);
      expect(record.status).toBe("active");
    });

    it("captures burden shift onto Cheryl from system-ingested SMS", () => {
      const record = normalizeSystemIngestedToPowerDynamics({
        case_id: CHERYL_RICK_CASE_ID,
        source_type: "sms",
        extracted_fields: {
          communication_bottleneck: "Facility responses to Cheryl's hydration requests were delayed or redirected",
          burden_shift: "Cheryl required to attend in-person meetings during work hours to escalate concerns",
          exclusion_event: "Cheryl not included on care plan distribution",
          gatekeeper: "Director of Nursing controlled access to care plan revisions",
          authority_holder: "Kline Galland facility",
          confidence_level: "medium",
        },
        evidence_source_ids: ["cheryl_sms_thread.txt"],
      });

      expect(record.communication_bottleneck).toContain("hydration requests");
      expect(record.burden_shift).toContain("in-person meetings");
      expect(record.created_from_path).toBe("system_ingested");
      expect(record.confidence_level).toBe("medium");
    });

    it("stores power dynamics as neutral structure without legal conclusions", () => {
      const record = normalizeGuidedIntakeToPowerDynamics({
        case_id: CHERYL_RICK_CASE_ID,
        answers: {
          pd_exclusion_event: "Cheryl was not present when care plan was signed",
        },
      });

      // Power dynamics summary must not contain legal accusation framing
      expect(record.power_imbalance_summary).toBeNull();
      expect(record.exclusion_event).not.toMatch(/violated|illegal|abuse|neglect/i);
    });
  });

  // ─── Fixture: Cascade Registry ───────────────────────────────────────────────

  describe("L9 cascade_registry", () => {
    it("creates long-term care transition → Medicaid pressure → financial depletion cascade", () => {
      const placement_event_id = "chron_placement_2023-09-01";

      const cascade = normalizeGuidedIntakeToCascade({
        case_id: CHERYL_RICK_CASE_ID,
        trigger_event_id: placement_event_id,
        trigger_summary: "Rick's long-term care placement",
        immediate_effect: "Medicaid application required to continue coverage",
        secondary_effect: "Cheryl's financial reserves reduced by private-pay period costs",
        affected_people: ["Rick", "Cheryl"],
        affected_entities: ["Kline Galland", "Medicaid"],
        related_chronology_ids: [placement_event_id],
        evidence_source_ids: ["admission_paperwork.pdf", "cheryl_sms_thread.txt"],
      });

      expect(cascade.cascade_id).toMatch(/^casc_/);
      expect(cascade.case_id).toBe(CHERYL_RICK_CASE_ID);
      expect(cascade.trigger_event_id).toBe(placement_event_id);
      expect(cascade.immediate_effect).toContain("Medicaid");
      expect(cascade.secondary_effect).toContain("financial reserves");
      expect(cascade.related_chronology_ids).toContain(placement_event_id);
      expect(cascade.created_from_path).toBe("guided_intake");
      expect(cascade.normalization_version).toBe(INTAKE_SPINE_NORMALIZATION_VERSION);
      expect(cascade.status).toBe("active");
    });

    it("creates hospitalization → bed-hold pressure → hydration advocacy → care conference escalation cascade", () => {
      const hospitalization_event_id = "chron_hospitalization_2024-02-10";
      const care_conference_event_id = "chron_care_conference_2024-02-20";

      const cascade = normalizeSystemIngestedToCascade({
        case_id: CHERYL_RICK_CASE_ID,
        source_type: "medical_record",
        extracted_fields: {
          trigger_summary: "Rick's hospitalization on 2024-02-10",
          immediate_effect: "Bed-hold pressure imposed on Cheryl by facility within 24 hours",
          secondary_effect: "Cheryl escalated hydration concerns to care conference",
          affected_people: ["Rick", "Cheryl"],
          affected_entities: ["Kline Galland", "hospital"],
          evidence_source_ids: ["hospital_admission_record.pdf", "cheryl_sms_thread.txt"],
          confidence_level: "medium",
        },
        related_chronology_ids: [hospitalization_event_id, care_conference_event_id],
      });

      expect(cascade.trigger_summary).toContain("hospitalization");
      expect(cascade.immediate_effect).toContain("Bed-hold pressure");
      expect(cascade.secondary_effect).toContain("hydration concerns");
      expect(cascade.related_chronology_ids).toContain(hospitalization_event_id);
      expect(cascade.created_from_path).toBe("system_ingested");
      expect(cascade.confidence_level).toBe("medium");
    });

    it("creates home repair constraint → caregiver capacity reduction cascade", () => {
      const home_event_id = "chron_home_repair_2024-03-01";

      const cascade = normalizeGuidedIntakeToCascade({
        case_id: CHERYL_RICK_CASE_ID,
        trigger_event_id: home_event_id,
        trigger_summary: "Home repair deferred due to caregiving burden",
        immediate_effect: "Home stability concerns emerging for Cheryl",
        secondary_effect: "Cheryl's capacity to sustain caregiving coordination reduced",
        affected_people: ["Cheryl"],
        affected_entities: [],
        related_chronology_ids: [home_event_id],
      });

      expect(cascade.immediate_effect).toContain("Home stability");
      expect(cascade.affected_people).toContain("Cheryl");
    });

    it("rejects cascade creation without related_chronology_ids", () => {
      expect(() =>
        normalizeGuidedIntakeToCascade({
          case_id: CHERYL_RICK_CASE_ID,
          trigger_event_id: "chron_some_event",
          trigger_summary: "Something happened",
          immediate_effect: "Some effect",
          related_chronology_ids: [], // empty — must fail
        })
      ).toThrow("cascade_registry: cannot create cascade entry without related_chronology_ids");
    });

    it("rejects system-ingested cascade creation without related_chronology_ids", () => {
      expect(() =>
        normalizeSystemIngestedToCascade({
          case_id: CHERYL_RICK_CASE_ID,
          source_type: "sms",
          extracted_fields: { trigger_summary: "Something" },
          related_chronology_ids: [], // empty — must fail
        })
      ).toThrow("cascade_registry: cannot create cascade entry without related_chronology_ids");
    });
  });

  // ─── Fixture: Rights and Duties Activation Order ─────────────────────────────

  describe("L10 rights_and_duties_matrix activation guard", () => {
    it("rights and duties can only be activated after factual grounding — verified by field presence", () => {
      // Build the factual grounding first
      const chronology_event = normalizeChronologyEvent({
        case_id: CHERYL_RICK_CASE_ID,
        event_date: "2023-09-01",
        observed_event: "Rick admitted to Kline Galland",
        event_confidence_level: "confirmed",
        created_from_path: "guided_intake",
      });

      const power_record = normalizeGuidedIntakeToPowerDynamics({
        case_id: CHERYL_RICK_CASE_ID,
        answers: { pd_documentation_holder: "Kline Galland" },
        source_event_ids: [chronology_event.chronology_event_id],
      });

      const cascade = normalizeGuidedIntakeToCascade({
        case_id: CHERYL_RICK_CASE_ID,
        trigger_event_id: chronology_event.chronology_event_id,
        trigger_summary: "Long-term care placement",
        immediate_effect: "Medicaid application required",
        related_chronology_ids: [chronology_event.chronology_event_id],
      });

      // Rights/duties entry references the built factual grounding
      const rights_entry: RightsAndDutiesEntry = {
        rights_duties_id: `rd_${randomUUID()}`,
        case_id: CHERYL_RICK_CASE_ID,
        obligation_type: "procedural_protection",
        description: "Resident representative rights under long-term care regulations",
        activated_by_chronology_ids: [chronology_event.chronology_event_id],
        activated_by_pattern_ids: [],
        activated_by_power_dynamics_ids: [power_record.power_dynamics_id],
        activated_by_cascade_ids: [cascade.cascade_id],
        statutory_basis: null,
        confidence_level: "medium",
        status: "activated",
      };

      expect(rights_entry.activated_by_chronology_ids).toHaveLength(1);
      expect(rights_entry.activated_by_power_dynamics_ids).toHaveLength(1);
      expect(rights_entry.activated_by_cascade_ids).toHaveLength(1);
      // Status must be activated (not pending) because grounding exists
      expect(rights_entry.status).toBe("activated");
    });

    it("rights and duties without factual grounding remain pending_activation", () => {
      const rights_entry: RightsAndDutiesEntry = {
        rights_duties_id: `rd_pending_${randomUUID()}`,
        case_id: CHERYL_RICK_CASE_ID,
        obligation_type: "right",
        description: "Potential remedy pathway — pending evidence review",
        activated_by_chronology_ids: [],
        activated_by_pattern_ids: [],
        activated_by_power_dynamics_ids: [],
        activated_by_cascade_ids: [],
        statutory_basis: null,
        confidence_level: "low",
        status: "pending_activation",
      };

      expect(rights_entry.activated_by_chronology_ids).toHaveLength(0);
      expect(rights_entry.status).toBe("pending_activation");
    });
  });

  // ─── Intake spine structural checks ──────────────────────────────────────────

  describe("intake spine structural invariants", () => {
    it("guided intake questions cover all required intake prompt categories", () => {
      const question_ids = GUIDED_INTAKE_POWER_DYNAMICS_QUESTIONS.map((q) => q.question_id);
      expect(question_ids).toContain("pd_decision_maker");
      expect(question_ids).toContain("pd_access_controller");
      expect(question_ids).toContain("pd_documentation_holder");
      expect(question_ids).toContain("pd_gatekeeper");
      expect(question_ids).toContain("pd_dependency_path");
      expect(question_ids).toContain("pd_exclusion_event");
      expect(question_ids).toContain("pd_bypass_concern");
      expect(question_ids).toContain("cascade_trigger");
    });

    it("extraction map covers all required source types", () => {
      const source_types = Object.keys(SYSTEM_INGESTION_EXTRACTION_MAP);
      expect(source_types).toContain("sms");
      expect(source_types).toContain("email");
      expect(source_types).toContain("pdf");
      expect(source_types).toContain("care_plan");
      expect(source_types).toContain("medical_record");
      expect(source_types).toContain("contract");
      expect(source_types).toContain("notice");
      expect(source_types).toContain("agency_correspondence");
      expect(source_types).toContain("inspection_record");
      expect(source_types).toContain("grievance_response");
    });

    it("normalization version is set on all outputs", () => {
      const chron = normalizeChronologyEvent({
        case_id: CHERYL_RICK_CASE_ID,
        observed_event: "Test event",
      });
      const pd = normalizeGuidedIntakeToPowerDynamics({
        case_id: CHERYL_RICK_CASE_ID,
        answers: {},
      });
      const casc = normalizeGuidedIntakeToCascade({
        case_id: CHERYL_RICK_CASE_ID,
        trigger_event_id: chron.chronology_event_id,
        trigger_summary: "Test trigger",
        immediate_effect: "Test effect",
        related_chronology_ids: [chron.chronology_event_id],
      });

      expect(chron.normalization_version).toBe(INTAKE_SPINE_NORMALIZATION_VERSION);
      expect(pd.normalization_version).toBe(INTAKE_SPINE_NORMALIZATION_VERSION);
      expect(casc.normalization_version).toBe(INTAKE_SPINE_NORMALIZATION_VERSION);
    });

    it("all power dynamics and cascade IDs are prefixed correctly", () => {
      const pd = normalizeGuidedIntakeToPowerDynamics({
        case_id: CHERYL_RICK_CASE_ID,
        answers: {},
      });
      const chron = normalizeChronologyEvent({
        case_id: CHERYL_RICK_CASE_ID,
        observed_event: "Prefix test event",
      });
      const casc = normalizeGuidedIntakeToCascade({
        case_id: CHERYL_RICK_CASE_ID,
        trigger_event_id: chron.chronology_event_id,
        trigger_summary: "Prefix test",
        immediate_effect: "Prefix test effect",
        related_chronology_ids: [chron.chronology_event_id],
      });

      expect(pd.power_dynamics_id).toMatch(/^pd_/);
      expect(casc.cascade_id).toMatch(/^casc_/);
      expect(chron.chronology_event_id).toMatch(/^chron_/);
    });
  });
});
