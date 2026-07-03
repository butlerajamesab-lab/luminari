import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { db } from '../db';
import { businessBaselines } from '../../drizzle/schema';
import { eq, and } from 'drizzle-orm';

export const businessRouter = router({
  /**
   * Get all business baselines for analytics
   */
  getBaselines: protectedProcedure
    .query(async () => {
      const baselines = await db.select().from(businessBaselines);
      return baselines;
    }),

  /**
   * Get baseline for a specific entity
   */
  getBaseline: protectedProcedure
    .input(z.object({
      entityType: z.enum(['product', 'expense_category']),
      entityId: z.string(),
    }))
    .query(async ({ input }) => {
      const [baseline] = await db
        .select()
        .from(businessBaselines)
        .where(
          and(
            eq(businessBaselines.entityType, input.entityType),
            eq(businessBaselines.entityId, input.entityId)
          )
        );
      return baseline || null;
    }),

  /**
   * Create or update a baseline
   */
  upsertBaseline: protectedProcedure
    .input(z.object({
      entityType: z.enum(['product', 'expense_category']),
      entityId: z.string(),
      avgAmount: z.string(),
      stddevAmount: z.string().optional(),
      sampleCount: z.number(),
    }))
    .mutation(async ({ input }) => {
      const now = Date.now();
      
      const result = await db
        .insert(businessBaselines)
        .values({
          entityType: input.entityType,
          entityId: input.entityId,
          avgAmount: input.avgAmount,
          stddevAmount: input.stddevAmount,
          sampleCount: input.sampleCount,
          lastUpdated: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            avgAmount: input.avgAmount,
            stddevAmount: input.stddevAmount,
            sampleCount: input.sampleCount,
            lastUpdated: now,
          },
        });

      return { success: true, id: result?.[0]?.insertId ?? (result as any).insertId };
    }),

  /**
   * Get analytics summary
   */
  getAnalyticsSummary: protectedProcedure
    .query(async () => {
      const baselines = await db.select().from(businessBaselines);
      
      const productBaselines = baselines.filter((b: any) => b.entityType === 'product');
      const expenseBaselines = baselines.filter((b: any) => b.entityType === 'expense_category');

      return {
        total_baselines: baselines.length,
        product_count: productBaselines.length,
        expense_category_count: expenseBaselines.length,
        last_updated: baselines.length > 0 
          ? Math.max(...baselines.map((b: any) => b.lastUpdated || 0))
          : null,
      };
    }),
});
