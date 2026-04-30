import type { Request, Response, NextFunction } from "express";

export function sessionMiddleware(req: Request, _res: Response, next: NextFunction): void {
  (req as any).session = null;
  next();
}
