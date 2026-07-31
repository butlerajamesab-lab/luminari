import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { db, getPool } from "../db";
import { eq, and } from "drizzle-orm";
import {
  workflowMaster,
  workflowSteps,
  claimElementMatrix,
  proofFrameworks,
} from "../../drizzle/schema";

function to_count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const enforcementIntelRouter = router({
  get_signal_architecture: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(24),
      }).optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 24;
      const pool = getPool();

      const [summary_result, integrity_result, recent_result] = await Promise.all([
        pool.query(`
          select domain_code,
                 domain_label,
                 canonical_relation,
                 source_owner,
                 description,
                 source_boundary,
                 severity_policy,
                 confidence_policy,
                 is_source_domain,
                 total_record_count,
                 current_record_count,
                 latest_record_at
            from public.v_signal_architecture_summary
           order by case domain_code
             when 'case_intake' then 1
             when 'legal_pattern' then 2
             when 'live_data' then 3
             else 4 end
        `),
        pool.query(`select * from public.v_signal_architecture_integrity`),
        pool.query(
          `select domain_code,
                  record_id,
                  title,
                  description,
                  jurisdiction_id,
                  status,
                  severity,
                  confidence_score,
                  entity_resolution_status,
                  source_reference,
                  occurred_at,
                  created_at
             from public.v_signal_architecture_recent
            order by occurred_at desc nulls last, created_at desc
            limit $1`,
          [limit],
        ),
      ]);

      const integrity = integrity_result.rows[0] ?? {};
      const recent_records = recent_result.rows.map((row) => {
        const is_intake = row.domain_code === "case_intake";
        return {
          domain_code: String(row.domain_code),
          record_id: String(row.record_id),
          title: is_intake ? "Case-intake breakpoint" : String(row.title ?? "Untitled record"),
          description: is_intake
            ? "Individual intake details are restricted to the case and intake surfaces."
            : String(row.description ?? ""),
          jurisdiction_id: row.jurisdiction_id == null ? null : String(row.jurisdiction_id),
          status: String(row.status ?? "unknown"),
          severity: row.severity == null ? null : String(row.severity),
          confidence_score: row.confidence_score == null
            ? null
            : Number(row.confidence_score),
          entity_resolution_status: row.entity_resolution_status == null
            ? null
            : String(row.entity_resolution_status),
          source_reference: is_intake || row.source_reference == null
            ? null
            : String(row.source_reference),
          occurred_at: row.occurred_at == null
            ? null
            : new Date(row.occurred_at).toISOString(),
          created_at: row.created_at == null
            ? null
            : new Date(row.created_at).toISOString(),
        };
      });

      return {
        contract_version: "signal_architecture_ground_truth_v1",
        domains: summary_result.rows.map((row) => ({
          domain_code: String(row.domain_code),
          domain_label: String(row.domain_label),
          canonical_relation: String(row.canonical_relation),
          source_owner: String(row.source_owner),
          description: String(row.description),
          source_boundary: String(row.source_boundary),
          severity_policy: String(row.severity_policy),
          confidence_policy: String(row.confidence_policy),
          is_source_domain: Boolean(row.is_source_domain),
          total_record_count: to_count(row.total_record_count),
          current_record_count: to_count(row.current_record_count),
          latest_record_at: row.latest_record_at == null
            ? null
            : new Date(row.latest_record_at).toISOString(),
        })),
        integrity: {
          atlas_raw_observation_count: to_count(integrity.atlas_raw_observation_count),
          legacy_detected_signals_count: to_count(integrity.legacy_detected_signals_count),
          legacy_live_signals_count: to_count(integrity.legacy_live_signals_count),
          prior_v2_signal_count: to_count(integrity.prior_v2_signal_count),
          intake_signal_count: to_count(integrity.intake_signal_count),
          legal_pattern_count: to_count(integrity.legal_pattern_count),
          live_data_signal_count: to_count(integrity.live_data_signal_count),
          convergence_count: to_count(integrity.convergence_count),
          latest_atlas_observation_at: integrity.latest_atlas_observation_at == null
            ? null
            : new Date(integrity.latest_atlas_observation_at).toISOString(),
          legacy_status: String(integrity.legacy_status ?? "unknown"),
          atlas_status: String(integrity.atlas_status ?? "unknown"),
        },
        recent_records,
      };
    }),

  generateInvestigationWorkflow: publicProcedure
    .input(
      z.object({
        domain: z.string(),
        claimType: z.string().optional(),
        agencyShort: z.string().optional(),
        incidentDate: z.string().optional(),
        hasDocuments: z.boolean().default(false),
        hasWitnesses: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const { domain, claimType, agencyShort, hasDocuments, hasWitnesses } =
        input;

      // Query workflow_master for matching domain
      const workflows = await db
        .select()
        .from(workflowMaster)
        .where(eq(workflowMaster.domain, domain));

      if (workflows.length === 0) {
        return {
          workflow: {
            immediate_actions: [],
            records_to_request: [],
            witness_targets: [],
            timeline_tasks: [],
            agency_steps: [],
            risk_flags: [],
          },
          metadata: {
            weak_joints_considered: 0,
            signals_considered: 0,
            contradiction_templates_considered: 0,
            barriers_considered: 0,
          },
        };
      }

      const workflowId = workflows[0].id;

      // Query workflow_steps for this workflow
      const steps = await db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, workflowId))
        .orderBy(workflowSteps.stepOrder);

      // Query claim elements if claimType provided
      let claimElements: any[] = [];
      if (claimType) {
        claimElements = await db
          .select()
          .from(claimElementMatrix)
          .where(
            and(
              eq(claimElementMatrix.claimType, claimType),
              eq(claimElementMatrix.domain, domain)
            )
          )
          .orderBy(claimElementMatrix.elementOrder);
      }

      // Query proof frameworks
      const proofFws = await db
        .select()
        .from(proofFrameworks)
        .where(eq(proofFrameworks.domain, domain));

      // Build investigation workflow from database records
      const immediateActions = steps
        .filter((s) => s.type === "eligibility_check")
        .map((s, i) => ({
          priority: i + 1,
          action: s.title,
          reason: s.description || "Required step",
          deadline: s.deadline || "As soon as possible",
        }));

      const recordsToRequest = steps
        .filter((s) => s.type === "evidence_collection")
        .flatMap((s) => {
          const inputs = s.requiredInputs as any;
          return Array.isArray(inputs)
            ? inputs.map((inp: string) => ({
                source: "Respondent / Agency",
                recordType: inp,
                reason: s.description || "Investigation requirement",
                method: "FOIA / Direct Request",
              }))
            : [];
        });

      const witnessTargets = steps
        .filter((s) => s.type === "investigation")
        .map((s) => ({
          category: "Key Witnesses",
          description: s.title,
          purpose: s.description || "Investigation support",
        }));

      const timelineTasks = steps.map((s) => ({
        phase: `Step ${s.order}`,
        duration: `${s.estimatedDays || 5} days`,
        task: s.title,
      }));

      const agencySteps = steps
        .filter((s) => ["filing", "agency_review"].includes(s.type))
        .map((s) => ({
          step: s.title,
          description: s.description || "",
          deadline: s.deadline || "Per agency rules",
          form: "HUD Form 903",
        }));

      const riskFlags = steps
        .filter((s) => s.warnings && Array.isArray(s.warnings))
        .flatMap((s) => (s.warnings as any[]).map((w) => ({ flag: w })));

      return {
        workflow: {
          immediateActions,
          recordsToRequest,
          witnessTargets,
          timelineTasks,
          agencySteps,
          riskFlags,
        },
        metadata: {
          weak_joints_considered: claimElements.length,
          signals_considered: steps.length,
          contradiction_templates_considered: proofFws.length,
          barriers_considered: 0,
        },
      };
    }),
});