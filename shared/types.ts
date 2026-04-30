/**
 * Unified type exports
 * Import shared types from this single entry point.
 * 
 * NOTE: Removed `export type * from "../drizzle/schema"` which caused
 * massive generic instantiation and TypeScript memory exhaustion (exit code 134).
 * Only import specific types as needed.
 */

export * from "./_core/errors";

// Minimal schema imports - only export User type if needed
export type { User, InsertUser } from "../drizzle/schema";
