/**
 * External Collaboration & Secure Sharing Engine
 * 
 * Manages secure sharing of dossiers with external partners (journalists,
 * attorneys, regulators, advocates). Handles access tokens, audit trails,
 * redaction, and collaboration signals.
 */

import { db } from "../db";
import {
  externalPartners,
  dossierShares,
  shareAccessLogs,
  externalComments,
  dossierRedactions,
  type ExternalPartnerRow,
  type DossierShareRow,
} from "../../drizzle/schema";
import { eq, desc, sql, count, and } from "drizzle-orm";
import crypto from "crypto";

// ── Types ──────────────────────────────────────────────────────────

export type PartnerType = "journalist" | "attorney" | "regulator" | "advocate" | "researcher" | "other";
export type AccessLevel = "view_only" | "view_download" | "view_comment" | "full_access";
export type ShareAction = "view" | "download" | "comment" | "print" | "share_forward";

export interface PartnerInput {
  name: string;
  organization?: string;
  partnerType: PartnerType;
  email?: string;
  jurisdiction?: string;
  notes?: string;
}

export interface ShareInput {
  dossierId: number;
  partnerId: number;
  accessLevel?: AccessLevel;
  expiresInDays?: number;
}

export interface RedactionInput {
  dossierId: number;
  sectionId?: number;
  redactedText: string;
  reason?: string;
  createdBy?: string;
}

// ── Partner Management ─────────────────────────────────────────────

export async function registerPartner(input: PartnerInput): Promise<ExternalPartnerRow> {
  const [inserted] = await db.insert(externalPartners).values({
    name: input.name,
    organization: input.organization ?? null,
    partnerType: input.partnerType,
    email: input.email ?? null,
    jurisdiction: input.jurisdiction ?? null,
    notes: input.notes ?? null,
  }).$returningId();

  const [partner] = await db.select().from(externalPartners).where(eq(externalPartners.id, inserted.id)).limit(1);
  return partner;
}

export async function verifyPartner(partnerId: number): Promise<void> {
  await db.update(externalPartners)
    .set({ verificationStatus: "verified", trustScore: 75 })
    .where(eq(externalPartners.id, partnerId));
}

export async function listPartners(params?: { type?: PartnerType; status?: string }): Promise<ExternalPartnerRow[]> {
  let query = db.select().from(externalPartners);
  
  if (params?.type) {
    query = query.where(eq(externalPartners.partnerType, params.type)) as any;
  }
  
  return await query.orderBy(desc(externalPartners.createdAt)).limit(50);
}

export async function getPartnerById(id: number): Promise<ExternalPartnerRow | null> {
  const [partner] = await db.select().from(externalPartners).where(eq(externalPartners.id, id)).limit(1);
  return partner ?? null;
}

// ── Secure Sharing ─────────────────────────────────────────────────

function generateShareToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createShare(input: ShareInput): Promise<{
  share: DossierShareRow;
  shareUrl: string;
}> {
  const token = generateShareToken();
  const expiresAt = input.expiresInDays
    ? Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000
    : Date.now() + 30 * 24 * 60 * 60 * 1000; // Default 30 days

  const [inserted] = await db.insert(dossierShares).values({
    dossierId: input.dossierId,
    partnerId: input.partnerId,
    shareToken: token,
    accessLevel: input.accessLevel ?? "view_only",
    expiresAt,
  }).$returningId();

  const [share] = await db.select().from(dossierShares).where(eq(dossierShares.id, inserted.id)).limit(1);
  
  // Log the share creation
  await logAccess(share.id, input.partnerId, "share_forward");

  return {
    share,
    shareUrl: `/shared/dossier/${token}`,
  };
}

export async function revokeShare(shareId: number): Promise<void> {
  await db.update(dossierShares)
    .set({ revoked: true })
    .where(eq(dossierShares.id, shareId));
}

export async function validateShareToken(token: string): Promise<{
  valid: boolean;
  share?: DossierShareRow;
  reason?: string;
}> {
  const [share] = await db.select().from(dossierShares)
    .where(eq(dossierShares.shareToken, token))
    .limit(1);

  if (!share) return { valid: false, reason: "Token not found" };
  if (share.revoked) return { valid: false, reason: "Share has been revoked" };
  if (share.expiresAt && Number(share.expiresAt) < Date.now()) return { valid: false, reason: "Share has expired" };

  return { valid: true, share };
}

export async function recordShareAccess(token: string, action: ShareAction, ipAddress?: string, userAgent?: string): Promise<boolean> {
  const validation = await validateShareToken(token);
  if (!validation.valid || !validation.share) return false;

  const share = validation.share;

  // Update counters
  if (action === "view") {
    await db.update(dossierShares)
      .set({ viewCount: sql`${dossierShares.viewCount} + 1` })
      .where(eq(dossierShares.id, share.id));
  } else if (action === "download") {
    await db.update(dossierShares)
      .set({ downloadCount: sql`${dossierShares.downloadCount} + 1` })
      .where(eq(dossierShares.id, share.id));
  }

  // Log the access
  await logAccess(share.id, share.partnerId, action, ipAddress, userAgent);

  return true;
}

