/**
 * Jurisdiction Matcher: Local Intelligence Utility
 * 
 * This utility provides a clean, hardcoded Sovereign Registry for matching
 * search queries against known jurisdictions. It normalizes input and returns
 * matching jurisdiction data for store updates.
 */

export interface JurisdictionMatch {
  id: string;
  name: string;
  state: string;
  isSovereign: boolean;
  tier: "gold" | "silver" | "bronze" | "default";
  resources: string[];
}

/**
 * Local Sovereign Registry
 * Expanded with 20 new jurisdictions (3 Gold tier, 7 Silver tier, 10 Bronze tier)
 */
export const sovereignRegistry: Record<string, JurisdictionMatch> = {
  // Original Auburn jurisdictions
  "AL-AUBURN-001": {
    id: "AL-AUBURN-001",
    name: "Auburn, Alabama",
    state: "AL",
    isSovereign: true,
    tier: "gold",
    resources: ["Municipal Code Title 15", "Lee County Rules"],
  },
  "WA-AUBURN-002": {
    id: "WA-AUBURN-002",
    name: "Auburn, Washington",
    state: "WA",
    isSovereign: false,
    tier: "silver",
    resources: ["RCW Title 9A", "King County Procedures"],
  },

  // New Gold Tier Jurisdictions (3)
  "CA-SACRAMENTO-003": {
    id: "CA-SACRAMENTO-003",
    name: "Sacramento, California",
    state: "CA",
    isSovereign: true,
    tier: "gold",
    resources: ["California Penal Code", "Sacramento County Ordinances", "State Bar Rules"],
  },
  "NY-ALBANY-004": {
    id: "NY-ALBANY-004",
    name: "Albany, New York",
    state: "NY",
    isSovereign: true,
    tier: "gold",
    resources: ["New York Penal Law", "Albany County Rules", "Court of Appeals Procedures"],
  },
  "TX-AUSTIN-005": {
    id: "TX-AUSTIN-005",
    name: "Austin, Texas",
    state: "TX",
    isSovereign: true,
    tier: "gold",
    resources: ["Texas Penal Code", "Travis County Procedures", "State Bar of Texas Rules"],
  },

  // New Silver Tier Jurisdictions (7)
  "CO-DENVER-006": {
    id: "CO-DENVER-006",
    name: "Denver, Colorado",
    state: "CO",
    isSovereign: false,
    tier: "silver",
    resources: ["Colorado Revised Statutes", "Denver Revised Municipal Code"],
  },
  "IL-CHICAGO-007": {
    id: "IL-CHICAGO-007",
    name: "Chicago, Illinois",
    state: "IL",
    isSovereign: false,
    tier: "silver",
    resources: ["Illinois Criminal Code", "Chicago Municipal Code"],
  },
  "FL-MIAMI-008": {
    id: "FL-MIAMI-008",
    name: "Miami, Florida",
    state: "FL",
    isSovereign: false,
    tier: "silver",
    resources: ["Florida Statutes", "Miami-Dade County Code"],
  },
  "PA-PHILADELPHIA-009": {
    id: "PA-PHILADELPHIA-009",
    name: "Philadelphia, Pennsylvania",
    state: "PA",
    isSovereign: false,
    tier: "silver",
    resources: ["Pennsylvania Consolidated Statutes", "Philadelphia Code"],
  },
  "AZ-PHOENIX-010": {
    id: "AZ-PHOENIX-010",
    name: "Phoenix, Arizona",
    state: "AZ",
    isSovereign: false,
    tier: "silver",
    resources: ["Arizona Revised Statutes", "Phoenix City Code"],
  },
  "NV-LASVEGAS-011": {
    id: "NV-LASVEGAS-011",
    name: "Las Vegas, Nevada",
    state: "NV",
    isSovereign: false,
    tier: "silver",
    resources: ["Nevada Revised Statutes", "Clark County Code"],
  },
  "MA-BOSTON-012": {
    id: "MA-BOSTON-012",
    name: "Boston, Massachusetts",
    state: "MA",
    isSovereign: false,
    tier: "silver",
    resources: ["Massachusetts General Laws", "Boston Municipal Code"],
  },

  // New Bronze Tier Jurisdictions (10 regional nodes)
  "GA-ATLANTA-013": {
    id: "GA-ATLANTA-013",
    name: "Atlanta, Georgia",
    state: "GA",
    isSovereign: false,
    tier: "bronze",
    resources: ["Georgia Code", "Atlanta City Code"],
  },
  "NC-CHARLOTTE-014": {
    id: "NC-CHARLOTTE-014",
    name: "Charlotte, North Carolina",
    state: "NC",
    isSovereign: false,
    tier: "bronze",
    resources: ["North Carolina General Statutes", "Charlotte City Code"],
  },
  "OH-COLUMBUS-015": {
    id: "OH-COLUMBUS-015",
    name: "Columbus, Ohio",
    state: "OH",
    isSovereign: false,
    tier: "bronze",
    resources: ["Ohio Revised Code", "Columbus City Code"],
  },
  "MI-DETROIT-016": {
    id: "MI-DETROIT-016",
    name: "Detroit, Michigan",
    state: "MI",
    isSovereign: false,
    tier: "bronze",
    resources: ["Michigan Compiled Laws", "Detroit City Code"],
  },
  "MN-MINNEAPOLIS-017": {
    id: "MN-MINNEAPOLIS-017",
    name: "Minneapolis, Minnesota",
    state: "MN",
    isSovereign: false,
    tier: "bronze",
    resources: ["Minnesota Statutes", "Minneapolis City Code"],
  },
  "WI-MILWAUKEE-018": {
    id: "WI-MILWAUKEE-018",
    name: "Milwaukee, Wisconsin",
    state: "WI",
    isSovereign: false,
    tier: "bronze",
    resources: ["Wisconsin Statutes", "Milwaukee City Code"],
  },
  "MO-STLOUIS-019": {
    id: "MO-STLOUIS-019",
    name: "St. Louis, Missouri",
    state: "MO",
    isSovereign: false,
    tier: "bronze",
    resources: ["Missouri Revised Statutes", "St. Louis City Code"],
  },
  "TN-MEMPHIS-020": {
    id: "TN-MEMPHIS-020",
    name: "Memphis, Tennessee",
    state: "TN",
    isSovereign: false,
    tier: "bronze",
    resources: ["Tennessee Code Annotated", "Memphis City Code"],
  },
  "OK-OKLAHOMACITY-021": {
    id: "OK-OKLAHOMACITY-021",
    name: "Oklahoma City, Oklahoma",
    state: "OK",
    isSovereign: false,
    tier: "bronze",
    resources: ["Oklahoma Statutes", "Oklahoma City Code"],
  },
  "KY-LOUISVILLE-022": {
    id: "KY-LOUISVILLE-022",
    name: "Louisville, Kentucky",
    state: "KY",
    isSovereign: false,
    tier: "bronze",
    resources: ["Kentucky Revised Statutes", "Louisville Metro Code"],
  },
};

