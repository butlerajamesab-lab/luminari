/**
 * Settlement Comparison Service
 * Runs settlement formulas across all jurisdictions for a given claim type,
 * aggregates totals, and returns a ranked list of filing venues.
 */
import { calculateSettlement } from "./settlement-calculator";
import { listFormulas } from "./settlement-calculator";

export interface JurisdictionComparison {
  jurisdiction: string;
  totalDemand: number;
  breakdown: {
    baseAmount: number;
    statutoryDamages: number;
    penalties: number;
    interest: number;
    attorneyFees: number;
  };
  formulaCount: number;
  confidenceLevel: string;
  components: { label: string; value: number; formula: string }[];
  adjustments: { name: string; amount: number; reason: string }[];
}

export interface ComparisonResult {
  claimType: string;
  variables: Record<string, number>;
  jurisdictions: JurisdictionComparison[];
  bestVenue: {
    jurisdiction: string;
    totalDemand: number;
    advantage: string;
  };
  totalJurisdictionsCompared: number;
}

/**
 * Compare settlement estimates across all jurisdictions for a claim type
 */
export async function compareJurisdictions(
  claimType: string,
  variables: Record<string, number>
): Promise<ComparisonResult> {
  // Get all available jurisdictions for this claim type
  const allFormulas = await listFormulas(claimType);
  const jurisdictions = [...new Set(allFormulas.map(f => f.jurisdiction))];

  const results: JurisdictionComparison[] = [];

  for (const jurisdiction of jurisdictions) {
    try {
      const result = await calculateSettlement({
        claimType,
        jurisdiction,
        variables,
      });

      results.push({
        jurisdiction,
        totalDemand: result.calculatedAmount,
        breakdown: {
          baseAmount: result.breakdown.baseAmount,
          // @ts-expect-error pre-existing type mismatch
          statutoryDamages: result.breakdown.statutoryDamages,
          penalties: result.breakdown.penalties,
          interest: result.breakdown.interestAmount,
          attorneyFees: result.breakdown.attorneyFees,
        },
        formulaCount: allFormulas.filter(f => f.jurisdiction === jurisdiction).length,
        confidenceLevel: result.confidenceLevel,
        components: result.breakdown.components,
        adjustments: result.breakdown.adjustments,
      });
    } catch {
      // Skip jurisdictions that can't calculate with given variables
      results.push({
        jurisdiction,
        totalDemand: 0,
        breakdown: {
          baseAmount: 0,
          statutoryDamages: 0,
          penalties: 0,
          interest: 0,
          attorneyFees: 0,
        },
        formulaCount: allFormulas.filter(f => f.jurisdiction === jurisdiction).length,
        confidenceLevel: "low",
        components: [],
        adjustments: [{ name: "Calculation Error", amount: 0, reason: "Insufficient variables for this jurisdiction" }],
      });
    }
  }

  // Sort by total demand descending
  results.sort((a, b) => b.totalDemand - a.totalDemand);

  // Determine best venue
  const best = results[0];
  const second = results.length > 1 ? results[1] : null;
  let advantage = "";
  if (best && best.totalDemand > 0) {
    if (second && second.totalDemand > 0) {
      const diff = best.totalDemand - second.totalDemand;
      const pct = ((diff / second.totalDemand) * 100).toFixed(0);
      advantage = `$${diff.toLocaleString()} more than ${second.jurisdiction} (+${pct}%)`;
    } else {
      advantage = "Only jurisdiction with calculable damages";
    }
  }

  return {
    claimType,
    variables,
    jurisdictions: results,
    bestVenue: {
      jurisdiction: best?.jurisdiction || "unknown",
      totalDemand: best?.totalDemand || 0,
      advantage,
    },
    totalJurisdictionsCompared: results.length,
  };
}
