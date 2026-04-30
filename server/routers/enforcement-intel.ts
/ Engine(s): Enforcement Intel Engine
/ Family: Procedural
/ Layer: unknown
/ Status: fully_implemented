import { router, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
  workflowMaster,
  workflowSteps,
  claimElementMatrix,
  proofFrameworks,
} from "../../drizzle/schema";

export const enforcementIntelRouter = router({
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
            immediateActions: [],
            recordsToRequest: [],
            witnessTargets: [],
            timelineTasks: [],
            agencySteps: [],
            riskFlags: [],
          },
          metadata: {
            weakJointsConsidered: 0,
            signalsConsidered: 0,
            contradictionTemplatesConsidered: 0,
            barriersConsidered: 0,
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

      const timelineTasks = steps.map((s, i) => ({
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

      // Return empty if no workflows found
      if (workflows.length === 0) {
        return {
          workflow: {
            immediateActions: [],
            recordsToRequest: [],
            witnessTargets: [],
            timelineTasks: [],
            agencySteps: [],
            riskFlags: [],
          },
          metadata: {
            weakJointsConsidered: 0,
            signalsConsidered: 0,
            contradictionTemplatesConsidered: 0,
            barriersConsidered: 0,
          },
        };
      }

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
          weakJointsConsidered: claimElements.length,
          signalsConsidered: steps.length,
          contradictionTemplatesConsidered: proofFws.length,
          barriersConsidered: 0,
        },
      };
    }),
});
