/**
 * TEMPORARY BYPASS FOR tRPC PROCEDURES
 * 
 * Provides temporary auth context for tRPC calls during development validation
 * Allows /intake and /case/:id routes to work without OAuth
 */

import { TRPCError } from '@trpc/server';

export const TEMP_BYPASS_USER = {
  id: 'dev-validation-user-001',
  email: 'validation@luminari.dev',
  name: 'Validation User',
  role: 'user' as const,
};

/**
 * Check if temporary bypass is enabled
 */
export function isTemporaryBypassEnabled(): boolean {
  return process.env.NODE_ENV === 'development' || 
         process.env.TEMP_AUTH_BYPASS === 'true';
}

/**
 * Get temporary bypass context
 * Returns mock user for development validation
 */
export function getTemporaryBypassContext() {
  if (!isTemporaryBypassEnabled()) {
    return null;
  }

  return {
    user: TEMP_BYPASS_USER,
    session: {
      id: `temp-session-${Date.now()}`,
      userId: TEMP_BYPASS_USER.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isTemporaryBypass: true,
    },
  };
}

/**
 * Temporary protected procedure that allows bypass
 * Used for /intake and /case/:id validation
 */
export function createTemporaryProtectedProcedure(baseProtectedProcedure: any) {
  return baseProtectedProcedure.use(async ({ ctx, next }: { ctx: any, next: any }) => {
    // If user already authenticated, use normal flow
    if (ctx.user) {
      return next({ ctx });
    }

    // If bypass enabled, inject temporary user
    if (isTemporaryBypassEnabled()) {
      const bypassCtx = getTemporaryBypassContext();
      if (bypassCtx) {
        console.log('[TEMP_BYPASS] Injecting temporary user for development validation');
        return next({ 
          ctx: { 
            ...ctx, 
            user: bypassCtx.user,
            isTemporaryBypass: true,
          } 
        });
      }
    }

    // Otherwise, throw auth error
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required. Temporary bypass not enabled.',
    });
  });
}
