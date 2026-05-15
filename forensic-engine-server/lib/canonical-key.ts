/**
 * Canonical key generation utilities for normalized identifiers
 * Ensures deterministic, stable keys across the system
 */

export function generateCanonicalKey(
  domain: string,
  identifier: string,
  version: number = 1
): string {
  const normalized = identifier
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  
  return `${domain}:${normalized}:v${version}`;
}

export function parseCanonicalKey(key: string): {
  domain: string;
  identifier: string;
  version: number;
} | null {
  const match = key.match(/^([^:]+):([^:]+):v(\d+)$/);
  if (!match) return null;
  
  return {
    domain: match[1],
    identifier: match[2],
    version: parseInt(match[3], 10),
  };
}

/**
 * Generate natural key for statute
 */
export function generateStatuteKey(
  jurisdiction: string,
  statute_code: string,
  section: string
): string {
  return generateCanonicalKey(
    `statute:${jurisdiction}`,
    `${statute_code}:${section}`
  );
}

/**
 * Generate natural key for doctrine
 */
export function generateDoctrineKey(
  doctrine_name: string,
  rule_id: string
): string {
  return generateCanonicalKey("doctrine", `${doctrine_name}:${rule_id}`);
}

/**
 * Generate natural key for workflow
 */
export function generateWorkflowKey(
  jurisdiction: string,
  workflow_code: string
): string {
  return generateCanonicalKey(`workflow:${jurisdiction}`, workflow_code);
}

/**
 * Generate natural key for agency
 */
export function generateAgencyKey(
  jurisdiction: string,
  agency_code: string
): string {
  return generateCanonicalKey(`agency:${jurisdiction}`, agency_code);
}