/**
 * Normalize a search query for matching
 * - Lowercase
 * - Trim whitespace
 * - Remove extra spaces
 */
function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/[,.]/g, " ").trim().replace(/\s+/g, " ");
}

/**
 * Match a search query against the Sovereign Registry
 * 
 * Returns the matching jurisdiction or null if no match found
 */
export function matchJurisdiction(query: string): JurisdictionMatch | null {
  if (!query || query.length === 0) {
    return null;
  }

  const normalized = normalizeQuery(query);

  // Try exact ID match first
  const exactId = Object.keys(sovereignRegistry).find((id) => normalizeQuery(id) === normalized);
  if (exactId) {
    return sovereignRegistry[exactId];
  }

  const queryTokens = normalized.split(" ").filter(Boolean);

  // Try partial matches against name, state, and ID tokens.
  // This supports punctuation variants like "Auburn Alabama" and "Auburn, AL".
  for (const [id, jurisdiction] of Object.entries(sovereignRegistry)) {
    const searchableTokens = normalizeQuery([
      id,
      jurisdiction.name,
      jurisdiction.state,
    ].join(" ")).split(" ");

    if (queryTokens.every((token) => searchableTokens.includes(token))) {
      return jurisdiction;
    }
  }

  return null;
}

/**
 * Get all jurisdictions from the registry
 */
export function getAllJurisdictions(): JurisdictionMatch[] {
  return Object.values(sovereignRegistry);
}
