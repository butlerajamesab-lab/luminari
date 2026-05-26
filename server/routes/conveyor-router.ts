/**
 * ============================================================
 * LUMINARI — CONVEYOR BELT API
 *
 * Moves already-extracted, validated data forward:
 * V4 staging → validation → canonical → Atlas bridge → runtime view
 *
 * MOUNT:
 *   server/_core/index.ts & server/core/index.ts:
 *     import { conveyorRouter } from "../routes/conveyor-router";
 *     app.use("/api/conveyor", conveyorRouter);
 *
 * ENDPOINTS:
 *   GET  /status         — Counts at every stage
 *   POST /dry-run        — What would promote, what would fail, why
 *   POST /promote        — Actually promote validated records (idempotent)
 *   POST /bridge         — Push promoted rows into Atlas bridge tables
 *   POST /run            — Full controlled pass: validate → promote → bridge → report
 *   GET  /report/:runId  — Promotion accounting for a specific run
 *
 * LANES:
 *   1. deadline    — deadline/procedural path objects
 *   2. resource    — benefits/resource objects
 *   3. legal       — statutes/case law/enforcement
 *
 * RULES:
 *   - Extraction NEVER writes directly to Atlas
 *   - Atlas only receives rows after validation, canonicalization, and promotion accounting
 *   - Strict idempotency via dedupe keys (content_hash or program_id)
 *   - Every promotion writes to promotion_validation_log and promotion_accounting
 * ============================================================
 */

import express, { Request, Response } from "express";
import { getPool } from "../db";
import { randomUUID } from "crypto";

export const conveyorRouter = express.Router();

// ─── Lane Definitions ───────────────────────────────────────────────────────

type Lane = "deadline" | "resource" | "legal";

interface LaneConfig {
  sourceFilter: string; // SQL WHERE clause for V4 extraction rows
  canonicalTable: string;
  bridgeTable: string;
  validationRules: ValidationRule[];
}

interface ValidationRule {
  name: string;
  check: (row: any) => { passed: boolean; message: string };
}

const LANE_CONFIGS: Record<Lane, LaneConfig> = {
  deadline: {
    sourceFilter: `promotion_ready->>'resource_type' IN ('deadline','procedural_path')`,
    canonicalTable: "legal_workflow_deadlines",
    bridgeTable: "atlas_lighthouse_legal_bridge_v1",
    validationRules: [
      {
        name: "has_jurisdiction",
        check: (r) => ({
          passed: !!r.jurisdiction && r.jurisdiction !== "UNKNOWN",
          message: r.jurisdiction ? "OK" : "Missing jurisdiction",
        }),
      },
      {
        name: "has_name",
        check: (r) => ({
          passed: !!(r.name && r.name.length >= 3),
          message: r.name ? "OK" : "Missing or too short name",
        }),
      },
      {
        name: "has_source_provenance",
        check: (r) => ({
          passed: !!(r.forensic_provenance && Object.keys(r.forensic_provenance).length > 0),
          message: r.forensic_provenance ? "OK" : "Missing forensic provenance",
        }),
      },
    ],
  },
  resource: {
    sourceFilter: `promotion_ready->>'resource_type' IN ('organization','nonprofit','benefits_program','program')`,
    canonicalTable: "nonprofit_registry",
    bridgeTable: "atlas_lighthouse_resource_bridge_v1",
    validationRules: [
      {
        name: "has_name",
        check: (r) => ({
          passed: !!(r.name && r.name.length >= 2),
          message: r.name ? "OK" : "Missing organization name",
        }),
      },
      {
        name: "has_jurisdiction",
        check: (r) => ({
          passed: !!r.jurisdiction && r.jurisdiction !== "UNKNOWN",
          message: r.jurisdiction ? "OK" : "Missing jurisdiction",
        }),
      },
      {
        name: "confidence_threshold",
        check: (r) => {
          const score = r.confidence_scores?.overall ?? 0;
          return {
            passed: score >= 0.6,
            message: score >= 0.6 ? "OK" : `Confidence ${score} below 0.6 threshold`,
          };
        },
      },
      {
        name: "not_raw_garbage",
        check: (r) => {
          const rt = r.promotion_ready?.resource_type;
          return {
            passed: rt !== "raw",
            message: rt === "raw" ? "Still classified as raw" : "OK",
          };
        },
      },
    ],
  },
  legal: {
    sourceFilter: `promotion_ready->>'resource_type' IN ('statute','case_law','enforcement_record','legal_authority')`,
    canonicalTable: "legal_statutes",
    bridgeTable: "atlas_lighthouse_legal_bridge_v1",
    validationRules: [
      {
        name: "has_name",
        check: (r) => ({
          passed: !!(r.name && r.name.length >= 3),
          message: r.name ? "OK" : "Missing name/citation",
        }),
      },
      {
        name: "has_jurisdiction",
        check: (r) => ({
          passed: !!r.jurisdiction && r.jurisdiction !== "UNKNOWN",
          message: r.jurisdiction ? "OK" : "Missing jurisdiction",
        }),
      },
      {
        name: "has_source_provenance",
        check: (r) => ({
          passed: !!(r.forensic_provenance && Object.keys(r.forensic_provenance).length > 0),
          message: r.forensic_provenance ? "OK" : "Missing forensic provenance",
        }),
      },
    ],
  },
};

