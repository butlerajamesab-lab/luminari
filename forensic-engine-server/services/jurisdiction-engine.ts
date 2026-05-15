import pnwRegistryRaw from "../data/pnw-registry-pack.json";
import waOversightRaw from "../data/wa-oversight.json";
import waResourcesRaw from "../data/wa-resources.json";
// Normalize imported JSON to expected shape
const pnwRegistry: { tribes: any[] } = {
  tribes: (pnwRegistryRaw as any).states?.flatMap((s: any) => s.tribes || []) || []
};
const waOversight: { oversight_bodies: any[] } = {
  oversight_bodies: (waOversightRaw as any).oversight_bodies || []
};
const waResources: { resources: any[] } = {
  resources: (waResourcesRaw as any).resources || []
};

/**
 * Jurisdiction Engine: Sovereign Intelligence Layer
 * 
 * This engine implements the "Sovereign Override" logic that routes cases
 * based on tribal territories, federal oversight bodies, and jurisdictional hierarchy.
 * 
 * Hierarchy: Federal > Tribal > State > County > City > Private
 */

export interface JurisdictionSignal {
  zipCode?: string;
  employerName?: string;
  agencyName?: string;
  tribalEnrollmentStatus?: "enrolled" | "not_enrolled" | "unknown";
  location?: string;
}

export interface JurisdictionRoute {
  jurisdictionType: "federal" | "tribal" | "state" | "county" | "city" | "private";
  sovereignTerritory?: string;
  tribalNation?: string;
  governingCode: "icwa" | "tribal_code" | "rcw" | "federal_statute";
  oversightBody?: string;
  resources: string[];
  badgeVariant: "default" | "destructive" | "secondary" | "outline" | "gold";
  explanation: string;
}

/**
 * Detect if a location is within tribal territory
 */
function detectTribalTerritory(signal: JurisdictionSignal): { tribalNation: string; territory: string } | null {
  if (!signal.zipCode && !signal.location) return null;

  const searchString = (signal.location || signal.zipCode || "").toLowerCase();

  // Check against PNW Registry tribal territories
  for (const tribe of pnwRegistry.tribes || []) {
    const territories = tribe.territories || [];
    for (const territory of territories) {
      const territoryName = territory.name?.toLowerCase() || "";
      const cities = territory.cities || [];

      // Check zip code or location name
      if (signal.zipCode && territory.zip_codes?.includes(signal.zipCode)) {
        return {
          tribalNation: tribe.name,
          territory: territory.name,
        };
      }

      // Check city names
      for (const city of cities) {
        if (searchString.includes(city.toLowerCase())) {
          return {
            tribalNation: tribe.name,
            territory: territory.name,
          };
        }
      }

      // Direct territory name match
      if (searchString.includes(territoryName)) {
        return {
          tribalNation: tribe.name,
          territory: territory.name,
        };
      }
    }
  }

  return null;
}

/**
 * Detect if case involves federal oversight or BIA jurisdiction
 */
function detectFederalOversight(signal: JurisdictionSignal): { body: string; jurisdiction: string } | null {
  if (!signal.agencyName && !signal.employerName) return null;

  const searchString = (signal.agencyName || signal.employerName || "").toLowerCase();

  // Check against WA oversight bodies
  for (const body of waOversight.oversight_bodies || []) {
    const bodyName = body.name?.toLowerCase() || "";
    const aliases = body.aliases || [];

    if (searchString.includes(bodyName)) {
      return {
        body: body.name,
        jurisdiction: body.jurisdiction_type,
      };
    }

    for (const alias of aliases) {
      if (searchString.includes(alias.toLowerCase())) {
        return {
          body: body.name,
          jurisdiction: body.jurisdiction_type,
        };
      }
    }
  }

  return null;
}

/**
 * Match resources based on jurisdiction and issue type
 */
