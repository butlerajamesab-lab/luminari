import { describe, it, expect, vi } from "vitest";

/**
 * Tests for the enforcement action paths system.
 * Validates:
 * 1. DB helpers return structured data for housing-related pipelines
 * 2. The data contains all required fields for the UI (agency, form, steps, deadlines, escalation)
 * 3. Pipeline type mapping works (benefits_denial, section8_disputes, housing_discrimination)
 * 4. Empty pipeline types return empty arrays gracefully
 */

// We test the db helpers directly since they're the core data layer
describe("Enforcement Action Paths", () => {
  it("should return action paths for benefits_denial pipeline", async () => {
    const { getActionPathsByPipeline } = await import("./db");
    const paths = await getActionPathsByPipeline("benefits_denial");

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThan(0);

    const path = paths[0];
    // Core identification
    expect(path.pipelineType).toBe("benefits_denial");
    expect(path.claimLabel).toBeTruthy();
    expect(path.jurisdiction).toBeTruthy();

    // Agency info — the bridge from "what happened" to "who to contact"
    expect(path.agencyName).toBeTruthy();

    // Filing info — the bridge from "who to contact" to "how to file"
    expect(path.formName).toBeTruthy();

    // Steps — the bridge from "how to file" to "what to do"
    expect(path.steps).toBeTruthy();
    expect(Array.isArray(path.steps)).toBe(true);
    if (path.steps && path.steps.length > 0) {
      const step = path.steps[0];
      expect(step.order).toBeDefined();
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
    }

    // Metadata
    expect(path.isActive).toBe(true);
  });

  it("should return action paths for housing_discrimination pipeline", async () => {
    const { getActionPathsByPipeline } = await import("./db");
    const paths = await getActionPathsByPipeline("housing_discrimination");

    expect(paths.length).toBeGreaterThan(0);
    const path = paths[0];
    expect(path.pipelineType).toBe("housing_discrimination");
    // Agency name is the full name, acronym is in a separate field
    expect(path.agencyName).toBeTruthy();
    expect(path.agencyAcronym).toContain("HUD");

    // HUD complaint has a specific form
    expect(path.formName).toBeTruthy();
    expect(path.formUrl).toBeTruthy();

    // Filing deadline should be set (1 year for HUD)
    expect(path.filingDeadlineDays).toBeDefined();
    expect(path.filingDeadlineDescription).toBeTruthy();

    // Legal authority should reference Fair Housing Act
    expect(path.primaryStatuteCitation).toBeTruthy();
    expect(path.primaryStatuteTitle).toBeTruthy();
  });

  it("should return action paths for section8_disputes pipeline", async () => {
    const { getActionPathsByPipeline } = await import("./db");
    const paths = await getActionPathsByPipeline("section8_disputes");

    expect(paths.length).toBeGreaterThan(0);
    const path = paths[0];
    expect(path.pipelineType).toBe("section8_disputes");

    // Section 8 should have escalation paths
    expect(path.escalationPaths).toBeTruthy();
    expect(Array.isArray(path.escalationPaths)).toBe(true);
  });

  it("should return multiple paths for getByPipelines with related types", async () => {
    const { getActionPathsByPipelines } = await import("./db");
    const paths = await getActionPathsByPipelines([
      "benefits_denial",
      "section8_disputes",
      "housing_discrimination",
    ]);

    expect(paths.length).toBeGreaterThanOrEqual(3);

    // Should have paths from different pipeline types
    const types = new Set(paths.map((p) => p.pipelineType));
    expect(types.size).toBeGreaterThanOrEqual(2);
  });

  it("should return empty array for unknown pipeline type", async () => {
    const { getActionPathsByPipeline } = await import("./db");
    const paths = await getActionPathsByPipeline("nonexistent_pipeline_xyz");

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBe(0);
  });

  it("should return empty array for empty pipeline types array", async () => {
    const { getActionPathsByPipelines } = await import("./db");
    const paths = await getActionPathsByPipelines([]);

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBe(0);
  });

  it("should return action path by ID", async () => {
    const { getActionPathsByPipeline, getActionPathById } = await import("./db");

    // First get a known path
    const paths = await getActionPathsByPipeline("housing_discrimination");
    expect(paths.length).toBeGreaterThan(0);

    const pathId = paths[0].id;
    const path = await getActionPathById(pathId);

    expect(path).toBeTruthy();
    expect(path!.id).toBe(pathId);
    expect(path!.pipelineType).toBe("housing_discrimination");
  });

  it("should return null for non-existent action path ID", async () => {
    const { getActionPathById } = await import("./db");
    const path = await getActionPathById(999999);
    expect(path).toBeUndefined();
  });

  it("should list all active action paths", async () => {
    const { listAllActionPaths } = await import("./db");
    const paths = await listAllActionPaths();

    expect(Array.isArray(paths)).toBe(true);
    expect(paths.length).toBeGreaterThanOrEqual(3);

    // All should be active
    paths.forEach((p) => {
      expect(p.isActive).toBe(true);
    });
  });

  it("should have complete escalation paths with required fields", async () => {
    const { getActionPathsByPipeline } = await import("./db");
    const paths = await getActionPathsByPipeline("housing_discrimination");
    const path = paths[0];

    expect(path.escalationPaths).toBeTruthy();
    if (path.escalationPaths && path.escalationPaths.length > 0) {
      const ep = path.escalationPaths[0];
      expect(ep.condition).toBeTruthy();
      expect(ep.action).toBeTruthy();
    }
  });

  it("should have documents needed list", async () => {
    const { getActionPathsByPipeline } = await import("./db");
    const paths = await getActionPathsByPipeline("housing_discrimination");
    const path = paths[0];

    expect(path.documentsNeeded).toBeTruthy();
    expect(Array.isArray(path.documentsNeeded)).toBe(true);
    expect(path.documentsNeeded!.length).toBeGreaterThan(0);
  });

  it("should have submission methods with required fields", async () => {
    const { getActionPathsByPipeline } = await import("./db");
    const paths = await getActionPathsByPipeline("housing_discrimination");
    const path = paths[0];

    expect(path.submissionMethods).toBeTruthy();
    expect(Array.isArray(path.submissionMethods)).toBe(true);
    if (path.submissionMethods && path.submissionMethods.length > 0) {
      const method = path.submissionMethods[0];
      expect(method.method).toBeTruthy();
      expect(method.details).toBeTruthy();
    }
  });
});