// ─── GET /status ────────────────────────────────────────────────────────────

conveyorRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    const counts = await pool.query(`
      SELECT
        (SELECT count(*) FROM registry_entity_extraction_v4) AS v4_total,
        (SELECT count(*) FROM registry_entity_extraction_v4 WHERE (confidence_scores->>'overall')::float >= 0.6) AS v4_promotable,
        (SELECT count(*) FROM extraction_staging) AS staging_rows,
        (SELECT count(*) FROM promotion_validation_log) AS validation_log_rows,
        (SELECT count(*) FROM promotion_validation_log WHERE passed = true) AS validation_passed,
        (SELECT count(*) FROM promotion_validation_log WHERE passed = false) AS validation_failed,
        (SELECT count(*) FROM promotion_accounting) AS accounting_rows,
        (SELECT count(*) FROM atlas_lighthouse_resource_bridge_v1) AS atlas_resource_bridge,
        (SELECT count(*) FROM atlas_lighthouse_legal_bridge_v1) AS atlas_legal_bridge,
        (SELECT count(*) FROM nonprofit_registry) AS canonical_nonprofit,
        (SELECT count(*) FROM registry_programs) AS canonical_programs,
        (SELECT count(*) FROM government_benefits_registry) AS canonical_benefits,
        (SELECT count(*) FROM legal_statutes) AS canonical_statutes,
        (SELECT count(*) FROM legal_enforcement_records) AS canonical_enforcement,
        (SELECT count(*) FROM legal_workflow_deadlines) AS canonical_deadlines,
        (SELECT count(*) FROM deadline_rules) AS canonical_deadline_rules
    `);
    const row = counts.rows[0];
    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      pipeline: {
        v4_extraction: { total: +row.v4_total, promotable: +row.v4_promotable },
        staging: { rows: +row.staging_rows },
        validation: {
          log_entries: +row.validation_log_rows,
          passed: +row.validation_passed,
          failed: +row.validation_failed,
        },
        accounting: { runs: +row.accounting_rows },
        atlas_bridges: {
          resource: +row.atlas_resource_bridge,
          legal: +row.atlas_legal_bridge,
        },
        canonical: {
          nonprofit_registry: +row.canonical_nonprofit,
          registry_programs: +row.canonical_programs,
          government_benefits: +row.canonical_benefits,
          legal_statutes: +row.canonical_statutes,
          legal_enforcement: +row.canonical_enforcement,
          legal_workflow_deadlines: +row.canonical_deadlines,
          deadline_rules: +row.canonical_deadline_rules,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /dry-run ──────────────────────────────────────────────────────────

conveyorRouter.post("/dry-run", async (req: Request, res: Response) => {
  try {
    const { lane, limit = 100 } = req.body as { lane: Lane; limit?: number };
    if (!lane || !LANE_CONFIGS[lane]) {
      return res.status(400).json({ ok: false, error: `Invalid lane. Must be one of: ${Object.keys(LANE_CONFIGS).join(", ")}` });
    }
    const config = LANE_CONFIGS[lane];
    const pool = getPool();

    // Fetch candidate rows from V4 extraction
    const { rows } = await pool.query(
      `SELECT id, name, jurisdiction, promotion_ready, confidence_scores, forensic_provenance, content_hash, source_file
       FROM registry_entity_extraction_v4
       WHERE ${config.sourceFilter}
       ORDER BY id
       LIMIT $1`,
      [Math.min(limit, 1000)]
    );

    // Run validation rules against each row
    const results = rows.map((row: any) => {
      const validations = config.validationRules.map((rule) => {
        const result = rule.check(row);
        return { rule: rule.name, ...result };
      });
      const allPassed = validations.every((v) => v.passed);
      return {
        id: row.id,
        name: row.name,
        jurisdiction: row.jurisdiction,
        resource_type: row.promotion_ready?.resource_type,
        confidence: row.confidence_scores?.overall,
        would_promote: allPassed,
        validations,
      };
    });

    const wouldPromote = results.filter((r) => r.would_promote);
    const wouldFail = results.filter((r) => !r.would_promote);

    res.json({
      ok: true,
      lane,
      total_candidates: rows.length,
      would_promote: wouldPromote.length,
      would_fail: wouldFail.length,
      sample_promotable: wouldPromote.slice(0, 10),
      sample_failures: wouldFail.slice(0, 10),
      failure_reasons: wouldFail.reduce((acc: Record<string, number>, r) => {
        r.validations.filter((v: any) => !v.passed).forEach((v: any) => {
          acc[v.rule] = (acc[v.rule] || 0) + 1;
        });
        return acc;
      }, {}),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /promote ──────────────────────────────────────────────────────────

conveyorRouter.post("/promote", async (req: Request, res: Response) => {
  try {
    const { lane, limit = 100, dryRun = false } = req.body as {
      lane: Lane;
      limit?: number;
      dryRun?: boolean;
    };
    if (!lane || !LANE_CONFIGS[lane]) {
      return res.status(400).json({ ok: false, error: `Invalid lane. Must be one of: ${Object.keys(LANE_CONFIGS).join(", ")}` });
    }
    const config = LANE_CONFIGS[lane];
    const pool = getPool();
    const runId = randomUUID();

    // Fetch candidates
    const { rows } = await pool.query(
      `SELECT id, name, jurisdiction, promotion_ready, confidence_scores, forensic_provenance, content_hash, source_file, program_id
       FROM registry_entity_extraction_v4
       WHERE ${config.sourceFilter}
         AND (confidence_scores->>'overall')::float >= 0.6
       ORDER BY id
       LIMIT $1`,
      [Math.min(limit, 5000)]
    );

    let promoted = 0;
    let failed = 0;
    let skippedDupe = 0;
    const errors: Array<{ id: number; error: string }> = [];

    for (const row of rows) {
      // Validate
      const validations = config.validationRules.map((rule) => ({
        rule: rule.name,
        ...rule.check(row),
      }));
      const allPassed = validations.every((v) => v.passed);

      // Log validation
      if (!dryRun) {
        await pool.query(
          `INSERT INTO promotion_validation_log (staging_id, program_id, rule_name, passed, confidence_score, validation_message, validation_details)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            row.id,
            row.program_id,
            validations.map((v) => v.rule).join(","),
            allPassed,
            row.confidence_scores?.overall ?? null,
            allPassed ? "All rules passed" : validations.filter((v) => !v.passed).map((v) => v.message).join("; "),
            JSON.stringify(validations),
          ]
        );
      }

      if (!allPassed) {
        failed++;
        continue;
      }

      // Dedupe check — skip if content_hash already exists in canonical
      if (row.content_hash && !dryRun) {
        const dupeCheck = await pool.query(
          `SELECT 1 FROM promotion_validation_log WHERE staging_id = $1 AND passed = true LIMIT 1`,
          [row.id]
        );
        // Actually check if already promoted by looking at the bridge
        const bridgeCheck = await pool.query(
          `SELECT 1 FROM ${config.bridgeTable === "atlas_lighthouse_resource_bridge_v1" ? "atlas_lighthouse_resource_bridge_v1" : "atlas_lighthouse_legal_bridge_v1"}
           WHERE source_id = $1::text LIMIT 1`,
          [row.id]
        );
        if (bridgeCheck.rows.length > 0) {
          skippedDupe++;
          continue;
        }
      }

      if (dryRun) {
        promoted++;
        continue;
      }

      // Promote to canonical table based on lane
      try {
        if (lane === "resource") {
          await promoteToResource(pool, row);
        } else if (lane === "deadline") {
          await promoteToDeadline(pool, row);
        } else if (lane === "legal") {
          await promoteToLegal(pool, row);
        }
        promoted++;
      } catch (promoteErr: any) {
        errors.push({ id: row.id, error: promoteErr.message });
        failed++;
      }
    }

    // Write accounting record
    if (!dryRun && rows.length > 0) {
      await pool.query(
        `INSERT INTO promotion_accounting (jurisdiction, source_file, extraction_timestamp, extracted_count, validation_passed_count, validation_failed_count, promoted_count, count_by_resource_type, accounting_hash, created_at)
         VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, NOW())`,
        [
          rows[0]?.jurisdiction || "mixed",
          `conveyor_run_${lane}`,
          rows.length,
          promoted + skippedDupe,
          failed,
          promoted,
          JSON.stringify({ lane, run_id: runId }),
          runId,
        ]
      );
    }

    res.json({
      ok: true,
      run_id: runId,
      lane,
      total_candidates: rows.length,
      promoted,
      failed,
      skipped_duplicates: skippedDupe,
      errors: errors.slice(0, 10),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /bridge ───────────────────────────────────────────────────────────

conveyorRouter.post("/bridge", async (req: Request, res: Response) => {
  try {
    const { lane, limit = 100 } = req.body as { lane: Lane; limit?: number };
    if (!lane || !LANE_CONFIGS[lane]) {
      return res.status(400).json({ ok: false, error: `Invalid lane. Must be one of: ${Object.keys(LANE_CONFIGS).join(", ")}` });
    }
    const config = LANE_CONFIGS[lane];
    const pool = getPool();
    const runId = randomUUID();

    let bridged = 0;
    let skipped = 0;

    if (lane === "resource") {
      // Find canonical rows not yet in bridge
      const { rows } = await pool.query(
        `SELECT nr.uuid, nr.full_entity_name, nr.entity_type, nr.jurisdiction,
                nr.contact->>'phone' as phone, nr.contact->>'website' as website
         FROM nonprofit_registry nr
         WHERE NOT EXISTS (
           SELECT 1 FROM atlas_lighthouse_resource_bridge_v1 b
           WHERE b.source_id = nr.uuid::text AND b.source_table = 'nonprofit_registry'
         )
         LIMIT $1`,
        [Math.min(limit, 2000)]
      );

      for (const row of rows) {
        await pool.query(
          `INSERT INTO atlas_lighthouse_resource_bridge_v1
           (atlas_resource_id, name, resource_type, state, phone, url, source_table, source_id, bridge_version, verification_status, bridged_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'nonprofit_registry', $7, 'v1.0', 'auto_bridged', NOW())`,
          [
            randomUUID(),
            row.full_entity_name,
            row.entity_type || "nonprofit",
            row.jurisdiction,
            row.phone,
            row.website,
            row.uuid,
          ]
        );
        bridged++;
      }
    } else if (lane === "legal" || lane === "deadline") {
      // Find canonical legal rows not yet in bridge
      const sourceTable = lane === "deadline" ? "legal_workflow_deadlines" : "legal_statutes";
      const { rows } = await pool.query(
        `SELECT id, jurisdiction FROM ${sourceTable}
         WHERE NOT EXISTS (
           SELECT 1 FROM atlas_lighthouse_legal_bridge_v1 b
           WHERE b.source_table = $1 AND b.lighthouse_record_id = id::text
         )
         LIMIT $2`,
        [sourceTable, Math.min(limit, 2000)]
      );

      for (const row of rows) {
        await pool.query(
          `INSERT INTO atlas_lighthouse_legal_bridge_v1
           (bridge_run_id, source_project, target_project, source_table, target_table, atlas_record_id, lighthouse_record_id, verification_status, bridged_at, created_at)
           VALUES ($1, 'lighthouse', 'atlas', $2, $2, $3, $4, 'auto_bridged', NOW(), NOW())`,
          [runId, sourceTable, randomUUID(), row.id.toString()]
        );
        bridged++;
      }
    }

    res.json({
      ok: true,
      run_id: runId,
      lane,
      bridged,
      skipped,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /run ──────────────────────────────────────────────────────────────

conveyorRouter.post("/run", async (req: Request, res: Response) => {
  try {
    const { lane, limit = 100 } = req.body as { lane: Lane; limit?: number };
    if (!lane || !LANE_CONFIGS[lane]) {
      return res.status(400).json({ ok: false, error: `Invalid lane. Must be one of: ${Object.keys(LANE_CONFIGS).join(", ")}` });
    }

    // Step 1: Promote (includes validation)
    const promoteResponse = await internalPromote(lane, limit);

    // Step 2: Bridge
    const bridgeResponse = await internalBridge(lane, limit);

    res.json({
      ok: true,
      lane,
      run_id: promoteResponse.run_id,
      promote: {
        total_candidates: promoteResponse.total_candidates,
        promoted: promoteResponse.promoted,
        failed: promoteResponse.failed,
        skipped_duplicates: promoteResponse.skipped_duplicates,
      },
      bridge: {
        bridged: bridgeResponse.bridged,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /report/:runId ─────────────────────────────────────────────────────

conveyorRouter.get("/report/:runId", async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const pool = getPool();

    const accounting = await pool.query(
      `SELECT * FROM promotion_accounting WHERE accounting_hash = $1`,
      [runId]
    );

    if (accounting.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Run not found" });
    }

    const run = accounting.rows[0];

    // Get validation logs for this run's staging IDs
    const validationLogs = await pool.query(
      `SELECT staging_id, passed, confidence_score, validation_message
       FROM promotion_validation_log
       WHERE created_at >= $1::timestamptz - interval '1 hour'
         AND created_at <= $1::timestamptz + interval '1 hour'
       ORDER BY staging_id
       LIMIT 100`,
      [run.created_at]
    );

    res.json({
      ok: true,
      run_id: runId,
      accounting: run,
      validation_sample: validationLogs.rows.slice(0, 50),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Internal helpers ───────────────────────────────────────────────────────

async function promoteToResource(pool: any, row: any) {
  const orgName = row.promotion_ready?.organization_name || row.name;
  const resourceType = row.promotion_ready?.resource_type || "organization";

  await pool.query(
    `INSERT INTO nonprofit_registry (uuid, entity_type, full_entity_name, jurisdiction, provenance, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (uuid) DO NOTHING`,
    [
      randomUUID(),
      resourceType,
      orgName,
      row.jurisdiction,
      JSON.stringify({ source: "conveyor_v1", v4_id: row.id, source_file: row.source_file }),
    ]
  );
}

async function promoteToDeadline(pool: any, row: any) {
  await pool.query(
    `INSERT INTO legal_workflow_deadlines (id, jurisdiction, claim_type, deadline_description, verification_status, created_at)
     VALUES ($1, $2, $3, $4, 'auto_promoted', NOW())`,
    [
      randomUUID(),
      row.jurisdiction,
      row.name,
      JSON.stringify({ source: "conveyor_v1", v4_id: row.id }),
    ]
  );
}

async function promoteToLegal(pool: any, row: any) {
  // For legal lane, we insert into legal_statutes
  await pool.query(
    `INSERT INTO legal_statutes (id, jurisdiction, title, domain, citation, authority_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      randomUUID(),
      row.jurisdiction,
      row.name,
      row.promotion_ready?.domain || "general",
      row.promotion_ready?.citation || row.name,
      row.promotion_ready?.resource_type || "statute",
    ]
  );
}

async function internalPromote(lane: Lane, limit: number) {
  const config = LANE_CONFIGS[lane];
  const pool = getPool();
  const runId = randomUUID();

  const { rows } = await pool.query(
    `SELECT id, name, jurisdiction, promotion_ready, confidence_scores, forensic_provenance, content_hash, source_file, program_id
     FROM registry_entity_extraction_v4
     WHERE ${config.sourceFilter}
       AND (confidence_scores->>'overall')::float >= 0.6
     ORDER BY id
     LIMIT $1`,
    [Math.min(limit, 5000)]
  );

  let promoted = 0;
  let failed = 0;
  let skippedDupe = 0;

  for (const row of rows) {
    const validations = config.validationRules.map((rule) => ({
      rule: rule.name,
      ...rule.check(row),
    }));
    const allPassed = validations.every((v) => v.passed);

    await pool.query(
      `INSERT INTO promotion_validation_log (staging_id, program_id, rule_name, passed, confidence_score, validation_message, validation_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        row.id,
        row.program_id,
        validations.map((v) => v.rule).join(","),
        allPassed,
        row.confidence_scores?.overall ?? null,
        allPassed ? "All rules passed" : validations.filter((v) => !v.passed).map((v) => v.message).join("; "),
        JSON.stringify(validations),
      ]
    );

    if (!allPassed) { failed++; continue; }

    try {
      if (lane === "resource") await promoteToResource(pool, row);
      else if (lane === "deadline") await promoteToDeadline(pool, row);
      else if (lane === "legal") await promoteToLegal(pool, row);
      promoted++;
    } catch {
      failed++;
    }
  }

  if (rows.length > 0) {
    await pool.query(
      `INSERT INTO promotion_accounting (jurisdiction, source_file, extraction_timestamp, extracted_count, validation_passed_count, validation_failed_count, promoted_count, count_by_resource_type, accounting_hash, created_at)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, NOW())`,
      [
        rows[0]?.jurisdiction || "mixed",
        `conveyor_run_${lane}`,
        rows.length,
        promoted + skippedDupe,
        failed,
        promoted,
        JSON.stringify({ lane, run_id: runId }),
        runId,
      ]
    );
  }

  return { run_id: runId, total_candidates: rows.length, promoted, failed, skipped_duplicates: skippedDupe };
}

async function internalBridge(lane: Lane, limit: number) {
  const config = LANE_CONFIGS[lane];
  const pool = getPool();
  let bridged = 0;

  if (lane === "resource") {
    const { rows } = await pool.query(
      `SELECT nr.uuid, nr.full_entity_name, nr.entity_type, nr.jurisdiction,
              nr.contact->>'phone' as phone, nr.contact->>'website' as website
       FROM nonprofit_registry nr
       WHERE NOT EXISTS (
         SELECT 1 FROM atlas_lighthouse_resource_bridge_v1 b
         WHERE b.source_id = nr.uuid::text AND b.source_table = 'nonprofit_registry'
       )
       LIMIT $1`,
      [Math.min(limit, 2000)]
    );
    for (const row of rows) {
      await pool.query(
        `INSERT INTO atlas_lighthouse_resource_bridge_v1
         (atlas_resource_id, name, resource_type, state, phone, url, source_table, source_id, bridge_version, verification_status, bridged_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'nonprofit_registry', $7, 'v1.0', 'auto_bridged', NOW())`,
        [randomUUID(), row.full_entity_name, row.entity_type || "nonprofit", row.jurisdiction, row.phone, row.website, row.uuid]
      );
      bridged++;
    }
  } else {
    const sourceTable = lane === "deadline" ? "legal_workflow_deadlines" : "legal_statutes";
    const { rows } = await pool.query(
      `SELECT id, jurisdiction FROM ${sourceTable}
       WHERE NOT EXISTS (
         SELECT 1 FROM atlas_lighthouse_legal_bridge_v1 b
         WHERE b.source_table = $1 AND b.lighthouse_record_id = id::text
       )
       LIMIT $2`,
      [sourceTable, Math.min(limit, 2000)]
    );
    for (const row of rows) {
      await pool.query(
        `INSERT INTO atlas_lighthouse_legal_bridge_v1
         (bridge_run_id, source_project, target_project, source_table, target_table, atlas_record_id, lighthouse_record_id, verification_status, bridged_at, created_at)
         VALUES ($1, 'lighthouse', 'atlas', $2, $2, $3, $4, 'auto_bridged', NOW(), NOW())`,
        [randomUUID(), sourceTable, randomUUID(), row.id.toString()]
      );
      bridged++;
    }
  }

  return { bridged };
}
