import type { NextFunction, Request, RequestHandler, Response } from "express";
import { requireExpressAdmin } from "./express-admin-middleware";

/**
 * Namespaces below contain service-owned ingestion, packet-loading,
 * verification, activation, maintenance, resource-publication, or diagnostic
 * procedures. Several legacy procedures are still declared as
 * `publicProcedure`; this transport-level gate closes that boundary without
 * changing public civic-reference queries elsewhere in the tRPC tree.
 */
export const ADMIN_ONLY_TRPC_NAMESPACES = Object.freeze([
  "activation",
  "debugDb",
  "fullRegistryIngest",
  "integrationTest",
  "phase2CleanPacket",
  "phase2PacketLoader",
  "registryCanonicalIngest",
  "resourceVerification",
  "scaledRegistryIngest",
  "setup",
  "spineVerification",
  "sunam",
  "sunamGatedIngest",
]);

function decodeProcedurePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractTrpcProcedurePaths(req: Pick<Request, "path">): string[] {
  const rawPath = String(req.path ?? "")
    .replace(/^\/+/, "")
    .split("?", 1)[0];

  if (!rawPath) return [];

  return decodeProcedurePath(rawPath)
    .split(",")
    .map((procedurePath) => procedurePath.trim())
    .filter(Boolean);
}

export function isAdminOnlyTrpcProcedure(procedurePath: string): boolean {
  return ADMIN_ONLY_TRPC_NAMESPACES.some(
    (namespace) =>
      procedurePath === namespace || procedurePath.startsWith(`${namespace}.`)
  );
}

export const requireAdminForServiceTrpcOperations: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const procedurePaths = extractTrpcProcedurePaths(req);
  const requiresAdmin = procedurePaths.some(isAdminOnlyTrpcProcedure);

  if (!requiresAdmin) return next();

  return requireExpressAdmin(req, res, next);
};
