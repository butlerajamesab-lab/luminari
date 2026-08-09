import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { db } from "../db";
import { read_signal_architecture } from "../signal-architecture-read-model";
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
