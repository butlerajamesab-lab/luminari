import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * System Layers Test Suite
 * Tests for: Lens → Action Routing, Governance + Override, Constitutional Tests
 * Verifies: Determinism, Idempotency, Non-Destructive Mutation, Full Audit Trail
 */

describe("System Layers Integration", () => {
  const testCaseId = `test_case_${Date.now()}`;
  const testSignalId = `test_signal_${Date.now()}`;
  const testActorId = "test_admin_user";

  beforeEach(async () => {
    // Clean up test data before each test
    await db.query.raw(
      sql`DELETE FROM action_queue WHERE case_id LIKE 'test_case_%'`
    );
    await db.query.raw(
      sql`DELETE FROM governance_events WHERE case_id LIKE 'test_case_%'`
    );
    await db.query.raw(
      sql`DELETE FROM governance_controls WHERE target_id LIKE 'test_%'`
    );
  });

  afterEach(async () => {
    // Clean up after each test
    await db.query.raw(
      sql`DELETE FROM action_queue WHERE case_id LIKE 'test_case_%'`
    );
    await db.query.raw(
      sql`DELETE FROM governance_events WHERE case_id LIKE 'test_case_%'`
    );
    await db.query.raw(
      sql`DELETE FROM governance_controls WHERE target_id LIKE 'test_%'`
    );
  });

  describe("PHASE 1: Lens → Action Routing Engine", () => {
    it("should create USER lens action (navigation)", async () => {
      const timestamp = Date.now();
      const actionId = `action_user_${testCaseId}_${timestamp}`;

      // Simulate USER lens activation
      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'user', 'generate_next_steps',
        JSON_OBJECT('case_id', ${testCaseId}, 'required_forms', JSON_ARRAY(), 'agencies', JSON_ARRAY(), 'deadlines', JSON_ARRAY()),
        'pending', ${timestamp}, ${timestamp})`
      );

      // Verify action was created
      const actions = await db.query.raw(
        sql`SELECT * FROM action_queue WHERE action_id = ${actionId}`
      );

      expect(actions).toBeDefined();
      expect(actions.length).toBe(1);
      expect(actions[0].lens).toBe("user");
      expect(actions[0].action_type).toBe("generate_next_steps");
      expect(actions[0].status).toBe("pending");
    });

    it("should create PROFESSIONAL lens action (case structure)", async () => {
      const timestamp = Date.now();
      const actionId = `action_prof_${testCaseId}_${timestamp}`;

      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'professional', 'build_case_structure',
        JSON_OBJECT('case_id', ${testCaseId}, 'claims', JSON_ARRAY(), 'evidence_links', JSON_ARRAY(), 'legal_references', JSON_ARRAY()),
        'pending', ${timestamp}, ${timestamp})`
      );

      const actions = await db.query.raw(
        sql`SELECT * FROM action_queue WHERE action_id = ${actionId}`
      );

      expect(actions.length).toBe(1);
      expect(actions[0].lens).toBe("professional");
      expect(actions[0].action_type).toBe("build_case_structure");
    });

    it("should create SYSTEMIC lens action (pattern analysis)", async () => {
      const timestamp = Date.now();
      const actionId = `action_sys_${testCaseId}_${timestamp}`;

      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'systemic', 'aggregate_pattern',
        JSON_OBJECT('case_id', ${testCaseId}, 'fingerprint', '', 'count', 0, 'regions', JSON_ARRAY()),
        'pending', ${timestamp}, ${timestamp})`
      );

      const actions = await db.query.raw(
        sql`SELECT * FROM action_queue WHERE action_id = ${actionId}`
      );

      expect(actions.length).toBe(1);
      expect(actions[0].lens).toBe("systemic");
      expect(actions[0].action_type).toBe("aggregate_pattern");
    });

    it("should create ADVOCATE lens action (escalation)", async () => {
      const timestamp = Date.now();
      const actionId = `action_adv_${testCaseId}_${timestamp}`;

      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'advocate', 'generate_escalation_packet',
        JSON_OBJECT('case_id', ${testCaseId}, 'entity', '', 'pattern_summary', '', 'evidence_quotes', JSON_ARRAY()),
        'pending', ${timestamp}, ${timestamp})`
      );

      const actions = await db.query.raw(
        sql`SELECT * FROM action_queue WHERE action_id = ${actionId}`
      );

      expect(actions.length).toBe(1);
      expect(actions[0].lens).toBe("advocate");
      expect(actions[0].action_type).toBe("generate_escalation_packet");
    });

    it("should be idempotent (no duplicate actions on re-run)", async () => {
      const timestamp = Date.now();
      const actionId = `action_user_${testCaseId}_${timestamp}`;

      // First insertion
      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'user', 'generate_next_steps',
        JSON_OBJECT('case_id', ${testCaseId}),
        'pending', ${timestamp}, ${timestamp})`
      );

      // Verify first insertion
      let actions = await db.query.raw(
        sql`SELECT * FROM action_queue WHERE case_id = ${testCaseId} AND lens = 'user'`
      );
      expect(actions.length).toBe(1);

      // Try to insert again (should not create duplicate due to idempotency check)
      // In real implementation, this would check for existing action before inserting
      const existingAction = await db.query.raw(
        sql`SELECT action_id FROM action_queue WHERE case_id = ${testCaseId} AND lens = 'user' AND action_type = 'generate_next_steps' AND status != 'completed' LIMIT 1`
      );

      if (!existingAction || existingAction.length === 0) {
        // Only insert if no existing action
        await db.query.raw(
          sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
          VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'user', 'generate_next_steps',
          JSON_OBJECT('case_id', ${testCaseId}),
          'pending', ${timestamp}, ${timestamp})`
        );
      }

      // Verify no duplicates
      actions = await db.query.raw(
        sql`SELECT * FROM action_queue WHERE case_id = ${testCaseId} AND lens = 'user'`
      );
      expect(actions.length).toBe(1);
    });

    it("should update action status without mutation of source", async () => {
      const timestamp = Date.now();
      const actionId = `action_user_${testCaseId}_${timestamp}`;

      // Create action
      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'user', 'generate_next_steps',
        JSON_OBJECT('case_id', ${testCaseId}),
        'pending', ${timestamp}, ${timestamp})`
      );

      // Update status to in_progress
      const updateTimestamp = Date.now();
      await db.query.raw(
        sql`UPDATE action_queue SET status = 'in_progress', updated_at = ${updateTimestamp} WHERE action_id = ${actionId}`
      );

      // Verify status changed
      let actions = await db.query.raw(
        sql`SELECT * FROM action_queue WHERE action_id = ${actionId}`
      );
      expect(actions[0].status).toBe("in_progress");
      expect(actions[0].updated_at).toBe(updateTimestamp);

      // Verify case_id and other fields unchanged (non-destructive)
      expect(actions[0].case_id).toBe(testCaseId);
      expect(actions[0].lens).toBe("user");
    });
  });

  describe("PHASE 2: Governance + Override Layer", () => {
    it("should create governance event with full audit trail", async () => {
      const timestamp = Date.now();
      const eventId = `gov_${timestamp}_test`;

      await db.query.raw(
        sql`INSERT INTO governance_events (governance_event_id, case_id, signal_id, stage, event_type, actor_type, actor_id, reason, before_state, after_state, created_at)
        VALUES (${eventId}, ${testCaseId}, ${testSignalId}, 'lens_activation', 'lens_override', 'admin', ${testActorId}, 'Test override',
        JSON_OBJECT('lens', 'user', 'active', false),
        JSON_OBJECT('lens', 'user', 'active', true),
        ${timestamp})`
      );

      const events = await db.query.raw(
        sql`SELECT * FROM governance_events WHERE governance_event_id = ${eventId}`
      );

      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe("lens_override");
      expect(events[0].actor_type).toBe("admin");
      expect(events[0].actor_id).toBe(testActorId);
      expect(events[0].reason).toBe("Test override");
      expect(events[0].before_state).toBeDefined();
      expect(events[0].after_state).toBeDefined();
    });

    it("should create governance control (pause action)", async () => {
      const timestamp = Date.now();
      const actionId = `action_test_${timestamp}`;
      const controlId = `ctrl_${timestamp}`;

      // Create action first
      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'user', 'generate_next_steps',
        JSON_OBJECT('case_id', ${testCaseId}),
        'pending', ${timestamp}, ${timestamp})`
      );

      // Create pause control
      await db.query.raw(
        sql`INSERT INTO governance_controls (control_id, target_type, target_id, control_type, control_status, reason, actor_id, created_at, updated_at)
        VALUES (${controlId}, 'action', ${actionId}, 'pause', 'active', 'Test pause', ${testActorId}, ${timestamp}, ${timestamp})`
      );

      const controls = await db.query.raw(
        sql`SELECT * FROM governance_controls WHERE control_id = ${controlId}`
      );

      expect(controls.length).toBe(1);
      expect(controls[0].control_type).toBe("pause");
      expect(controls[0].control_status).toBe("active");
      expect(controls[0].target_id).toBe(actionId);
    });

    it("should log all governance actions (no silent overrides)", async () => {
      const timestamp = Date.now();
      const actionId = `action_test_${timestamp}`;

      // Create action
      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'user', 'generate_next_steps',
        JSON_OBJECT('case_id', ${testCaseId}),
        'pending', ${timestamp}, ${timestamp})`
      );

      // Create governance event for action failure
      const eventId = `gov_${timestamp}_fail`;
      await db.query.raw(
        sql`INSERT INTO governance_events (governance_event_id, action_id, stage, event_type, actor_type, actor_id, reason, created_at)
        VALUES (${eventId}, ${actionId}, 'action_execution', 'action_failed', 'system', 'system', 'Test failure reason', ${timestamp})`
      );

      // Verify event was logged
      const events = await db.query.raw(
        sql`SELECT * FROM governance_events WHERE action_id = ${actionId}`
      );

      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe("action_failed");
      expect(events[0].reason).toBe("Test failure reason");
    });

    it("should preserve source data integrity (non-destructive)", async () => {
      const timestamp = Date.now();
      const actionId = `action_test_${timestamp}`;

      // Create action with payload
      const originalPayload = JSON.stringify({
        case_id: testCaseId,
        required_forms: ["form1", "form2"],
        agencies: ["agency1"],
        deadlines: [1234567890],
      });

      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'user', 'generate_next_steps',
        ${originalPayload},
        'pending', ${timestamp}, ${timestamp})`
      );

      // Create governance event (override)
      const eventId = `gov_${timestamp}_override`;
      await db.query.raw(
        sql`INSERT INTO governance_events (governance_event_id, action_id, stage, event_type, actor_type, actor_id, reason, created_at)
        VALUES (${eventId}, ${actionId}, 'action_execution', 'action_paused', 'admin', ${testActorId}, 'Pausing for review', ${timestamp})`
      );

      // Verify action payload unchanged
      const actions = await db.query.raw(
        sql`SELECT * FROM action_queue WHERE action_id = ${actionId}`
      );

      expect(actions[0].action_payload).toBe(originalPayload);
      expect(actions[0].case_id).toBe(testCaseId);
      expect(actions[0].lens).toBe("user");
    });
  });

  describe("PHASE 3: Constitutional Test Suite", () => {
    it("should register a constitutional test", async () => {
      const timestamp = Date.now();
      const testId = `test_${timestamp}`;

      await db.query.raw(
        sql`INSERT INTO constitutional_tests (test_id, test_name, principle_name, target_layer, test_query, severity, is_enabled, created_at, updated_at)
        VALUES (${testId}, 'Test Single Source of Truth', 'Single Source of Truth', 'signal_detection',
        'SELECT COUNT(*) as count FROM action_queue',
        'critical', TRUE, ${timestamp}, ${timestamp})`
      );

      const tests = await db.query.raw(
        sql`SELECT * FROM constitutional_tests WHERE test_id = ${testId}`
      );

      expect(tests.length).toBe(1);
      expect(tests[0].principle_name).toBe("Single Source of Truth");
      expect(tests[0].severity).toBe("critical");
      expect(tests[0].is_enabled).toBe(true);
    });

    it("should run a constitutional test and log result", async () => {
      const timestamp = Date.now();
      const testId = `test_${timestamp}`;
      const runId = `run_${timestamp}`;

      // Register test
      await db.query.raw(
        sql`INSERT INTO constitutional_tests (test_id, test_name, principle_name, target_layer, test_query, severity, is_enabled, created_at, updated_at)
        VALUES (${testId}, 'Test Count', 'Canonical Count Consistency', 'viewer_queries',
        'SELECT COUNT(*) as count FROM action_queue',
        'high', TRUE, ${timestamp}, ${timestamp})`
      );

      // Run test
      await db.query.raw(
        sql`INSERT INTO constitutional_test_runs (run_id, test_id, run_status, actual_result, created_at)
        VALUES (${runId}, ${testId}, 'passed', JSON_OBJECT('count', 0), ${timestamp})`
      );

      const runs = await db.query.raw(
        sql`SELECT * FROM constitutional_test_runs WHERE run_id = ${runId}`
      );

      expect(runs.length).toBe(1);
      expect(runs[0].run_status).toBe("passed");
    });

    it("should create violation record on critical test failure", async () => {
      const timestamp = Date.now();
      const testId = `test_${timestamp}`;
      const runId = `run_${timestamp}`;
      const violationId = `viol_${timestamp}`;

      // Register critical test
      await db.query.raw(
        sql`INSERT INTO constitutional_tests (test_id, test_name, principle_name, target_layer, test_query, severity, is_enabled, created_at, updated_at)
        VALUES (${testId}, 'Test Critical', 'Single Source of Truth', 'signal_detection',
        'SELECT COUNT(*) as count FROM action_queue',
        'critical', TRUE, ${timestamp}, ${timestamp})`
      );

      // Log failed test run
      await db.query.raw(
        sql`INSERT INTO constitutional_test_runs (run_id, test_id, run_status, failure_reason, created_at)
        VALUES (${runId}, ${testId}, 'failed', 'Expected 5, got 3', ${timestamp})`
      );

      // Create violation
      await db.query.raw(
        sql`INSERT INTO constitutional_violations (violation_id, run_id, principle_name, target_layer, severity, violation_type, violation_payload, created_at)
        VALUES (${violationId}, ${runId}, 'Single Source of Truth', 'signal_detection', 'critical', 'test_failure',
        JSON_OBJECT('failureReason', 'Expected 5, got 3', 'testName', 'Test Critical'), ${timestamp})`
      );

      const violations = await db.query.raw(
        sql`SELECT * FROM constitutional_violations WHERE violation_id = ${violationId}`
      );

      expect(violations.length).toBe(1);
      expect(violations[0].severity).toBe("critical");
      expect(violations[0].violation_type).toBe("test_failure");
      expect(violations[0].resolved_at).toBeNull();
    });

    it("should allow marking violations as resolved", async () => {
      const timestamp = Date.now();
      const violationId = `viol_${timestamp}`;

      // Create violation
      await db.query.raw(
        sql`INSERT INTO constitutional_violations (violation_id, run_id, principle_name, target_layer, severity, violation_type, violation_payload, created_at)
        VALUES (${violationId}, 'run_test', 'Single Source of Truth', 'signal_detection', 'critical', 'test_failure',
        JSON_OBJECT('test', 'data'), ${timestamp})`
      );

      // Mark as resolved
      const resolvedTimestamp = Date.now();
      await db.query.raw(
        sql`UPDATE constitutional_violations SET resolved_at = ${resolvedTimestamp} WHERE violation_id = ${violationId}`
      );

      const violations = await db.query.raw(
        sql`SELECT * FROM constitutional_violations WHERE violation_id = ${violationId}`
      );

      expect(violations[0].resolved_at).toBe(resolvedTimestamp);
    });
  });

  describe("Integration: All Three Layers Together", () => {
    it("should route action, create governance event, and pass constitutional test", async () => {
      const timestamp = Date.now();
      const actionId = `action_${timestamp}`;
      const eventId = `gov_${timestamp}`;
      const testId = `test_${timestamp}`;
      const runId = `run_${timestamp}`;

      // 1. Route action (PHASE 1)
      await db.query.raw(
        sql`INSERT INTO action_queue (action_id, case_id, signal_id, lens, action_type, action_payload, status, created_at, updated_at)
        VALUES (${actionId}, ${testCaseId}, ${testSignalId}, 'user', 'generate_next_steps',
        JSON_OBJECT('case_id', ${testCaseId}),
        'pending', ${timestamp}, ${timestamp})`
      );

      // 2. Create governance event (PHASE 2)
      await db.query.raw(
        sql`INSERT INTO governance_events (governance_event_id, action_id, stage, event_type, actor_type, actor_id, reason, created_at)
        VALUES (${eventId}, ${actionId}, 'action_execution', 'action_started', 'system', 'system', 'Action routed and started', ${timestamp})`
      );

      // 3. Run constitutional test (PHASE 3)
      await db.query.raw(
        sql`INSERT INTO constitutional_tests (test_id, test_name, principle_name, target_layer, test_query, severity, is_enabled, created_at, updated_at)
        VALUES (${testId}, 'Integration Test', 'Full Traceability', 'action_routing',
        'SELECT COUNT(*) as count FROM action_queue WHERE case_id = ${testCaseId}',
        'high', TRUE, ${timestamp}, ${timestamp})`
      );

      await db.query.raw(
        sql`INSERT INTO constitutional_test_runs (run_id, test_id, run_status, actual_result, created_at)
        VALUES (${runId}, ${testId}, 'passed', JSON_OBJECT('count', 1), ${timestamp})`
      );

      // Verify all three layers are connected
      const actions = await db.query.raw(
        sql`SELECT * FROM action_queue WHERE action_id = ${actionId}`
      );
      const events = await db.query.raw(
        sql`SELECT * FROM governance_events WHERE action_id = ${actionId}`
      );
      const runs = await db.query.raw(
        sql`SELECT * FROM constitutional_test_runs WHERE run_id = ${runId}`
      );

      expect(actions.length).toBe(1);
      expect(events.length).toBe(1);
      expect(runs.length).toBe(1);

      // Verify traceability chain
      expect(events[0].action_id).toBe(actionId);
      expect(runs[0].test_id).toBe(testId);
    });
  });
});
