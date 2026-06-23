import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const unresolvedProfileMessage =
  "Authenticated Supabase identity requires a resolved runtime profile for this operation.";

const requireAuthenticated = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (ctx.auth.auth_status === "unauthenticated") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
  }

  return next({ ctx });
});

export const authenticatedProcedure = t.procedure.use(requireAuthenticated);

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code:
        ctx.auth.auth_status === "authenticated_profile_unresolved"
          ? "FORBIDDEN"
          : "UNAUTHORIZED",
      message:
        ctx.auth.auth_status === "authenticated_profile_unresolved"
          ? unresolvedProfileMessage
          : UNAUTHED_ERR_MSG,
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

const requireAdmin = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code:
        ctx.auth.auth_status === "authenticated_profile_unresolved"
          ? "FORBIDDEN"
          : "UNAUTHORIZED",
      message:
        ctx.auth.auth_status === "authenticated_profile_unresolved"
          ? unresolvedProfileMessage
          : UNAUTHED_ERR_MSG,
    });
  }

  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: NOT_ADMIN_ERR_MSG,
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const adminProcedure = t.procedure.use(requireAdmin);
