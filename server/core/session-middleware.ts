import type { RequestHandler } from "express";
export const sessionMiddleware: RequestHandler = (_req, _res, next) => next();
