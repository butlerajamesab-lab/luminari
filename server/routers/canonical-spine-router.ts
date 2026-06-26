/**
 * Canonical Spine Router — Implementation Package tRPC Endpoints
 *
 * Provides:
 * - canonicalSpine.status → Canonical spine health check
 * - canonicalSpine.ingest → Ingest a record with canonical columns
 * - canonicalSpine.detect → Create a detected_signal with canonical columns
 * - canonicalSpine.flowLog → Append a signal flow log (read-only table)
 * - canonicalSpine.flowLogs → Query signal flow logs
 * - canonicalSpine.worldNodes.list/get/create/update → World node CRUD with L10 validation
 * - canonicalSpine.remedyPaths.create/bySignal → Remedy path management with integrity check
 * - canonicalSpine.enforce → Run all canonical enforcement rules for a signal
 * - canonicalSpine.auditDeadEnds → Batch audit for dead-end signals
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { pool } from "../db";

import {
  enforceSignalFlowReadOnly,
  appendSignalFlowLog,
  enforceNoDeadEnds,
  auditDeadEnds,
  validateWorldNodeMetadata,
  validateWorldNodeForRemedy,
  validateRemedyPathIntegrity,
  computeDeterministicHash,
  verifyDeterminism,
  enforceAllCanonicalRules,
} from "../canonical-enforcement";

// ─── Schemas ───

const metadataL10Schema = z.object({
  access_protocol: z.string().min(1),
  capacity_status: z.enum(["AVAILABLE", "LIMITED", "FULL"]),
  resource_links: z.array(z.string()),
  valid_for: z.array(z.string()).min(1),
});

const worldNodeCreateSchema = z.object({
  biomeType: z.string().min(1),
  nodeName: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  metadataL10: metadataL10Schema,
  activeRemedy: z.boolean().default(false),
});

const worldNodeUpdateSchema = z.object({
  id: z.number(),
  biomeType: z.string().min(1).optional(),
  nodeName: z.string().min(1).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  metadataL10: metadataL10Schema.optional(),
  activeRemedy: z.boolean().optional(),
});

const remedyPathCreateSchema = z.object({
  signalId: z.string().min(1),
  caseId: z.number(),
  userId: z.number(),
  title: z.string().min(1),
  description: z.string().optional(),
  pathType: z.string().min(1),
  routeDirection: z.enum(["UPWARD", "LATERAL"]).optional(),
  targetNodeId: z.number().optional(),
  blockReason: z.string().optional(),
});

// ─── Router ───

export const canonicalSpineRouter = router({
  // ─── Status / Health ───
  status: publicProcedure.query(async () => {
    const { rows: irRows } = await pool.query(`SELECT COUNT(*) as cnt FROM ingested_records`);
    const { rows: dsRows } = await pool.query(`SELECT COUNT(*) as cnt FROM detected_signals`);
    const { rows: sflRows } = await pool.query(`SELECT COUNT(*) as cnt FROM signal_flow_logs`);
    const { rows: wnRows } = await pool.query(`SELECT COUNT(*) as cnt FROM world_nodes`);
    const { rows: rpRows } = await pool.query(`SELECT COUNT(*) as cnt FROM remedy_paths WHERE signal_id_rp IS NOT NULL`);

    return {
      ingested_records: (irRows as any[])[0]?.cnt ?? 0,
      detected_signals: (dsRows as any[])[0]?.cnt ?? 0,
      signal_flow_logs: (sflRows as any[])[0]?.cnt ?? 0,
      world_nodes: (wnRows as any[])[0]?.cnt ?? 0,
      canonical_remedy_paths: (rpRows as any[])[0]?.cnt ?? 0,
      timestamp: Date.now(),
    };
  }),

  // ─── Ingest ───
  ingest: protectedProcedure
    .input(z.object({
      datasetId: z.string(),
      sourceRecordId: z.string(),
    // @ts-ignore
      rawJson: z.record(z.string(), z.unknown()),
      streamId: z.string().optional(),
    // @ts-ignore
      metadataL1L2: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const sourceHash = computeDeterministicHash({
        datasetId: input.datasetId,
        sourceRecordId: input.sourceRecordId,
      });
      const now = Date.now();
      const metaStr = input.metadataL1L2 ? JSON.stringify(input.metadataL1L2) : null;
      const rawStr = JSON.stringify(input.rawJson);

      const { rows: result } = await pool.query(
        `INSERT INTO ingested_records (datasetId_ir, sourceRecordId, rawJson, source_hash, stream_id_ir, metadata_l1_l2, ingestedAt, updatedAt_ir, processed_for_signals)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
         ON DUPLICATE KEY UPDATE updatedAt_ir = VALUES(updatedAt_ir), rawJson = VALUES(rawJson), stream_id_ir = COALESCE(VALUES(stream_id_ir), stream_id_ir), metadata_l1_l2 = COALESCE(VALUES(metadata_l1_l2), metadata_l1_l2)`,
        [input.datasetId, input.sourceRecordId, rawStr, sourceHash, input.streamId ?? null, metaStr, now, now]
      );

      return { id: (result as any).insertId, sourceHash };
    }),

  // ─── Detect ───
  detect: protectedProcedure
    .input(z.object({
      signalId: z.string(),
      signalType: z.string(),
      datasetId: z.string(),
      severityLevel: z.string(),
      parentRecordId: z.number().optional(),
      sunamStatus: z.string().optional(),
    // @ts-ignore
      forensicLogic: z.record(z.string(), z.unknown()).optional(),
      plainLanguageExplanation: z.string(),
      confidenceScore: z.number(),
    }))
    .mutation(async ({ input }) => {
      const now = Date.now();

      // TODO: Implement signal insertion per live stream spec
      // For now, just append flow log

      // Auto-append flow log
      await appendSignalFlowLog({
        signalId: input.signalId,
        vectorPath: `ingested_records → live_signals → sunam_gate → detected_signals`,
        flowDensity: input.confidenceScore / 100,
        visibilityMetadata: {
          sourceTable: "detected_signals",
          sourceId: input.signalId,
          gateDecision: input.sunamStatus ?? "pending",
          timestamp: now,
        },
      });

      return { signal_id: input.signalId, flow_logged: true };
    }),

  // ─── Flow Logs ───
  flowLog: protectedProcedure
    .input(z.object({
      signalId: z.string(),
      vectorPath: z.string(),
      flowDensity: z.number(),
      visibilityMetadata: z.object({
        sourceTable: z.string(),
        sourceId: z.string(),
        gateDecision: z.string().optional(),
        engineId: z.string().optional(),
        runId: z.string().optional(),
        timestamp: z.number(),
      }),
    }))
    .mutation(async ({ input }) => {
      return appendSignalFlowLog(input);
    }),

  flowLogs: publicProcedure
    .input(z.object({
      signalId: z.string().optional(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      const safeLimit = Math.min(Math.max(1, input.limit), 1000);
      if (input.signalId) {
        const { rows: rows } = await pool.query(
          `SELECT * FROM signal_flow_logs WHERE signal_id_sfl = $1 ORDER BY processed_at DESC LIMIT ${safeLimit}`,
          [input.signalId]
        );
        return rows as any[];
      }
      const { rows: rows } = await pool.query(
        `SELECT * FROM signal_flow_logs ORDER BY processed_at DESC LIMIT ${safeLimit}`
      );
      return rows as any[];
    }),

  // ─── World Nodes ───
  worldNodes: router({
    list: publicProcedure
      .input(z.object({
        biomeType: z.string().optional(),
        activeOnly: z.boolean().default(false),
        limit: z.number().default(100),
      }))
      .query(async ({ input }) => {
        let query = `SELECT * FROM world_nodes WHERE 1=1`;
        const params: any[] = [];
        if (input.biomeType) {
          query += ` AND biome_type = ?`;
          params.push(input.biomeType);
        }
        if (input.activeOnly) {
          query += ` AND active_remedy = true`;
        }
        const safeLimit2 = Math.min(Math.max(1, input.limit), 1000);
        query += ` ORDER BY updated_at_wn DESC LIMIT ${safeLimit2}`;
        const { rows: rows } = await pool.query(query, params);
        return (rows as any[]).map(r => ({
          ...r,
          metadataL10: typeof r.metadata_l10 === 'string' ? JSON.parse(r.metadata_l10) : r.metadata_l10,
        }));
      }),

    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const { rows: rows } = await pool.query(
          `SELECT * FROM world_nodes WHERE id = $1 LIMIT 1`,
          [input.id]
        );
        const node = (rows as any[])[0];
        if (!node) return null;
        return {
          ...node,
          metadata_l10: typeof node.metadata_l10 === 'string' ? JSON.parse(node.metadata_l10) : node.metadata_l10,
        };
      }),

    create: protectedProcedure
      .input(worldNodeCreateSchema)
      .mutation(async ({ input }) => {
        // Enforce Rule 8: validate metadata
        const metaCheck = validateWorldNodeMetadata(input.metadataL10);
        if (!metaCheck.passed) {
          throw new Error(`WORLD_NODE_VALIDATION: ${metaCheck.message}`);
        }

        const now = Date.now();
        const { rows: result } = await pool.query(
          `INSERT INTO world_nodes (biome_type, node_name_wn, latitude, longitude, metadata_l10, active_remedy, last_verified_at_wn, created_at_wn, updated_at_wn)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [input.biomeType, input.nodeName, input.latitude ?? null, input.longitude ?? null, JSON.stringify(input.metadataL10), input.activeRemedy, now, now, now]
        );

        return { id: (result as any).insertId, validated: true };
      }),

    update: protectedProcedure
      .input(worldNodeUpdateSchema)
      .mutation(async ({ input }) => {
        if (input.metadataL10) {
          const metaCheck = validateWorldNodeMetadata(input.metadataL10);
          if (!metaCheck.passed) {
            throw new Error(`WORLD_NODE_VALIDATION: ${metaCheck.message}`);
          }
        }

        const sets: string[] = [];
        const params: any[] = [];
        if (input.biomeType) { sets.push("biome_type = ?"); params.push(input.biomeType); }
        if (input.nodeName) { sets.push("node_name_wn = ?"); params.push(input.nodeName); }
        if (input.latitude !== undefined) { sets.push("latitude = ?"); params.push(input.latitude); }
        if (input.longitude !== undefined) { sets.push("longitude = ?"); params.push(input.longitude); }
        if (input.metadataL10) { sets.push("metadata_l10 = ?"); params.push(JSON.stringify(input.metadataL10)); }
        if (input.activeRemedy !== undefined) { sets.push("active_remedy = ?"); params.push(input.activeRemedy); }
        sets.push("last_verified_at_wn = ?"); params.push(Date.now());
        sets.push("updated_at_wn = ?"); params.push(Date.now());
        params.push(input.id);

        await pool.query(`UPDATE world_nodes SET ${sets.join(", ")} WHERE id = $1`, params);
        return { id: input.id, updated: true };
      }),
  }),

  // ─── Remedy Paths (Canonical) ───
  remedyPaths: router({
    create: protectedProcedure
      .input(remedyPathCreateSchema)
      .mutation(async ({ input }) => {
        // Enforce Rule 8: if LATERAL, validate target node
        if (input.routeDirection === "LATERAL" && input.targetNodeId) {
          const nodeCheck = await validateWorldNodeForRemedy(input.targetNodeId);
          if (!nodeCheck.passed) {
            throw new Error(`WORLD_NODE_VALIDATION: ${nodeCheck.message}`);
          }
        }

        // Enforce remedy path integrity
        const integrityCheck = validateRemedyPathIntegrity({
          routeDirection: input.routeDirection ?? null,
          targetNodeId: input.targetNodeId ?? null,
          blockReason: input.blockReason ?? null,
        });
        if (!integrityCheck.passed) {
          throw new Error(`REMEDY_PATH_INTEGRITY: ${integrityCheck.message}`);
        }

        const now = Date.now();
        const status = input.blockReason ? "blocked" : "pending";

        const { rows: result } = await pool.query(
          `INSERT INTO remedy_paths (caseId, userId, title, description, pathType, viability, generatedBy, remedyStatus, createdAt, updatedAt, signal_id_rp, route_direction, target_node_id, block_reason, canonical_remedy_status)
           VALUES ($1, $2, $3, $4, $5, 'moderate', 'system', 'draft', $6, $7, $8, $9, $10, $11, $12)`,
          [input.caseId, input.userId, input.title, input.description ?? null, input.pathType, now, now, input.signalId, input.routeDirection ?? null, input.targetNodeId ?? null, input.blockReason ?? null, status]
        );

        return { id: (result as any).insertId, status, integrity_check: integrityCheck.passed };
      }),

    bySignal: publicProcedure
      .input(z.object({ signalId: z.string() }))
      .query(async ({ input }) => {
        const { rows: rows } = await pool.query(
          `SELECT * FROM remedy_paths WHERE signal_id_rp = $1 ORDER BY createdAt DESC`,
          [input.signalId]
        );
        return rows as any[];
      }),
  }),

  // ─── Enforcement ───
  enforce: publicProcedure
    .input(z.object({ signalId: z.string() }))
    .query(async ({ input }) => {
      return enforceAllCanonicalRules(input.signalId);
    }),

  auditDeadEnds: publicProcedure.query(async () => {
    return auditDeadEnds();
  }),

  // ─── Proof Stream ───
  runProofStream: protectedProcedure
    .input(z.object({ liveSignalId: z.number() }))
    .mutation(async ({ input }) => {
      const { runProofStream } = await import("../proof-stream");
      return runProofStream(input.liveSignalId);
    }),

  proofStreamCandidates: publicProcedure.query(async () => {
    const { rows: rows } = await pool.query(
      `SELECT id, signalType, jurisdiction, domain, severity, title, confidenceScore
       FROM live_signals
       WHERE domain IS NOT NULL AND jurisdiction IS NOT NULL
       ORDER BY id ASC LIMIT 20`
    );
    return rows as any[];
  }),
});
