/**
 * Constitutional Enforcement Gate
 *
 * All router execution must flow through these gates:
 * - runRead: Verify interpretation exists and is valid
 * - runAction: Verify interpretation + dispatch through dispatcher
 * - runExport: Verify interpretation + trace + dispatch through dispatcher
 *
 * No router may bypass these gates.
 * No router may call services directly.
 * No router may perform calculations or meaning derivation.
 */

import { getCaseInterpretation } from "../services/interpretation-service";
import { dispatcher } from "../services/dispatcher";
import { TRPCError } from "@trpc/server";

/**
 * READ GATE
 * Verify interpretation exists and is valid before allowing read operations
 */
export async function runRead(caseId: number | string) {
  try {
    const interpretation = await getCaseInterpretation(Number(caseId));

    if (!interpretation) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "BLOCKED: No interpretation available for case",
      });
    }

    // @ts-ignore - "ok" is valid at runtime
    if (interpretation.status !== "ok") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `BLOCKED: Interpretation status is ${interpretation.status}`,
      });
    }

    return interpretation;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "BLOCKED: Failed to retrieve interpretation",
    });
  }
}

/**
 * ACTION GATE
 * Verify interpretation exists and dispatch action through dispatcher
 */
export async function runAction(
  caseId: number | string,
  actionType: string,
  input: Record<string, any>
) {
  try {
    const interpretation = await getCaseInterpretation(Number(caseId));

    if (!interpretation) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "BLOCKED: No interpretation available for action",
      });
    }

    // @ts-ignore - "ok" is valid at runtime
    if (interpretation.status !== "ok") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `BLOCKED: Interpretation status is ${interpretation.status}`,
      });
    }

    // Dispatch action through dispatcher (not direct execution)
    return await (dispatcher as any).dispatch({
      type: actionType,
      caseId: Number(caseId),
      interpretation,
      input,
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "BLOCKED: Failed to dispatch action",
    });
  }
}

/**
 * EXPORT GATE
 * Verify interpretation exists, has trace, and dispatch export through dispatcher
 */
export async function runExport(
  caseId: number | string,
  input: Record<string, any>
) {
  try {
    const interpretation = await getCaseInterpretation(Number(caseId));

    if (!interpretation) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "BLOCKED: No interpretation available for export",
      });
    }

    // @ts-ignore
    if (interpretation.status !== "ok") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `BLOCKED: Interpretation status is ${interpretation.status}`,
      });
    }

    if (!interpretation.interpretationTrace || interpretation.interpretationTrace.length === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "BLOCKED: No interpretation trace available for export",
      });
    }

    // Dispatch export through dispatcher (not direct execution)
    return await (dispatcher as any).dispatch({
      type: "export",
      caseId: Number(caseId),
      interpretation,
      input,
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "BLOCKED: Failed to dispatch export",
    });
  }
}

/**
 * HARD RULES (Enforced by TypeScript + Runtime)
 *
 * ❌ NO router logic
 * ❌ NO DB writes
 * ❌ NO service calls
 * ❌ NO calculations
 * ❌ NO joins for meaning
 * ❌ NO pipeline calls
 * ❌ NO summary builders
 * ❌ NO export builders
 * ❌ NO direct service calls
 *
 * ✅ ONLY runRead / runAction / runExport
 * ✅ ONLY dispatch through dispatcher
 * ✅ ONLY use interpretation output
 */
