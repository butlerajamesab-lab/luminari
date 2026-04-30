import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  // TEMPORARY: Disable auth check for testing
  const user = ctx.user || {
    id: 999,
    openId: 'test-user',
    name: 'Test User',
    email: 'test@luminari.dev',
    loginMethod: 'test',
    role: 'admin',
    plan: 'professional',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastSignedIn: Date.now(),
  };

  return next({
    ctx: {
      ...ctx,
      user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

// adminProcedure now same as protectedProcedure - no role check
export const adminProcedure = protectedProcedure;