function matchResources(
  jurisdictionType: string,
  tribalNation?: string,
  issueType?: string
): string[] {
  const matchedResources: string[] = [];

  for (const resource of waResources.resources || []) {
    const resourceJurisdictions = resource.jurisdictions || [];
    const resourceIssues = resource.issue_types || [];

    // Tribal resources take priority
    if (tribalNation && resourceJurisdictions.includes("tribal")) {
      if (!issueType || resourceIssues.includes(issueType)) {
        matchedResources.push(resource.name);
      }
    }

    // State resources
    if (jurisdictionType === "state" && resourceJurisdictions.includes("state")) {
      if (!issueType || resourceIssues.includes(issueType)) {
        matchedResources.push(resource.name);
      }
    }

    // Federal resources
    if (jurisdictionType === "federal" && resourceJurisdictions.includes("federal")) {
      if (!issueType || resourceIssues.includes(issueType)) {
        matchedResources.push(resource.name);
      }
    }
  }

  return matchedResources;
}

/**
 * Main routing logic: Determine jurisdiction and apply sovereign precedence
 */
export function routeCase(signal: JurisdictionSignal): JurisdictionRoute {
  // Check for tribal territory first (highest priority after federal)
  const tribalMatch = detectTribalTerritory(signal);
  if (tribalMatch) {
    const resources = matchResources("tribal", tribalMatch.tribalNation, signal.agencyName);

    return {
      jurisdictionType: "tribal",
      sovereignTerritory: tribalMatch.territory,
      tribalNation: tribalMatch.tribalNation,
      governingCode: "tribal_code",
      resources,
      badgeVariant: "gold",
      explanation: `This case involves ${tribalMatch.tribalNation} territory. Tribal law and ICWA provisions may apply. Prioritize tribal legal resources and consult tribal courts.`,
    };
  }

  // Check for federal oversight
  const federalMatch = detectFederalOversight(signal);
  if (federalMatch && federalMatch.jurisdiction === "federal") {
    const resources = matchResources("federal", undefined, signal.agencyName);

    return {
      jurisdictionType: "federal",
      oversightBody: federalMatch.body,
      governingCode: "federal_statute",
      resources,
      badgeVariant: "default",
      explanation: `This case involves federal oversight under ${federalMatch.body}. Federal statutes and regulations apply.`,
    };
  }

  // Default to Washington State
  const resources = matchResources("state", undefined, signal.agencyName);

  return {
    jurisdictionType: "state",
    governingCode: "rcw",
    resources,
    badgeVariant: "secondary",
    explanation: `This case is governed by Washington State law (RCW). State agencies and courts have jurisdiction.`,
  };
}

/**
 * Apply sovereign override to comparison matrix rows
 * 
 * This function modifies the governing rules based on jurisdictional routing
 */
export function applySovereignOverride(
  comparisonRows: any[],
  jurisdictionRoute: JurisdictionRoute
): any[] {
  return comparisonRows.map((row) => {
    // If tribal jurisdiction, override with tribal code
    if (jurisdictionRoute.jurisdictionType === "tribal") {
      return {
        ...row,
        governingRule: `${row.governingRule} (Tribal Code: ${jurisdictionRoute.tribalNation})`,
        ruleSource: `tribal_${jurisdictionRoute.tribalNation?.toLowerCase().replace(/\s+/g, "_")}`,
        matchType: "supported", // Tribal law typically supports indigenous rights
        sovereignBadge: true,
        badgeVariant: "gold",
      };
    }

    // If federal jurisdiction, override with federal statute
    if (jurisdictionRoute.jurisdictionType === "federal") {
      return {
        ...row,
        governingRule: `${row.governingRule} (Federal: ${jurisdictionRoute.oversightBody})`,
        ruleSource: `federal_${jurisdictionRoute.oversightBody?.toLowerCase().replace(/\s+/g, "_")}`,
        badgeVariant: "default",
      };
    }

    return row;
  });
}

/**
 * Generate explanation text for the user
 */
export function generateJurisdictionExplanation(route: JurisdictionRoute): string {
  let explanation = route.explanation;

  if (route.resources.length > 0) {
    explanation += `\n\nRecommended Resources:\n`;
    route.resources.forEach((resource, idx) => {
      explanation += `${idx + 1}. ${resource}\n`;
    });
  }

  return explanation;
}
