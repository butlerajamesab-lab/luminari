import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { RuntimeUser } from "./user-resolver";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const unresolvedProfileMessage =
  "Authenticated Supabase identity requires a resolved runtime profile for this operation.";

const SINGLE_OPERATOR_PUBLIC_READ_ENABLED =
  process.env.SINGLE_OPERATOR_PUBLIC_READ === "1";

function singleOperatorPublicReadUser(): RuntimeUser | null {
  if (!SINGLE_OPERATOR_PUBLIC_READ_ENABLED) return null;
  const id = Number(process.env.SINGLE_OPERATOR_PUBLIC_READ_USER_ID ?? "1");
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    id,
    open_id: null,
    name: "Single Operator",
    email: null,
    login_method: "single_operator_public_read",
    role: "admin",
    plan: "internal",
    created_at: 0,
    updated_at: 0,
    last_signed_in: 0,
  };
}

const SINGLE_OPERATOR_PUBLIC_READ_PREFIXES = [
  "architectureMap.",
  "campaignEngine.",
  "canonicalCore.",
  "claimValidation.",
  "coalitionAdvocacy.",
  "coalitionIntelligence.",
  "enforcementIntel.",
  "engines.",
  "enginesV2.",
  "enginesV3.",
  "enginesV4.",
  "evidenceConfidence.",
  "ingestion.",
  "interventionNetwork.",
  "knowledgeHealth.",
  "knowledgeIngestion.",
  "legalLibrary.",
  "lighthouse.",
  "operationalWorkflow.",
  "policyImpact.",
  "proceduralPathEngine.",
  "reformPackage.",
  "registry.",
  "remedyFeasibility.",
  "remedyTemplate.",
  "resourceDirectory.",
  "s76.",
  "settlementCalculator.",
  "signalGovernance.",
  "streams.",
  "system.",
  "systemHardeningPipeline.",
  "timeTravel.",
  "trendEngine.",
  "unified.",
] as const;

function singleOperatorQueryUser(opts: { type: string; path: string }): RuntimeUser | null {
  if (opts.type !== "query") return null;
  if (!SINGLE_OPERATOR_PUBLIC_READ_PREFIXES.some(prefix => opts.path.startsWith(prefix))) return null;
  return singleOperatorPublicReadUser();
}

const requireAuthenticated = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (ctx.auth.auth_status === "unauthenticated") {
    const operator = singleOperatorQueryUser(opts);
    if (operator) {
      return next({ ctx: { ...ctx, user: operator } });
    }
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
    const operator = singleOperatorQueryUser(opts);
    if (operator) {
      return next({
        ctx: {
          ...ctx,
          user: operator,
        },
      });
    }
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
  const user = ctx.user ?? singleOperatorQueryUser(opts);

  if (!user) {
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

  if (user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: NOT_ADMIN_ERR_MSG,
    });
  }

  return next({
    ctx: {
      ...ctx,
      user,
    },
  });
});

export const adminProcedure = t.procedure.use(requireAdmin);
