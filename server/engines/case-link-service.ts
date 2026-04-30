/**
 * Engine 6: Case Link / Shareable Case Engine
 * 
 * Generates secure, tokenized links for sharing case summaries with:
 * - Attorneys
 * - Advocates
 * - Government agencies
 * - Other parties
 * 
 * Features:
 * - Configurable access levels (summary, detailed, full)
 * - Expiration dates
 * - View tracking and analytics
 * - Redaction controls (evidence, names, financials, documents)
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import crypto from "crypto";

export interface ShareableLink {
  id: number;
  caseId: number;
  token: string;
  accessLevel: string;
  expiresAt: number | null;
  viewCount: number;
  createdAt: number;
  lastViewedAt: number | null;
  permissions: SharePermissions;
}

export interface SharePermissions {
  allowEvidence: boolean;
  allowNames: boolean;
  allowFinancials: boolean;
  allowDocuments: boolean;
  allowPatternLinks: boolean;
}

export interface SharedCaseView {
  caseName: string;
  caseDescription: string | null;
  claimType: string | null;
  jurisdiction: string | null;
  accessLevel: string;
  permissions: SharePermissions;
  findings: any[];
  entities: any[];
  timeline: any[];
}

/**
 * Generate a shareable link for a case
 */
export async function generateShareableLink(
  caseId: number,
  generatedBy: number,
  accessLevel: string = "summary",
  expiresInDays: number | null = 30,
  permissions: Partial<SharePermissions> = {}
): Promise<ShareableLink> {
  const now = Date.now();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = expiresInDays ? now + (expiresInDays * 24 * 60 * 60 * 1000) : null;

  const perms: SharePermissions = {
    allowEvidence: permissions.allowEvidence ?? false,
    allowNames: permissions.allowNames ?? true,
    allowFinancials: permissions.allowFinancials ?? false,
    allowDocuments: permissions.allowDocuments ?? false,
    allowPatternLinks: permissions.allowPatternLinks ?? true,
  };

  // Create link
  await db.execute(sql`
    INSERT INTO shareable_case_links 
    (case_id, generated_by, access_level, token, expires_at, view_count, created_at)
    VALUES (${caseId}, ${generatedBy}, ${accessLevel}, ${token}, ${expiresAt}, 0, ${now})
  `);

  const linkResult = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
  const linkId = (linkResult[0] as unknown as any[])[0]?.id;

  // Create permissions
  await db.execute(sql`
    INSERT INTO case_share_permissions 
    (case_id, allow_evidence, allow_names, allow_financials, allow_documents, allow_pattern_links, created_at)
    VALUES (${caseId}, ${perms.allowEvidence}, ${perms.allowNames}, ${perms.allowFinancials}, 
            ${perms.allowDocuments}, ${perms.allowPatternLinks}, ${now})
  `);

  return {
    id: linkId,
    caseId,
    token,
    accessLevel,
    expiresAt,
    viewCount: 0,
    createdAt: now,
    lastViewedAt: null,
    permissions: perms,
  };
}

/**
 * Access a shared case via token
 */
