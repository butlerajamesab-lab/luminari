/**
 * LumenSend — tRPC Router
 *
 * Document generation and delivery for Luminari.
 * Generates pre-filled letters from registry context, surfaces eligibility warnings,
 * and provides print/copy/email delivery options.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  listDrafts, getDraft, createDraft, updateDraft, deleteDraft,
  markDraftSent, getDraftCount, listTemplates,
} from "../lumensend-db";
import {
  generateLetter, generatePreFlight,
  loadPrograms, loadOversightBodies,
} from "../lumensend-engine";
import { getActiveSignalsForTarget } from "../live-signal-emitter";

export const lumensendRouter = router({
  // ─── Pre-Flight Check ───
  preflight: protectedProcedure
    .input(z.object({
      stateCode: z.string().min(2).max(2),
      documentType: z.enum(["appeal", "complaint", "inquiry", "application", "follow_up", "demand", "notice"]),
      contextType: z.enum(["registry_program", "oversight_body", "cda_denial", "case_repair", "docket_entry", "manual"]),
      programId: z.string().optional(),
      oversightBody: z.string().optional(),
      userSituation: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const warnings = await generatePreFlight(input);
      return { warnings };
    }),

  // ─── Generate Letter ───
  generate: protectedProcedure
    .input(z.object({
      stateCode: z.string().min(2).max(2),
      documentType: z.enum(["appeal", "complaint", "inquiry", "application", "follow_up", "demand", "notice"]),
      contextType: z.enum(["registry_program", "oversight_body", "cda_denial", "case_repair", "docket_entry", "manual"]),
      programId: z.string().optional(),
      oversightBody: z.string().optional(),
      senderName: z.string().min(1),
      senderAddress: z.string().optional(),
      senderEmail: z.string().optional(),
      senderPhone: z.string().optional(),
      situation: z.string().min(10).max(5000),
      additionalContext: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const letter = await generateLetter({
        ...input,
        senderName: input.senderName,
      });

      // Auto-save as draft
      const now = Date.now();
      const draft = await createDraft({
        userId: ctx.user.id,
        documentType: input.documentType as any,
        recipientAgency: letter.recipientAgency,
        recipientName: letter.recipientName,
        recipientAddress: letter.recipientAddress,
        recipientEmail: letter.recipientEmail,
        recipientPhone: letter.recipientPhone,
        subject: letter.subject,
        body: letter.body,
        senderName: input.senderName,
        senderAddress: input.senderAddress ?? null,
        senderEmail: input.senderEmail ?? null,
        senderPhone: input.senderPhone ?? null,
        contextType: input.contextType as any,
        contextId: input.programId || input.oversightBody || null,
        contextLabel: null,
        jurisdiction: input.stateCode,
        related_actions: letter.relatedActions?.length ? JSON.stringify(letter.relatedActions) : null,
        status: "draft" as any,
        createdAt: now,
        updatedAt: now,
      });

      return {
        draft_id: draft.id,
        letter,
      };
    }),

  // ─── Draft CRUD ───
  drafts: router({
    list: protectedProcedure
      .input(z.object({
        status: z.enum(["draft", "ready", "sent", "printed", "copied"]).optional(),
        limit: z.number().min(1).max(100).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return listDrafts(ctx.user.id, input);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const draft = await getDraft(input.id, ctx.user.id);
        if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
        return draft;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        subject: z.string().optional(),
        body: z.string().optional(),
        recipientAgency: z.string().optional(),
        recipientName: z.string().optional(),
        recipientAddress: z.string().optional(),
        recipientEmail: z.string().optional(),
        recipientPhone: z.string().optional(),
        senderName: z.string().optional(),
        senderAddress: z.string().optional(),
        senderEmail: z.string().optional(),
        senderPhone: z.string().optional(),
        status: z.enum(["draft", "ready"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        return updateDraft(id, ctx.user.id, data as any);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteDraft(input.id, ctx.user.id);
        return { success: true };
      }),

    markSent: protectedProcedure
      .input(z.object({
        id: z.number(),
        method: z.enum(["email", "print", "copy"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Signal gate: check for PATH_INVALID or RESOURCE_STALE signals on this draft
        // DEADLINE_APPROACHING signals allow transmission override (urgent send)
        try {
          const draft = await getDraft(input.id, ctx.user.id);
          if (draft) {
            const [pathInvalidSignals, staleSignals] = await Promise.all([
              getActiveSignalsForTarget("lumensend_drafts", input.id, "PATH_INVALID"),
              getActiveSignalsForTarget("lumensend_drafts", input.id, "RESOURCE_STALE"),
            ]);
            if (pathInvalidSignals.length > 0) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `Transmission blocked: ${pathInvalidSignals[0].title}. The enforcement path for this document is no longer valid. Please regenerate with an updated path.`,
              });
            }
            if (staleSignals.length > 0) {
              // RESOURCE_STALE is a warning, not a hard block — but we surface it
              // Check if there's a DEADLINE_APPROACHING override
              const deadlineSignals = await getActiveSignalsForTarget("lumensend_drafts", input.id, "DEADLINE_APPROACHING");
              if (deadlineSignals.length === 0) {
                // No deadline urgency — soft block with warning in response
                // We still allow the send but attach the warning
                const result = await markDraftSent(input.id, ctx.user.id, input.method);
                return { ...result, warning: `Resource flagged as stale: ${staleSignals[0].title}. Verify the recipient information before acting on the response.` };
              }
            }
          }
        } catch (e) {
          if (e instanceof TRPCError) throw e;
          // Non-fatal: signal lookup failure should not block transmission
        }
        return markDraftSent(input.id, ctx.user.id, input.method);
      }),

    count: protectedProcedure
      .query(async ({ ctx }) => {
        return getDraftCount(ctx.user.id);
      }),
  }),

  // ─── Templates ───
  templates: router({
    list: protectedProcedure
      .input(z.object({
        documentType: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        return listTemplates(input?.documentType);
      }),
  }),

  // ─── Registry Context Helpers ───
  context: router({
    programs: protectedProcedure
      .input(z.object({ stateCode: z.string().min(2).max(2) }))
      .query(async ({ input }) => {
        const programs = loadPrograms(input.stateCode.toUpperCase());
        return programs.map(p => ({
          id: p.program_id,
          name: p.program_name,
          agency: p.agency,
          category: p.category,
          eligibility: p.eligibility,
          phone: p.phone,
        }));
      }),

    oversightBodies: protectedProcedure
      .input(z.object({ stateCode: z.string().min(2).max(2) }))
      .query(async ({ input }) => {
        const bodies = loadOversightBodies(input.stateCode.toUpperCase());
        return bodies.map(b => ({
          name: b.oversight_body,
          jurisdiction: b.jurisdiction,
          phone: b.phone,
          address: [b.street_address, b.city, b.state_code, b.zip].filter(Boolean).join(", "),
          whatToReport: b.what_to_report,
        }));
      }),
  }),
});
