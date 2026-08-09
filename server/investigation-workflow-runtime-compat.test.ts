import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  build_investigation_workflow_dto,
  parse_source_text_list,
  type InvestigationWorkflowSourceRows,
} from "./investigation-workflow-runtime-compat";

const input = {
  domain: "employment",
  claimType: "retaliation",
  agencyShort: "EEOC",
  incidentDate: "2026-08-01",
  hasDocuments: true,
  hasWitnesses: false,
};

function sourceRows(): InvestigationWorkflowSourceRows {
  return {
    workflows: [{
      id: 2,
      title: "Registry workflow",
      domain: "employment",
      issue_types: '["retaliation"]',
      primary_agency: "Registry agency",
      workflow_status: "active",
    }],
    steps: [{
      id: 9,
      workflow_id: 2,
      step_number: 1,
      step_order: 1,
      action_type: "filing",
      action_description: "Source filing action",
      deadline_days: 30,
      title: "Source filing step",
      description: "Source description",
      required_inputs: '["Source record"]',
      estimated_days: 3,
      deadline_rule: "See current controlling source text",
      warnings: '["Source warning"]',
      step_type: "filing",
    }],
    claimElements: [{
      id: 3,
      claim_type: "retaliation",
      element_name: "Source element",
      element_description: "Source element description",
      element_order: 1,
      evidence_types: '["Source evidence"]',
    }],
    signals: [{
      id: 5,
      signal_type: "source_signal",
      severity: "high",
      trigger_patterns: '["source pattern"]',
      recommended_next_steps: '["source next step"]',
    }],
    contradictionTemplateCount: 1,
    proofFrameworkCount: 1,
    barriers: [{
      id: 4,
      name: "Source barrier",
      domains: '["employment"]',
      severity: "medium",
      possible_workarounds: '["Source workaround"]',
    }],
    weakJoints: [{
      id: "90aa44f9-9550-4ec6-b2c6-6bb086f7e489",
      weak_joint_id: "WJ-source",
      title: "Source weak joint",
      description: "Source weak-joint description",
      severity_level: "high",
      severity_rationale: "Source rationale",
      metadata: { domains: ["employment"] },
    }],
    agencyForms: [{
      id: 7,
      agency: "Registry agency",
      agency_short: "EEOC",
      form_name: "Registry form",
      filing_deadline: "Consult the linked current agency instructions.",
      link: "https://example.gov/current-source",
    }],
  };
}

describe("source-bound investigation workflow contract", () => {
  it("maps exact snake-case source rows to one camel-case DTO", () => {
    const result = build_investigation_workflow_dto(input, sourceRows());

    expect(result.availability.status).toBe("available");
    expect(result.workflow.timelineTasks[0]).toMatchObject({
      task: "Source filing step",
      deadlineText: "See current controlling source text",
      durationText: "Source estimate: 3 days",
    });
    expect(result.workflow.agencySteps[0]).toMatchObject({
      agency: "Registry agency",
      deadlineState: "source_text_only",
    });
    expect(result.workflow.signalWatchList[0]).toMatchObject({
      signalType: "source_signal",
      triggerPatterns: ["source pattern"],
      nextSteps: ["source next step"],
    });
    expect(result.metadata).toMatchObject({
      weakJointsConsidered: 1,
      signalsConsidered: 1,
      contradictionTemplatesConsidered: 1,
      proofFrameworksConsidered: 1,
      barriersConsidered: 1,
      claimElementsConsidered: 1,
    });
    expect(JSON.stringify(result)).not.toMatch(/"(?:claim_type|agency_short|immediate_actions|signal_type)"/);
  });

  it("keeps deadline prose as source text and refuses to synthesize a date", () => {
    const result = build_investigation_workflow_dto(input, sourceRows());

    expect(result.deadlineSources[0]).toMatchObject({
      filingDeadlineText: "Consult the linked current agency instructions.",
      calculationState: "source_text_only",
      calculatedDeadlineDate: null,
      sourceUrl: "https://example.gov/current-source",
    });
    expect(result.sectionAvailability.deadlineCalculations.status).toBe("unavailable");
  });

  it("returns an explicit unavailable state instead of guessing among source workflows", () => {
    const rows = sourceRows();
    rows.workflows.push({
      ...rows.workflows[0],
      id: 3,
      title: "Second registry workflow",
    });

    const result = build_investigation_workflow_dto(
      { ...input, claimType: undefined },
      rows,
    );

    expect(result.availability).toMatchObject({
      status: "unavailable",
      reason: expect.stringMatching(/Multiple active source workflows/),
    });
    expect(result.workflow.timelineTasks).toEqual([]);
  });

  it("parses JSON-encoded live text lists without inventing values", () => {
    expect(parse_source_text_list('["one", "two"]')).toEqual(["one", "two"]);
    expect(parse_source_text_list("plain source text")).toEqual(["plain source text"]);
    expect(parse_source_text_list(null)).toEqual([]);
  });

  it("wires the production route and UI to the camel, Postgres-only contract", () => {
    const routerSource = readFileSync(
      fileURLToPath(new URL("./routers/enforcement-intelligence.ts", import.meta.url)),
      "utf8",
    );
    const route = routerSource.slice(
      routerSource.indexOf("generateInvestigationWorkflow:"),
      routerSource.indexOf("// ═══ Combined Stats"),
    );
    const readerSource = readFileSync(
      fileURLToPath(new URL("./investigation-workflow-runtime-compat.ts", import.meta.url)),
      "utf8",
    );
    const uiSource = readFileSync(
      fileURLToPath(new URL("../client/src/pages/InvestigationWorkflow.tsx", import.meta.url)),
      "utf8",
    );

    expect(route).toContain("claimType:");
    expect(route).toContain("agencyShort:");
    expect(route).toContain("read_investigation_workflow");
    expect(route).not.toContain("claim_type");
    expect(route).not.toContain("agency_short");
    expect(route).not.toContain("JSON_CONTAINS");
    expect(route).not.toContain("agencyDeadlines");

    expect(readerSource).toContain("from public.workflow_master");
    expect(readerSource).toContain("from public.workflow_steps");
    expect(readerSource).toContain("from public.agency_forms");
    const liveReader = readerSource.slice(readerSource.indexOf("export async function read_investigation_workflow"));
    expect(liveReader.match(/getPool\(\)\.query/g)).toHaveLength(1);
    expect(liveReader).not.toContain("Promise.all");
    expect(readerSource).not.toMatch(/\b(?:insert|update|delete|alter|create)\s+(?:into|table)\b/i);

    expect(uiSource).toContain("availability.status");
    expect(uiSource).toContain("deadlineText");
    expect(uiSource).toContain("source text only");
    expect(uiSource).not.toMatch(/\b(?:EEOC|HUD|OSHA|FTC)\b.*\b(?:30|90|180|300|365)[ -]day/i);
  });
});
