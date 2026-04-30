/**
 * Case Service
 * 
 * Manage user-owned case data in PostgreSQL luminari_registry database
 * 
 * All operations:
 * - read/write to Case tables only (luminari_cases, luminari_case_notes, etc.)
 * - never touch Registry tables
 * - store references to registry truth, not copies
 * - preserve user data ownership
 * 
 * Aligned with Kernel Truth:
 * - User data sovereignty
 * - Full auditability
 * - Expungement capability
 */
import { pool } from "../_core/pg-pool";

export interface CaseData {
  id: number;
  user_id: number | null;
  jurisdiction_id: number;
  category: string;
  selected_workflow_id: number;
  status: string;
  created_at: number;
  updated_at: number;
}

/**
 * Create a new case
 */
export async function createCase(data: {
  user_id?: number | null;
  jurisdiction_id: number;
  category: string;
  selected_workflow_id: number;
}): Promise<CaseData> {
  const now = Date.now();
  
  const query = `
    INSERT INTO luminari_cases (
      user_id,
      jurisdiction_id,
      category,
      selected_workflow_id,
      status,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;

  const result = await pool.query(query, [
    data.user_id || null,
    data.jurisdiction_id,
    data.category,
    data.selected_workflow_id,
    'active',
    now,
    now,
  ]);

  return result.rows[0] as CaseData;
}

/**
 * Get case by ID
 */
export async function getCaseById(caseId: number): Promise<CaseData | null> {
  const query = `
    SELECT * FROM luminari_cases
    WHERE id = $1;
  `;

  const result = await pool.query(query, [caseId]);
  return result.rows[0] || null;
}

/**
 * Get user's cases
 */
export async function getUserCases(userId: number): Promise<CaseData[]> {
  const query = `
    SELECT * FROM luminari_cases
    WHERE user_id = $1
    ORDER BY created_at DESC;
  `;

  const result = await pool.query(query, [userId]);
  return result.rows as CaseData[];
}

/**
 * Add note to case
 */
export async function addCaseNote(
  caseId: number,
  content: string
): Promise<{ id: number; case_id: number; content: string; created_at: number }> {
  const now = Date.now();

  const query = `
    INSERT INTO luminari_case_notes (
      case_id,
      content,
      created_at
    ) VALUES ($1, $2, $3)
    RETURNING *;
  `;

  const result = await pool.query(query, [caseId, content, now]);
  return result.rows[0];
}

/**
 * Get case notes
 */
export async function getCaseNotes(
  caseId: number
): Promise<{ id: number; case_id: number; content: string; created_at: number }[]> {
  const query = `
    SELECT * FROM luminari_case_notes
    WHERE case_id = $1
    ORDER BY created_at DESC;
  `;

  const result = await pool.query(query, [caseId]);
  return result.rows;
}

/**
 * Record case action
 */
export async function recordCaseAction(
  caseId: number,
  actionType: string,
  metadata: Record<string, any>
): Promise<{ id: number; case_id: number; action_type: string; metadata: Record<string, any>; created_at: number }> {
  const now = Date.now();

  const query = `
    INSERT INTO luminari_case_actions (
      case_id,
      action_type,
      metadata,
      created_at
    ) VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;

  const result = await pool.query(query, [caseId, actionType, JSON.stringify(metadata), now]);
  return result.rows[0];
}

/**
 * Record case event
 */
export async function recordCaseEvent(
  caseId: number,
  eventType: string,
  eventData: Record<string, any>
): Promise<{ id: number; case_id: number; event_type: string; event_data: Record<string, any>; created_at: number }> {
  const now = Date.now();

  const query = `
    INSERT INTO luminari_case_events (
      case_id,
      event_type,
      event_data,
      created_at
    ) VALUES ($1, $2, $3, $4)
    RETURNING *;
  `;

  const result = await pool.query(query, [caseId, eventType, JSON.stringify(eventData), now]);
  return result.rows[0];
}

/**
 * Get case timeline (events + actions + notes)
 */
export async function getCaseTimeline(caseId: number): Promise<any[]> {
  const query = `
    (SELECT 'event' as type, event_type as description, event_data as data, created_at FROM luminari_case_events WHERE case_id = $1)
    UNION ALL
    (SELECT 'action', action_type, metadata, created_at FROM luminari_case_actions WHERE case_id = $1)
    UNION ALL
    (SELECT 'note', 'note_added', jsonb_build_object('content', content), created_at FROM luminari_case_notes WHERE case_id = $1)
    ORDER BY created_at DESC;
  `;

  const result = await pool.query(query, [caseId]);
  return result.rows;
}

/**
 * Update case status
 */
export async function updateCaseStatus(
  caseId: number,
  status: string
): Promise<CaseData> {
  const now = Date.now();

  const query = `
    UPDATE luminari_cases
    SET status = $1, updated_at = $2
    WHERE id = $3
    RETURNING *;
  `;

  const result = await pool.query(query, [status, now, caseId]);
  return result.rows[0] as CaseData;
}

/**
 * Mark case for expungement (user data deletion)
 */
export async function markCaseForExpungement(caseId: number): Promise<void> {
  // For now, just mark as archived
  // Full expungement would require additional compliance workflows
  await updateCaseStatus(caseId, 'archived');
}

/**
 * Verify case ownership
 */
export async function verifyCaseOwnership(
  caseId: number,
  userId: number
): Promise<boolean> {
  const query = `
    SELECT 1 FROM luminari_cases
    WHERE id = $1 AND user_id = $2;
  `;

  const result = await pool.query(query, [caseId, userId]);
  return result.rows.length > 0;
}



// ============================================================
