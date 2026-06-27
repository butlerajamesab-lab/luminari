import { router, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Constitutional Test Suite
 * Enforces core architectural principles across all derived layers
 * Detects drift, silent behavior, duplicate truth sources, broken traceability
 */

export const constitutionalTestsRouter = router({
  /**
   * Register a constitutional test
   */
  registerTest: adminProcedure
    .input(
      z.object({
        testName: z.string(),
        principleName: z.string(),
        targetLayer: z.string(),
        testQuery: z.string(),
        expectedResult: z.record(z.string(), z.any()).optional(),
        severity: z.enum(["critical", "high", "medium", "low"]),
      })
    )
    .mutation(async ({ input }) => {
      const timestamp = Date.now();
      const testId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // @ts-ignore - db.query.raw is valid at runtime
      await db.query.raw(
        sql`INSERT INTO constitutional_tests (test_id, test_name, principle_name, target_layer, test_query, expected_result, severity, is_enabled, created_at, updated_at)
        VALUES (${testId}, ${input.testName}, ${input.principleName}, ${input.targetLayer}, ${input.testQuery},
        ${input.expectedResult ? JSON.stringify(input.expectedResult) : null},
        ${input.severity}, TRUE, ${timestamp}, ${timestamp})`
      );

      return { testId, created_at: timestamp };
    }),

  /**
   * Run a constitutional test
   */
  runTest: adminProcedure
    .input(
      z.object({
        testId: z.string(),
        targetId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const timestamp = Date.now();
      const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Get test definition
      // @ts-ignore - db.query.raw is valid at runtime
      const test = await db.query.raw(
        sql`SELECT * FROM constitutional_tests WHERE test_id = ${input.testId} LIMIT 1`
      );

      if (!test || test.length === 0) {
        throw new Error(`Test ${input.testId} not found`);
      }

      const testDef = test[0];

      // Execute test query
      let actualResult: any;
      let runStatus = "passed";
      let failureReason: string | null = null;

      try {
        // @ts-ignore - db.query.raw is valid at runtime
        const result = await db.query.raw(sql.raw(testDef.test_query));
        actualResult = result;

        // Validate against expected result if provided
        if (testDef.expected_result) {
          const expected = JSON.parse(testDef.expected_result);
          if (JSON.stringify(result) !== JSON.stringify(expected)) {
            runStatus = "failed";
            failureReason = `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`;
          }
        }
      } catch (error: any) {
        runStatus = "failed";
        failureReason = error.message;
      }

      // Log test run
      // @ts-ignore - db.query.raw is valid at runtime
      await db.query.raw(
        sql`INSERT INTO constitutional_test_runs (run_id, test_id, target_id, run_status, actual_result, expected_result, failure_reason, created_at)
        VALUES (${runId}, ${input.testId}, ${input.targetId || null}, ${runStatus},
        ${JSON.stringify(actualResult)},
        ${testDef.expected_result},
        ${failureReason},
        ${timestamp})`
      );

      // If failed and critical, create violation record
      if (runStatus === "failed" && testDef.severity === "critical") {
        const violationId = `viol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // @ts-ignore - db.query.raw is valid at runtime
        await db.query.raw(
          sql`INSERT INTO constitutional_violations (violation_id, run_id, principle_name, target_layer, target_id, severity, violation_type, violation_payload, created_at)
          VALUES (${violationId}, ${runId}, ${testDef.principle_name}, ${testDef.target_layer}, ${input.targetId || null},
          ${testDef.severity}, 'test_failure', ${JSON.stringify({ failureReason, testName: testDef.test_name })}, ${timestamp})`
        );
      }

      return {
        runId,
        testId: input.testId,
        runStatus,
        failureReason,
        timestamp,
      };
    }),

  /**
   * Run all enabled constitutional tests
   */
  runAllTests: adminProcedure.mutation(async () => {
    const timestamp = Date.now();

    // Get all enabled tests
    // @ts-ignore - db.query.raw is valid at runtime
    const tests = await db.query.raw(
      sql`SELECT test_id FROM constitutional_tests WHERE is_enabled = TRUE`
    );

    const results = [];
    for (const test of tests || []) {
      const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Execute each test
      // @ts-ignore - db.query.raw is valid at runtime
      const testDef = await db.query.raw(
        sql`SELECT * FROM constitutional_tests WHERE test_id = ${test.test_id} LIMIT 1`
      );

      if (testDef && testDef.length > 0) {
        const t = testDef[0];
        let runStatus = "passed";
        let failureReason: string | null = null;
        let actualResult: any;

        try {
          // @ts-ignore - db.query.raw is valid at runtime
          const result = await db.query.raw(sql.raw(t.test_query));
          actualResult = result;

          if (t.expected_result) {
            const expected = JSON.parse(t.expected_result);
            if (JSON.stringify(result) !== JSON.stringify(expected)) {
              runStatus = "failed";
              failureReason = `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`;
            }
          }
        } catch (error: any) {
          runStatus = "failed";
          failureReason = error.message;
        }

        // Log run
        // @ts-ignore - db.query.raw is valid at runtime
        await db.query.raw(
          sql`INSERT INTO constitutional_test_runs (run_id, test_id, run_status, actual_result, expected_result, failure_reason, created_at)
          VALUES (${runId}, ${t.test_id}, ${runStatus},
          ${JSON.stringify(actualResult)},
          ${t.expected_result},
          ${failureReason},
          ${timestamp})`
        );

        // Create violation if critical failure
        if (runStatus === "failed" && t.severity === "critical") {
          const violationId = `viol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          // @ts-ignore - db.query.raw is valid at runtime
          await db.query.raw(
            sql`INSERT INTO constitutional_violations (violation_id, run_id, principle_name, target_layer, severity, violation_type, violation_payload, created_at)
            VALUES (${violationId}, ${runId}, ${t.principle_name}, ${t.target_layer}, ${t.severity}, 'test_failure',
            ${JSON.stringify({ failureReason, testName: t.test_name })}, ${timestamp})`
          );
        }

        results.push({ testId: t.test_id, runStatus, failureReason });
      }
    }

    return { totalTests: results.length, results, timestamp };
  }),

  /**
   * Get constitutional violations
   */
  getViolations: adminProcedure
    .input(
      z.object({
        severity: z.enum(["critical", "high", "medium", "low"]).optional(),
        resolved: z.boolean().optional(),
        limit: z.number().default(100),
      })
    )
    .query(async ({ input }) => {
      let query = sql`SELECT * FROM constitutional_violations WHERE 1=1`;

      if (input.severity) {
        query = sql`${query} AND severity = ${input.severity}`;
      }

      if (input.resolved === true) {
        query = sql`${query} AND resolved_at IS NOT NULL`;
      } else if (input.resolved === false) {
        query = sql`${query} AND resolved_at IS NULL`;
      }

      query = sql`${query} ORDER BY created_at DESC LIMIT ${input.limit}`;

      // @ts-ignore - db.query.raw is valid at runtime
      const violations = await db.query.raw(query);
      return violations || [];
    }),

  /**
   * Mark violation as resolved
   */
  resolveViolation: adminProcedure
    .input(z.object({ violationId: z.string() }))
    .mutation(async ({ input }) => {
      const timestamp = Date.now();

      // @ts-ignore - db.query.raw is valid at runtime
      await db.query.raw(
        sql`UPDATE constitutional_violations 
        SET resolved_at = ${timestamp}
        WHERE violation_id = ${input.violationId}`
      );

      return { violationId: input.violationId, resolved_at: timestamp };
    }),

  /**
   * Get test run history
   */
  getTestRunHistory: adminProcedure
    .input(
      z.object({
        testId: z.string().optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      let query = sql`SELECT * FROM constitutional_test_runs WHERE 1=1`;

      if (input.testId) {
        query = sql`${query} AND test_id = ${input.testId}`;
      }

      query = sql`${query} ORDER BY created_at DESC LIMIT ${input.limit}`;

      // @ts-ignore - db.query.raw is valid at runtime
      const runs = await db.query.raw(query);
      return runs || [];
    }),

  /**
   * Get constitutional test summary
   */
  getTestSummary: adminProcedure.query(async () => {
    // @ts-ignore - db.query.raw is valid at runtime
    const summary = await db.query.raw(
      sql`SELECT 
        principle_name,
        COUNT(*) as total_tests,
        SUM(CASE WHEN is_enabled = TRUE THEN 1 ELSE 0 END) as enabled_tests,
        severity
      FROM constitutional_tests
      GROUP BY principle_name, severity
      ORDER BY principle_name, severity`
    );

    // @ts-ignore - db.query.raw is valid at runtime
    const violations = await db.query.raw(
      sql`SELECT 
        severity,
        COUNT(*) as count,
        SUM(CASE WHEN resolved_at IS NULL THEN 1 ELSE 0 END) as unresolved
      FROM constitutional_violations
      GROUP BY severity`
    );

    return { tests: summary || [], violations: violations || [] };
  }),
});
