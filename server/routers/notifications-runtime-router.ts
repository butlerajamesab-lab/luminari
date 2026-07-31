import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getUnreadNotificationCountRuntime,
  listNotificationsRuntime,
  markAllNotificationsReadRuntime,
  markNotificationReadRuntime,
} from "../notifications-runtime-store";

export const notificationsRuntimeRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          unreadOnly: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return listNotificationsRuntime(ctx.user.id, {
        unreadOnly: input?.unreadOnly,
        limit: input?.limit,
      });
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return getUnreadNotificationCountRuntime(ctx.user.id);
  }),

  markRead: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await markNotificationReadRuntime(
        input.notificationId,
        ctx.user.id
      );
      return { success: updated };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const updatedCount = await markAllNotificationsReadRuntime(ctx.user.id);
    return { success: true, updatedCount };
  }),
});

export const notificationRuntimeAppRouter = router({
  notifications: notificationsRuntimeRouter,
});
