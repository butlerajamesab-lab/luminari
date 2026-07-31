import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { notificationRuntimeAppRouter } from "../routers/notifications-runtime-router";
import { createContext } from "./context";
import { extractTrpcProcedurePaths } from "./trpc-service-admin-middleware";

const notificationRuntimeAdapter = createExpressMiddleware({
  router: notificationRuntimeAppRouter,
  createContext,
});

function isNotificationProcedure(path: string): boolean {
  return path === "notifications" || path.startsWith("notifications.");
}

/**
 * The monolithic router still contains a legacy Drizzle notification mapping
 * with quoted camelCase physical columns and MySQL insert-result assumptions.
 * Intercept notification-only requests before that router and serve the
 * canonical snake_case PostgreSQL contract. Mixed tRPC batches continue to the
 * main adapter and are not partially executed.
 */
export const notificationRuntimeTrpcMiddleware: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const paths = extractTrpcProcedurePaths(req);
  if (paths.length === 0 || !paths.every(isNotificationProcedure)) {
    return next();
  }

  return notificationRuntimeAdapter(req, res, next);
};
