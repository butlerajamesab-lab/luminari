/**
 * PHOENIX DETECTION ENGINE
 * 
 * Real-time fraud pattern detection using raw SQL
 * Detects when a dissolved/suspended entity is reborn with similar characteristics
 * 
 * Pattern: Death → Rebirth → Activity
 * - Death: Entity suspended/debarred/dissolved
 * - Rebirth: New entity at same address/phone/agent
 * - Activity: New entity applies for same permits/grants
 */

import mysql from 'mysql2/promise';

interface EntityData {
  id?: number;
  name: string;
  address?: string;
  phone?: string;
  registeredAgent?: string;
  industry?: string;
  naicsCode?: string;
  status?: string;
  jurisdiction?: string;
  createdAt?: number;
}

interface PhoenixSignal {
  signalType: "PHOENIX_ENTITY";
  confidenceScore: number;
  linkedEntities: number[];
  matchReasons: string[];
  suspiciousPattern: string;
  regulatoryAnchor?: string;
}

// Database connection pool
let pool: mysql.Pool | null = null;

async function getPool(): Promise<mysql.Pool> {
  if (!pool) {
    pool = mysql.createPool({
      host: 'gateway04.us-east-1.prod.aws.tidbcloud.com',
      port: 4000,
      user: '2jhK1AfHyk6mXSq.root',
      password: '2k5Lq94U8voiLkatA3uZ',
      database: 'luminari_registry',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

/**
 * Similarity scoring for entity names
 * Returns 0-100 score
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = (name1 || "").toLowerCase().trim();
  const n2 = (name2 || "").toLowerCase().trim();

  if (n1 === n2) return 100;
  if (!n1 || !n2) return 0;

  // Check for substring matches (common in rebirth patterns)
  if (n1.includes(n2) || n2.includes(n1)) return 85;

  // Levenshtein-like distance (simplified)
  const longer = n1.length > n2.length ? n1 : n2;
  const shorter = n1.length > n2.length ? n2 : n1;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer[i] === shorter[i]) matches++;
  }

  return Math.round((matches / longer.length) * 100);
}

/**
 * Extract last name from registered agent
 */
function extractLastName(agentName: string): string {
  if (!agentName) return "";
  const parts = agentName.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Find related entities (potential "dead" nodes)
 */
async function findRelatedEntities(entity: EntityData): Promise<EntityData[]> {
  const pool = await getPool();
  const relatedEntities: EntityData[] = [];

  try {
    // Query for entities at same address
    if (entity.address) {
      const query = `
        SELECT id, name, description, type, createdAt 
        FROM entities 
        WHERE description LIKE ? AND id != ? 
        LIMIT 10
      `;
      const [rows] = await pool.execute(query, [`%${entity.address}%`, entity.id || 0]);
      relatedEntities.push(...(rows as any[]).map(row => ({
        id: row.id,
        name: row.name,
        address: entity.address,
        industry: row.type,
        createdAt: row.createdAt,
      })));
    }

    // Query for entities with similar names
    if (entity.name) {
      const query = `
        SELECT id, name, description, type, createdAt 
        FROM entities 
        WHERE name LIKE ? AND id != ? 
        LIMIT 10
      `;
      const searchTerm = entity.name.split(' ')[0]; // First word
      const [rows] = await pool.execute(query, [`%${searchTerm}%`, entity.id || 0]);
      relatedEntities.push(...(rows as any[]).map(row => ({
        id: row.id,
        name: row.name,
        address: row.description,
        industry: row.type,
        createdAt: row.createdAt,
      })));
    }

    // Deduplicate
    const seen = new Set<number>();
    return relatedEntities.filter((e) => {
      if (seen.has(e.id!)) return false;
      seen.add(e.id!);
      return true;
    });
  } catch (error) {
    console.error(`[Phoenix] Error finding related entities:`, error);
    return [];
  }
}

/**
 * Check if entity status indicates "death" (suspension, debarment, dissolution)
 */
function isDeadStatus(description?: string): boolean {
  if (!description) return false;
  const deadStatuses = [
    "suspended",
    "debarred",
    "dissolved",
    "revoked",
    "inactive",
    "insolvent",
    "bankruptcy",
    "debt_recovery",
  ];
  const desc = description.toLowerCase();
  return deadStatuses.some(status => desc.includes(status));
}

/**
 * Calculate temporal proximity (days between entity creation)
 */
function calculateTemporalProximity(
  newEntityTime: number,
  relatedEntityTime: number
): number {
  if (!newEntityTime || !relatedEntityTime) return 0;
  const daysDiff = Math.abs(newEntityTime - relatedEntityTime) / (1000 * 60 * 60 * 24);
  return daysDiff;
}

/**
 * Main Phoenix detection function
 * Called on every entity creation
 */
export async function runPhoenixDetection(entity: EntityData): Promise<PhoenixSignal | null> {
  console.log(`[Phoenix] Starting detection for entity: ${entity.name}`);

  // Find related entities
  const relatedEntities = await findRelatedEntities(entity);
  console.log(`[Phoenix] Found ${relatedEntities.length} related entities`);

  if (relatedEntities.length === 0) {
    console.log(`[Phoenix] No related entities found, no signal`);
    return null;
  }

  // Check for Phoenix pattern
  const matches: { entity: EntityData; reasons: string[]; score: number }[] = [];

  for (const relatedEntity of relatedEntities) {
    const reasons: string[] = [];
    let matchScore = 0;

    // Check 1: Is related entity in "dead" status?
    if (isDeadStatus(relatedEntity.address)) {
      reasons.push(`Related entity status indicates suspension/debarment`);
      matchScore += 40;
    }

    // Check 2: Address match
    if (entity.address && relatedEntity.address && entity.address === relatedEntity.address) {
      reasons.push("Same physical address");
      matchScore += 30;
    }

    // Check 3: Industry match
    if (entity.industry && relatedEntity.industry && entity.industry === relatedEntity.industry) {
      reasons.push(`Same industry: ${entity.industry}`);
      matchScore += 35;
    }

    // Check 4: Temporal proximity (within 90 days)
    const daysDiff = calculateTemporalProximity(entity.createdAt || 0, relatedEntity.createdAt || 0);
    if (daysDiff < 90) {
      reasons.push(`Created within ${Math.round(daysDiff)} days of related entity`);
      matchScore += 15;
    }

    // Check 5: Name similarity
    const nameSim = calculateNameSimilarity(entity.name, relatedEntity.name);
    if (nameSim > 60) {
      reasons.push(`Name similarity: ${nameSim}%`);
      matchScore += 20;
    }

    // Only flag if we have 2+ reasons and score > 50
    if (reasons.length >= 2 && matchScore > 50) {
      matches.push({ entity: relatedEntity, reasons, score: matchScore });
    }
  }

  if (matches.length === 0) {
    console.log(`[Phoenix] No Phoenix patterns detected`);
    return null;
  }

  // Build signal
  const topMatch = matches.sort((a, b) => b.score - a.score)[0];
  const linkedEntityIds = [topMatch.entity.id || 0];

  const signal: PhoenixSignal = {
    signalType: "PHOENIX_ENTITY",
    confidenceScore: Math.min(100, topMatch.score),
    linkedEntities: linkedEntityIds,
    matchReasons: topMatch.reasons,
    suspiciousPattern: `New entity "${entity.name}" appears to be rebirth of suspended entity "${topMatch.entity.name}"`,
    regulatoryAnchor: `RCW 18.27.020`, // Unregistered/Masked Contracting (Washington example)
  };

  console.log(`[Phoenix] ✅ Signal detected:`, signal);
  return signal;
}

/**
 * Emit signal to database (detected_signals table)
 */
export async function emitPhoenixSignal(signal: PhoenixSignal, entityId: number): Promise<void> {
  const pool = await getPool();

  try {
    // Generate signal ID
    const signalId = `PHOENIX-${entityId}-${Date.now()}`;
    const now = Date.now();
    
    const query = `
      INSERT INTO detected_signals (
        signal_id,
        signal_type,
        dataset_id,
        detection_timestamp,
        confidence_score,
        entity_id,
        severity_level,
        plain_language_explanation,
        escalation_status,
        created_at,
        updated_at
      ) VALUES (
        ?,
        ?,
        'PHOENIX_DETECTOR',
        ?,
        ?,
        ?,
        ?,
        ?,
        'analyst_review',
        ?,
        ?
      )
    `;

    const severityMap: { [key: number]: string } = {
      0: 'low',
      25: 'low',
      50: 'medium',
      75: 'high',
      100: 'critical'
    };
    
    const severity = Object.entries(severityMap).reduce((prev, [score, level]) => {
      return signal.confidenceScore >= parseInt(score) ? level : prev;
    }, 'low');

    await pool.execute(query, [
      signalId,
      signal.signalType,
      now,
      signal.confidenceScore,
      entityId.toString(),
      severity,
      signal.suspiciousPattern,
      now,
      now,
    ]);

    console.log(`[Phoenix] ✅ Signal emitted to detected_signals for entity ${entityId} with confidence ${signal.confidenceScore}%`);
  } catch (error) {
    console.error(`[Phoenix] ❌ Failed to emit signal:`, error);
    throw error;
  }
}
