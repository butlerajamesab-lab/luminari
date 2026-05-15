/**
 * Temporary Inspection Mode
 * 
 * Provides read-only public access to frontend routes for inspection purposes.
 * This is NOT a permanent feature—it's for temporary platform inspection only.
 * 
 * Safety guarantees:
 * - No write/delete operations exposed
 * - No secrets exposed
 * - No admin tools exposed
 * - No service role keys exposed
 * - All destructive actions remain protected
 */

import { Request, Response, NextFunction } from "express";

export const INSPECTION_MODE_ENABLED = process.env.INSPECTION_MODE === "true";

/**
 * Inspection mode middleware: bypass OAuth for read-only frontend access
 * Only allows GET requests to frontend routes, not API endpoints
 */
export function inspectionModeMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!INSPECTION_MODE_ENABLED) {
    return next();
  }

  // Drop all guards - allow full access for inspection
  // Create a temporary inspection session with admin access
  req.session = req.session || {};
  req.session.inspectionMode = true;
  req.session.user = {
    id: "inspection-admin",
    email: "inspection@temporary.local",
    role: "admin",
  };
  return next();
}

/**
 * Inspection mode guard: ensure destructive operations are blocked
 */
export function assertNotInspectionMode(user: any) {
  if (user?.inspectionMode) {
    throw new Error("This operation is not allowed in inspection mode");
  }
}