export async function accessSharedCase(
  token: string,
  viewerIp: string | null = null,
  viewerUserAgent: string | null = null
): Promise<SharedCaseView | { error: string }> {
  const now = Date.now();

  // Find the link
  const linkResult = await db.execute(sql`
    SELECT id, case_id, access_level, expires_at, view_count
    FROM shareable_case_links
    WHERE token = ${token}
    LIMIT 1
  `);

  const link = (linkResult[0] as unknown as any[])[0];
  if (!link) return { error: "Invalid or expired link" };

  // Check expiration
  if (link.expires_at && Number(link.expires_at) < now) {
    return { error: "This link has expired" };
  }

  // Get permissions
  const permResult = await db.execute(sql`
    SELECT allow_evidence, allow_names, allow_financials, allow_documents, allow_pattern_links
    FROM case_share_permissions
    WHERE case_id = ${link.case_id}
    ORDER BY created_at DESC LIMIT 1
  `);

  const perm = (permResult[0] as unknown as any[])[0] || {};
  const permissions: SharePermissions = {
    allowEvidence: !!perm.allow_evidence,
    allowNames: perm.allow_names !== false,
    allowFinancials: !!perm.allow_financials,
    allowDocuments: !!perm.allow_documents,
    allowPatternLinks: perm.allow_pattern_links !== false,
  };

  // Get case data
  const caseResult = await db.execute(sql`
    SELECT name, description, pipelineType, domain
    FROM cases WHERE id = ${link.case_id} LIMIT 1
  `);

  const caseData = (caseResult[0] as unknown as any[])[0];
  if (!caseData) return { error: "Case not found" };

  // Get findings (if access level allows)
  let findings: any[] = [];
  if (link.access_level !== "summary") {
    const findingsResult = await db.execute(sql`
      SELECT id, title, severity, status, summary
      FROM findings WHERE caseId = ${link.case_id}
      ORDER BY severity DESC LIMIT 20
    `);
    findings = (findingsResult[0] as unknown as any[]).map(f => ({
      title: f.title,
      severity: f.severity,
      status: f.status,
      summary: permissions.allowNames ? f.summary : "[Redacted]",
    }));
  }

  // Get entities (if permitted)
  let entitiesData: any[] = [];
  if (permissions.allowNames) {
    const entitiesResult = await db.execute(sql`
      SELECT name, type, description FROM entities 
      WHERE caseId = ${link.case_id} LIMIT 30
    `);
    entitiesData = (entitiesResult[0] as unknown as any[]).map(e => ({
      name: e.name,
      type: e.type,
      description: e.description,
    }));
  }

  // Record view
  await db.execute(sql`
    INSERT INTO shareable_case_views (link_id, viewer_ip, viewer_user_agent, viewer_type, viewed_at)
    VALUES (${link.id}, ${viewerIp}, ${viewerUserAgent}, 'external', ${now})
  `);

  // Update view count
  await db.execute(sql`
    UPDATE shareable_case_links 
    SET view_count = view_count + 1, last_viewed_at = ${now}
    WHERE id = ${link.id}
  `);

  return {
    caseName: caseData.name,
    caseDescription: caseData.description,
    claimType: caseData.pipelineType,
    jurisdiction: caseData.domain,
    accessLevel: link.access_level,
    permissions,
    findings,
    entities: entitiesData,
    timeline: [],
  };
}

/**
 * Get all shareable links for a case
 */
export async function getCaseShareLinks(caseId: number): Promise<ShareableLink[]> {
  const results = await db.execute(sql`
    SELECT id, case_id, access_level, token, expires_at, view_count, created_at, last_viewed_at
    FROM shareable_case_links
    WHERE case_id = ${caseId}
    ORDER BY created_at DESC
  `);

  return (results[0] as unknown as any[]).map(r => ({
    id: r.id,
    caseId: r.case_id,
    token: r.token,
    accessLevel: r.access_level,
    expiresAt: r.expires_at ? Number(r.expires_at) : null,
    viewCount: Number(r.view_count) || 0,
    createdAt: Number(r.created_at),
    lastViewedAt: r.last_viewed_at ? Number(r.last_viewed_at) : null,
    permissions: { allowEvidence: false, allowNames: true, allowFinancials: false, allowDocuments: false, allowPatternLinks: true },
  }));
}

/**
 * Revoke a shareable link
 */
export async function revokeShareableLink(linkId: number): Promise<boolean> {
  await db.execute(sql`
    UPDATE shareable_case_links SET expires_at = ${Date.now() - 1000} WHERE id = ${linkId}
  `);
  return true;
}

/**
 * Get share analytics for a case
 */
export async function getShareAnalytics(caseId: number): Promise<{
  totalLinks: number;
  activeLinks: number;
  totalViews: number;
  recentViews: any[];
}> {
  const now = Date.now();

  const links = await db.execute(sql`
    SELECT id, expires_at, view_count FROM shareable_case_links WHERE case_id = ${caseId}
  `);

  const totalLinks = (links[0] as unknown as any[]).length;
  const activeLinks = (links[0] as unknown as any[]).filter(l => !l.expires_at || Number(l.expires_at) > now).length;
  const totalViews = (links[0] as unknown as any[]).reduce((sum: number, l: any) => sum + (Number(l.view_count) || 0), 0);

  const recentViews = await db.execute(sql`
    SELECT sv.viewed_at, sv.viewer_type, sv.viewer_ip, scl.access_level
    FROM shareable_case_views sv
    JOIN shareable_case_links scl ON scl.id = sv.link_id
    WHERE scl.case_id = ${caseId}
    ORDER BY sv.viewed_at DESC
    LIMIT 20
  `);

  return {
    totalLinks,
    activeLinks,
    totalViews,
    recentViews: (recentViews[0] as unknown as any[]).map(v => ({
      viewedAt: Number(v.viewed_at),
      viewerType: v.viewer_type,
      accessLevel: v.access_level,
    })),
  };
}
