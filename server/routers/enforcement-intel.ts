import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { db } from "../db";
import { read_signal_architecture } from "../signal-architecture-read-model";
import {
  SIGNAL_ARTIFACT_DOMAINS,
  SIGNAL_CASE_RELATIONSHIPS,
  connect_signal_artifact_to_case,
  list_case_signal_artifacts,
  list_signal_artifacts,
  read_signal_artifact,
} from "../signal-artifact-runtime";
import { eq, and } from "drizzle-orm";
import {
  workflowMaster,
  workflowSteps,
  claimElementMatrix,
  proofFrameworks,
} from "../../drizzle/schema";

export const enforcementIntelRouter = router({
  get_signal_architecture: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(24),
      }).optional(),
    )
    .query(({ input }) => read_signal_architecture(input?.limit ?? 24)),

  list_signal_artifacts: protectedProcedure
    .input(z.object({
      domain: z.enum(SIGNAL_ARTIFACT_DOMAINS).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
      query: z.string().trim().max(200).optional(),
    }))
    .query(({ input }) => list_signal_artifacts(input)),

  get_signal_artifact: protectedProcedure
    .input(z.object({
      domain: z.enum(SIGNAL_ARTIFACT_DOMAINS),
      record_id: z.string().uuid(),
    }))
    .query(({ input }) => read_signal_artifact(input.domain, input.record_id)),

  connect_signal_artifact_to_case: protectedProcedure
    .input(z.object({
      domain: z.enum(SIGNAL_ARTIFACT_DOMAINS),
      record_id: z.string().uuid(),
      case_id: z.number().int().positive(),
      relationship_type: z.enum(SIGNAL_CASE_RELATIONSHIPS),
      reviewer_notes: z.string().trim().max(2000).optional(),
    }))
    .mutation(({ ctx, input }) => connect_signal_artifact_to_case({
      ...input,
      user_id: ctx.user.id,
    })),

  list_case_signal_artifacts: protectedProcedure
    .input(z.object({ case_id: z.number().int().positive() }))
    .query(({ ctx, input }) => list_case_signal_artifacts({
      case_id: input.case_id,
      user_id: ctx.user.id,
    })),

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

      const steps = await db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.workflowId, workflowId))
        .orderBy(workflowSteps.stepOrder);

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

      const proofFws = await db
        .select()
        .from(proofFrameworks)
        .where(eq(proofFrameworks.domain, domain));

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