export async function listSharesForDossier(dossierId: number): Promise<DossierShareRow[]> {
  return await db.select().from(dossierShares)
    .where(eq(dossierShares.dossierId, dossierId))
    .orderBy(desc(dossierShares.createdAt));
}

// ── Access Logging ─────────────────────────────────────────────────

async function logAccess(shareId: number, partnerId: number | null, action: string, ipAddress?: string, userAgent?: string): Promise<void> {
  await db.insert(shareAccessLogs).values({
    shareId,
    partnerId: partnerId ?? null,
    action,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
  });
}

export async function getAccessLog(shareId: number): Promise<{
  shareId: number;
  entries: { action: string; timestamp: number; ipAddress: string | null }[];
}> {
  const logs = await db.select().from(shareAccessLogs)
    .where(eq(shareAccessLogs.shareId, shareId))
    .orderBy(desc(shareAccessLogs.timestamp))
    .limit(100);

  return {
    shareId,
    entries: logs.map((l: any) => ({
      action: l.action,
      timestamp: Number(l.timestamp),
      ipAddress: l.ipAddress,
    })),
  };
}

// ── Comments ───────────────────────────────────────────────────────

export async function addComment(shareId: number, partnerId: number, commentText: string, sectionId?: number): Promise<void> {
  await db.insert(externalComments).values({
    shareId,
    partnerId,
    sectionId: sectionId ?? null,
    commentText,
  });
}

export async function getCommentsForShare(shareId: number): Promise<{
  comments: { id: number; partnerId: number; sectionId: number | null; text: string; createdAt: number }[];
}> {
  const comments = await db.select().from(externalComments)
    .where(eq(externalComments.shareId, shareId))
    .orderBy(desc(externalComments.createdAt));

  return {
    comments: comments.map((c: any) => ({
      id: c.id,
      partnerId: c.partnerId,
      sectionId: c.sectionId,
      text: c.commentText,
      createdAt: Number(c.createdAt),
    })),
  };
}

// ── Redaction ──────────────────────────────────────────────────────

export async function addRedaction(input: RedactionInput): Promise<void> {
  await db.insert(dossierRedactions).values({
    dossierId: input.dossierId,
    sectionId: input.sectionId ?? null,
    redactedText: input.redactedText,
    reason: input.reason ?? null,
    createdBy: input.createdBy ?? "system",
  });
}

export async function getRedactionsForDossier(dossierId: number): Promise<{
  redactions: { id: number; sectionId: number | null; redactedText: string; reason: string | null }[];
}> {
  const redactions = await db.select().from(dossierRedactions)
    .where(eq(dossierRedactions.dossierId, dossierId));

  return {
    redactions: redactions.map((r: any) => ({
      id: r.id,
      sectionId: r.sectionId,
      redactedText: r.redactedText,
      reason: r.reason,
    })),
  };
}

export function applyRedactions(content: string, redactions: { redactedText: string }[]): string {
  let result = content;
  for (const r of redactions) {
    result = result.replace(new RegExp(r.redactedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "[REDACTED]");
  }
  return result;
}

// ── Stats ──────────────────────────────────────────────────────────

export async function getCollaborationStats(): Promise<{
  totalPartners: number;
  verifiedPartners: number;
  totalShares: number;
  activeShares: number;
  totalViews: number;
  totalDownloads: number;
  totalComments: number;
  totalRedactions: number;
  byPartnerType: Record<string, number>;
  recentShares: DossierShareRow[];
}> {
  const [partnerTotal] = await db.select({ c: count() }).from(externalPartners);
  const [partnerVerified] = await db.select({ c: count() }).from(externalPartners).where(eq(externalPartners.verificationStatus, "verified"));
  const [shareTotal] = await db.select({ c: count() }).from(dossierShares);
  const [shareActive] = await db.select({ c: count() }).from(dossierShares).where(eq(dossierShares.revoked, false));
  const [commentTotal] = await db.select({ c: count() }).from(externalComments);
  const [redactionTotal] = await db.select({ c: count() }).from(dossierRedactions);

  const [viewSum] = await db.select({ s: sql<number>`COALESCE(SUM(${dossierShares.viewCount}), 0)` }).from(dossierShares);
  const [dlSum] = await db.select({ s: sql<number>`COALESCE(SUM(${dossierShares.downloadCount}), 0)` }).from(dossierShares);

  const typeRows = await db.select({ type: externalPartners.partnerType, c: count() }).from(externalPartners).groupBy(externalPartners.partnerType);
  const byPartnerType: Record<string, number> = {};
  for (const r of typeRows) byPartnerType[r.type] = r.c;

  const recentShares = await db.select().from(dossierShares).orderBy(desc(dossierShares.createdAt)).limit(10);

  return {
    totalPartners: partnerTotal?.c ?? 0,
    verifiedPartners: partnerVerified?.c ?? 0,
    totalShares: shareTotal?.c ?? 0,
    activeShares: shareActive?.c ?? 0,
    totalViews: Number(viewSum?.s) || 0,
    totalDownloads: Number(dlSum?.s) || 0,
    totalComments: commentTotal?.c ?? 0,
    totalRedactions: redactionTotal?.c ?? 0,
    byPartnerType,
    recentShares,
  };
}
