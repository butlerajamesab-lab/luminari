/**
 * LumenSend — Database Helpers
 *
 * CRUD operations for the LumenSend document generation & delivery module.
 * Generates pre-filled letters, complaints, appeals, and applications
 * from Luminari's registry data.
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "./db";
import {
  lumensendDrafts, lumensendTemplates,
  type LumensendDraft, type InsertLumensendDraft,
  type LumensendTemplate, type InsertLumensendTemplate,
} from "../drizzle/schema";

// ─── Templates ───

export async function listTemplates(documentType?: string) {
  if (documentType) {
    return db.select().from(lumensendTemplates)
      .where(eq(lumensendTemplates.documentType, documentType as any));
  }
  return db.select().from(lumensendTemplates);
}

export async function getTemplate(id: number) {
  const rows = await db.select().from(lumensendTemplates).where(eq(lumensendTemplates.id, id));
  return rows[0] ?? null;
}

export async function createTemplate(data: InsertLumensendTemplate) {
  const result = await db.insert(lumensendTemplates).values(data);
  return { id: Number(result[0].insertId) };
}

// ─── Drafts ───

export async function listDrafts(userId: number, opts?: { status?: string; limit?: number }) {
  const conditions = [eq(lumensendDrafts.userId, userId)];
  if (opts?.status) {
    conditions.push(eq(lumensendDrafts.status, opts.status as any));
  }
  return db.select().from(lumensendDrafts)
    .where(and(...conditions))
    .orderBy(desc(lumensendDrafts.updatedAt))
    .limit(opts?.limit ?? 50);
}

export async function getDraft(id: number, userId: number) {
  const rows = await db.select().from(lumensendDrafts)
    .where(and(eq(lumensendDrafts.id, id), eq(lumensendDrafts.userId, userId)));
  return rows[0] ?? null;
}

export async function createDraft(data: InsertLumensendDraft) {
  const result = await db.insert(lumensendDrafts).values(data);
  return { id: Number(result[0].insertId) };
}

export async function updateDraft(id: number, userId: number, data: Partial<InsertLumensendDraft>) {
  await db.update(lumensendDrafts)
    .set({ ...data, updatedAt: Date.now() })
    .where(and(eq(lumensendDrafts.id, id), eq(lumensendDrafts.userId, userId)));
  return getDraft(id, userId);
}

export async function deleteDraft(id: number, userId: number) {
  await db.delete(lumensendDrafts)
    .where(and(eq(lumensendDrafts.id, id), eq(lumensendDrafts.userId, userId)));
}

export async function markDraftSent(id: number, userId: number, method: "email" | "print" | "copy") {
  await db.update(lumensendDrafts)
    .set({
      status: "sent" as any,
      sentAt: Date.now(),
      sentMethod: method,
      updatedAt: Date.now(),
    })
    .where(and(eq(lumensendDrafts.id, id), eq(lumensendDrafts.userId, userId)));
  return getDraft(id, userId);
}

export async function getDraftCount(userId: number) {
  const rows = await db.select({ count: sql<number>`count(*)` })
    .from(lumensendDrafts)
    .where(eq(lumensendDrafts.userId, userId));
  return rows[0]?.count ?? 0;
}
