/**
 * Settlement Calculator Engine
 * 
 * Implements 67+ settlement formulas across claim types:
 * - Wage theft (WA, CA, NY, TX, Federal)
 * - Housing discrimination
 * - Consumer fraud
 * - Debt collection harassment
 * - Disability benefits
 * - Landlord-tenant
 * - Public records violations
 * - Small claims
 * 
 * All calculations are estimates based on statutory formulas.
 * Not legal advice — users should consult qualified attorneys.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── Types ───

export interface CalculationInput {
  claimType: string;
  jurisdiction: string;
  formulaId?: string;
  variables: Record<string, number>;
  caseId?: number;
  patternId?: string;
}

export interface CalculationResult {
  calcId: string;
  formulaName: string;
  claimType: string;
  jurisdiction: string;
  calculatedAmount: number;
  confidenceLevel: string;
  breakdown: CalculationBreakdown;
  statutoryBasis: string[];
  damagesRange: { low: number; high: number; typical: number } | null;
}

export interface CalculationBreakdown {
  baseAmount: number;
  multiplier: number;
  penalties: number;
  interestAmount: number;
  attorneyFees: number;
  totalBeforeAdjustments: number;
  adjustments: { name: string; amount: number; reason: string }[];
  finalAmount: number;
  components: { label: string; value: number; formula: string }[];
}

export interface FormulaInfo {
  formulaId: string;
  claimType: string;
  damageType: string;
  jurisdiction: string;
  baseAmount: number;
  multiplier: number;
  perDayAmount: number;
  perViolationAmount: number;
  interestRate: number;
  minimumAmount: number;
  maximumAmount: number | null;
  capType: string;
  calculationExample: string | null;
  sourceLaw: string | null;
  statuteSection: string | null;
}

// ─── Core Calculation Functions ───

/**
 * Calculate settlement estimate using the specified formula or best match
 */
export async function calculateSettlement(input: CalculationInput, userId?: number): Promise<CalculationResult> {
  // Find the formula
  let formula: any;
  if (input.formulaId) {
    const [rows] = await db.execute(
      sql`SELECT * FROM settlement_formulas WHERE formula_id = ${input.formulaId}`
    );
    formula = (rows as unknown as any[])[0];
  } else {
    // Find best matching formula
    const [rows] = await db.execute(
      sql`SELECT * FROM settlement_formulas 
          WHERE claim_type = ${input.claimType} 
          AND jurisdiction = ${input.jurisdiction}
          ORDER BY created_at DESC LIMIT 1`
    );
    formula = (rows as unknown as any[])[0];
  }

  if (!formula) {
    throw new Error(`No formula found for ${input.claimType} in ${input.jurisdiction}`);
  }

  // Execute the calculation using formula data + user variables
  const breakdown = executeFormula(formula, input.variables, input.claimType);

  // Determine confidence level
  const confidenceLevel = determineConfidence(input.variables);

  // Get damages range from matrix
  const damagesRange = await getDamagesRange(input.claimType, input.jurisdiction);

  // Store the calculation
  const calcId = randomUUID();
  await db.execute(
    sql`INSERT INTO settlement_calculations 
        (calculation_id, case_id, pattern_id, claim_type, jurisdiction, formula_applied,
         actual_damages, base_damages, statutory_damages, punitive_damages, interest_amount,
         attorneys_fees, total_demand, calculation_breakdown, calculated_by, created_at)
        VALUES (${calcId}, ${input.caseId || null}, ${input.patternId || null}, 
                ${input.claimType}, ${input.jurisdiction}, ${formula.formula_id},
                ${input.variables.actual_damages || input.variables.baseDamages || 0},
                ${breakdown.baseAmount}, ${breakdown.penalties}, ${0},
                ${breakdown.interestAmount}, ${breakdown.attorneyFees},
                ${breakdown.finalAmount}, ${JSON.stringify(breakdown)}, 
                ${userId ? String(userId) : null}, NOW())`
  );

  // Build statutory basis from formula source_law
  const statutoryBasis: string[] = [];
  if (formula.source_law) statutoryBasis.push(formula.source_law);
  if (formula.statute_section) statutoryBasis.push(formula.statute_section);

  return {
    calcId,
    formulaName: `${formula.claim_type} - ${formula.damage_type}`,
    claimType: input.claimType,
    jurisdiction: input.jurisdiction,
    calculatedAmount: breakdown.finalAmount,
    confidenceLevel,
    breakdown,
    statutoryBasis,
    damagesRange,
  };
}

/**
 * Execute a formula using the DB formula row and user-provided variables
 */
function executeFormula(
  formula: any,
  variables: Record<string, number>,
  claimType: string
): CalculationBreakdown {
  const v = variables;
  const fBaseAmount = parseFloat(formula.base_amount) || 0;
  const fMultiplier = parseFloat(formula.multiplier) || 1;
  const fPerDay = parseFloat(formula.per_day_amount) || 0;
  const fPerViolation = parseFloat(formula.per_violation_amount) || 0;
  const fInterestRate = parseFloat(formula.interest_rate) || 0;
  const fMinimum = parseFloat(formula.minimum_amount) || 0;
  const fMaximum = formula.maximum_amount ? parseFloat(formula.maximum_amount) : null;

  let baseAmount = 0;
  let multiplier = 1;
  let penalties = 0;
  let interestAmount = 0;
  let attorneyFees = 0;
  const components: { label: string; value: number; formula: string }[] = [];
  const adjustments: { name: string; amount: number; reason: string }[] = [];

  // ─── Wage Theft Calculations ───
  if (claimType === 'wage_theft' || claimType === 'overtime_violation' || claimType === 'minimum_wage_violation' || claimType === 'final_pay_violation') {
    baseAmount = v.unpaid_wages || v.base_amount || v.baseDamages || fBaseAmount;
    components.push({ label: 'Unpaid Wages', value: baseAmount, formula: 'Direct calculation from pay records' });

    if (v.overtime_hours && v.regular_rate) {
      const overtimeAmount = v.overtime_hours * v.regular_rate * 1.5;
      baseAmount += overtimeAmount;
      components.push({ label: 'Overtime Premium', value: overtimeAmount, formula: `${v.overtime_hours} hrs × $${v.regular_rate} × 1.5` });
    }

    if (fMultiplier > 1 || v.willful === 1) {
      multiplier = fMultiplier > 1 ? fMultiplier : 2;
      components.push({ label: 'Willful Withholding Multiplier', value: baseAmount * (multiplier - 1), formula: `Base × ${multiplier} (statutory)` });
    }

    const interestRate = fInterestRate > 0 ? fInterestRate : (v.interest_rate || 0.12);
    const daysPast = v.days_unpaid || 30;
    interestAmount = baseAmount * interestRate * (daysPast / 365);
    components.push({ label: 'Statutory Interest', value: interestAmount, formula: `$${baseAmount} × ${interestRate * 100}% × ${daysPast}/365 days` });

    if (v.waiting_time_days && v.daily_rate) {
      const waitingPenalty = Math.min(v.waiting_time_days, 30) * v.daily_rate;
      penalties += waitingPenalty;
      components.push({ label: 'Waiting Time Penalty', value: waitingPenalty, formula: `${Math.min(v.waiting_time_days, 30)} days × $${v.daily_rate}/day (max 30 days)` });
    }

    attorneyFees = v.attorney_fees || (baseAmount * 0.33);
    components.push({ label: 'Estimated Attorney Fees', value: attorneyFees, formula: 'Standard contingency (33%)' });
  }

  // ─── Housing Discrimination Calculations ───
  else if (claimType === 'housing_discrimination') {
    baseAmount = v.actual_damages || v.economic_loss || v.baseDamages || fBaseAmount;
    components.push({ label: 'Actual Damages', value: baseAmount, formula: 'Economic loss from discrimination' });

    const emotionalDistress = v.emotional_distress || (baseAmount * 0.5);
    components.push({ label: 'Emotional Distress', value: emotionalDistress, formula: v.emotional_distress ? 'Documented amount' : 'Estimated at 50% of actual damages' });

    const punitiveDamages = v.punitive_damages || (baseAmount * 1.5);
    penalties = punitiveDamages;
    components.push({ label: 'Punitive Damages', value: punitiveDamages, formula: v.punitive_damages ? 'Documented amount' : 'Estimated at 150% of actual damages' });

    baseAmount += emotionalDistress;
    attorneyFees = v.attorney_fees || (baseAmount * 0.33);
    components.push({ label: 'Estimated Attorney Fees', value: attorneyFees, formula: 'Standard contingency (33%)' });
  }

  // ─── Consumer Fraud Calculations ───
  else if (claimType === 'consumer_fraud') {
    baseAmount = v.actual_loss || v.amount_paid || v.baseDamages || fBaseAmount;
    components.push({ label: 'Actual Loss', value: baseAmount, formula: 'Amount paid minus value received' });

    if (fMultiplier >= 3 || v.treble_damages === 1) {
      multiplier = 3;
      components.push({ label: 'Treble Damages', value: baseAmount * 2, formula: 'Statutory treble damages (3× actual)' });
    }

    if (fMinimum > 0 && baseAmount * multiplier < fMinimum) {
      adjustments.push({ name: 'Statutory Minimum', amount: fMinimum - (baseAmount * multiplier), reason: 'Adjusted to statutory minimum' });
    }

    attorneyFees = v.attorney_fees || (baseAmount * 0.33);
    components.push({ label: 'Estimated Attorney Fees', value: attorneyFees, formula: 'Standard contingency (33%)' });
  }

  // ─── Debt Collection Harassment ───
  else if (claimType === 'debt_harassment') {
    baseAmount = v.actual_damages || v.baseDamages || fBaseAmount;
    components.push({ label: 'Actual Damages', value: baseAmount, formula: 'Documented actual damages' });

    const statutoryDamages = fMaximum || v.statutory_damages || 1000;
    penalties = statutoryDamages;
    components.push({ label: 'Statutory Damages (FDCPA)', value: statutoryDamages, formula: 'Up to $1,000 per 15 USC 1692k(a)(2)(A)' });

    if (v.class_action === 1) {
      const classMax = v.class_size ? Math.min(v.class_size * 1000, 500000) : 500000;
      adjustments.push({ name: 'Class Action Damages', amount: classMax, reason: 'Lesser of $500,000 or 1% of net worth' });
    }

    attorneyFees = v.attorney_fees || 2500;
    components.push({ label: 'Attorney Fees (fee-shifting)', value: attorneyFees, formula: 'FDCPA mandatory fee-shifting' });
  }

  // ─── Security Deposit ───
  else if (claimType === 'security_deposit') {
    baseAmount = v.deposit_amount || v.baseDamages || fBaseAmount;
    components.push({ label: 'Security Deposit', value: baseAmount, formula: 'Original deposit amount' });

    if (fMultiplier >= 2 || v.bad_faith === 1) {
      multiplier = fMultiplier >= 2 ? fMultiplier : 2;
      components.push({ label: 'Bad Faith Multiplier', value: baseAmount * (multiplier - 1), formula: `${multiplier}× for bad faith retention` });
    }

    attorneyFees = v.attorney_fees || (baseAmount * 0.33);
    components.push({ label: 'Estimated Attorney Fees', value: attorneyFees, formula: 'Standard contingency (33%)' });
  }

  // ─── Default / Generic Calculation ───
  else {
    baseAmount = v.baseDamages || v.actual_damages || v.base_amount || fBaseAmount;
    components.push({ label: 'Base Damages', value: baseAmount, formula: 'Primary damages calculation' });

    if (fMultiplier > 1) {
      multiplier = fMultiplier;
      components.push({ label: 'Statutory Multiplier', value: baseAmount * (multiplier - 1), formula: `${multiplier}× multiplier` });
    }

    if (fPerViolation > 0 && v.violation_count) {
      const violationPenalty = fPerViolation * v.violation_count;
      penalties += violationPenalty;
      components.push({ label: 'Per-Violation Penalty', value: violationPenalty, formula: `$${fPerViolation} × ${v.violation_count} violations` });
    }

    if (fPerDay > 0 && v.days_in_violation) {
      const dailyPenalty = fPerDay * v.days_in_violation;
      penalties += dailyPenalty;
      components.push({ label: 'Daily Penalty', value: dailyPenalty, formula: `$${fPerDay} × ${v.days_in_violation} days` });
    }

    if (fInterestRate > 0) {
      const daysPast = v.days_unpaid || 30;
      interestAmount = baseAmount * fInterestRate * (daysPast / 365);
      components.push({ label: 'Interest', value: interestAmount, formula: `${fInterestRate * 100}% annual` });
    }

    attorneyFees = v.attorney_fees || (baseAmount * 0.33);
    components.push({ label: 'Estimated Attorney Fees', value: attorneyFees, formula: 'Standard contingency (33%)' });
  }

  // Calculate totals
  const totalBeforeAdjustments = (baseAmount * multiplier) + penalties + interestAmount + attorneyFees;
  let finalAmount = totalBeforeAdjustments;

  for (const adj of adjustments) {
    finalAmount += adj.amount;
  }

  // Apply caps
  if (fMinimum > 0 && finalAmount < fMinimum) {
    adjustments.push({ name: 'Minimum Floor', amount: fMinimum - finalAmount, reason: 'Statutory minimum applied' });
    finalAmount = fMinimum;
  }
  if (fMaximum && finalAmount > fMaximum && formula.cap_type !== 'none') {
    adjustments.push({ name: 'Damages Cap', amount: fMaximum - finalAmount, reason: 'Statutory cap applied' });
    finalAmount = fMaximum;
  }

  return {
    baseAmount,
    multiplier,
    penalties,
    interestAmount,
    attorneyFees,
    totalBeforeAdjustments,
    adjustments,
    finalAmount,
    components,
  };
}

/**
 * Determine confidence level based on available variables
 */
function determineConfidence(variables: Record<string, number>): string {
  const keyVars = ['baseDamages', 'actual_damages', 'unpaid_wages', 'actual_loss', 'deposit_amount'];
  const hasKey = keyVars.some(k => variables[k] && variables[k] > 0);
  const varCount = Object.keys(variables).filter(k => variables[k] !== undefined && variables[k] !== 0).length;

  if (hasKey && varCount >= 4) return "high";
  if (hasKey && varCount >= 2) return "medium";
  return "low";
}

/**
 * Get damages range from the matrix
 */
async function getDamagesRange(claimType: string, jurisdiction: string): Promise<{ low: number; high: number; typical: number } | null> {
  const [rows] = await db.execute(
    sql`SELECT damages_range_low, damages_range_high, typical_award 
        FROM damages_matrix 
        WHERE claim_type = ${claimType} AND jurisdiction = ${jurisdiction} 
        LIMIT 1`
  );
  const row = (rows as unknown as any[])[0];
  if (!row) return null;
  return {
    low: parseFloat(row.damages_range_low) || 0,
    high: parseFloat(row.damages_range_high) || 0,
    typical: parseFloat(row.typical_award) || 0,
  };
}

// ─── Formula Management ───

/**
 * List available formulas for a claim type and jurisdiction
 */
export async function listFormulas(claimType?: string, jurisdiction?: string): Promise<FormulaInfo[]> {
  let query = sql`SELECT * FROM settlement_formulas WHERE 1=1`;
  if (claimType) query = sql`${query} AND claim_type = ${claimType}`;
  if (jurisdiction) query = sql`${query} AND jurisdiction = ${jurisdiction}`;
  query = sql`${query} ORDER BY claim_type, jurisdiction`;

  const [rows] = await db.execute(query);
  return (rows as unknown as any[]).map(mapFormulaRow);
}

/**
 * Get calculation history for a case
 */
export async function getCalculationHistory(caseId?: number, patternId?: string, limit = 20): Promise<any[]> {
  let query;
  if (caseId) {
    query = sql`SELECT sc.*, sf.claim_type as formula_claim, sf.damage_type as formula_damage
                FROM settlement_calculations sc
                LEFT JOIN settlement_formulas sf ON sc.formula_applied = sf.formula_id
                WHERE sc.case_id = ${caseId} ORDER BY sc.created_at DESC LIMIT ${limit}`;
  } else if (patternId) {
    query = sql`SELECT sc.*, sf.claim_type as formula_claim, sf.damage_type as formula_damage
                FROM settlement_calculations sc
                LEFT JOIN settlement_formulas sf ON sc.formula_applied = sf.formula_id
                WHERE sc.pattern_id = ${patternId} ORDER BY sc.created_at DESC LIMIT ${limit}`;
  } else {
    query = sql`SELECT sc.*, sf.claim_type as formula_claim, sf.damage_type as formula_damage
                FROM settlement_calculations sc
                LEFT JOIN settlement_formulas sf ON sc.formula_applied = sf.formula_id
                ORDER BY sc.created_at DESC LIMIT ${limit}`;
  }

  const [rows] = await db.execute(query);
  return (rows as unknown as any[]).map(r => ({
    calcId: r.calculation_id,
    formulaName: r.formula_claim ? `${r.formula_claim} - ${r.formula_damage}` : 'Unknown',
    claimType: r.claim_type,
    jurisdiction: r.jurisdiction,
    calculatedAmount: parseFloat(r.total_demand) || 0,
    baseDamages: parseFloat(r.base_damages) || 0,
    statutoryDamages: parseFloat(r.statutory_damages) || 0,
    interestAmount: parseFloat(r.interest_amount) || 0,
    attorneysFees: parseFloat(r.attorneys_fees) || 0,
    breakdown: typeof r.calculation_breakdown === 'string' ? JSON.parse(r.calculation_breakdown) : r.calculation_breakdown,
    createdAt: r.created_at,
  }));
}

/**
 * Get jurisdiction rules for a claim type
 */
export async function getJurisdictionRules(jurisdiction: string, claimType?: string): Promise<any[]> {
  let query;
  if (claimType) {
    query = sql`SELECT * FROM jurisdiction_rules WHERE jurisdiction = ${jurisdiction} AND claim_type = ${claimType}`;
  } else {
    query = sql`SELECT * FROM jurisdiction_rules WHERE jurisdiction = ${jurisdiction}`;
  }

  const [rows] = await db.execute(query);
  return (rows as unknown as any[]).map(r => ({
    ruleId: r.rule_id,
    jurisdiction: r.jurisdiction,
    claimType: r.claim_type,
    statuteReference: r.statute_reference,
    damagesCap: r.damages_cap ? parseFloat(r.damages_cap) : null,
    trebleDamagesAvailable: !!r.treble_damages_available,
    classActionThreshold: r.class_action_threshold,
    filingDeadlineDays: r.filing_deadline_days,
    noticeRequirements: r.notice_requirements,
    specialProvisions: r.special_provisions,
  }));
}

/**
 * Get settlement calculator dashboard summary
 */
export async function getCalculatorDashboard(): Promise<{
  totalCalculations: number;
  totalFormulas: number;
  avgSettlement: number;
  claimTypeBreakdown: { claimType: string; count: number; avgAmount: number }[];
  recentCalculations: any[];
  jurisdictionCoverage: { jurisdiction: string; formulaCount: number }[];
}> {
  const [totalCalcRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM settlement_calculations`);
  const [totalFormulaRows] = await db.execute(sql`SELECT COUNT(*) as cnt FROM settlement_formulas`);
  const [avgRows] = await db.execute(sql`SELECT AVG(CAST(total_demand AS DECIMAL(14,2))) as avg_amt FROM settlement_calculations`);

  const [claimBreakdown] = await db.execute(
    sql`SELECT claim_type, COUNT(*) as cnt, AVG(CAST(total_demand AS DECIMAL(14,2))) as avg_amt 
        FROM settlement_calculations GROUP BY claim_type ORDER BY cnt DESC`
  );

  const [recent] = await db.execute(
    sql`SELECT sc.*, sf.claim_type as formula_claim, sf.damage_type as formula_damage
        FROM settlement_calculations sc
        LEFT JOIN settlement_formulas sf ON sc.formula_applied = sf.formula_id
        ORDER BY sc.created_at DESC LIMIT 5`
  );

  const [jurisdictions] = await db.execute(
    sql`SELECT jurisdiction, COUNT(*) as cnt FROM settlement_formulas GROUP BY jurisdiction ORDER BY cnt DESC`
  );

  return {
    totalCalculations: (totalCalcRows as unknown as any[])[0]?.cnt || 0,
    totalFormulas: (totalFormulaRows as unknown as any[])[0]?.cnt || 0,
    avgSettlement: parseFloat((avgRows as unknown as any[])[0]?.avg_amt) || 0,
    claimTypeBreakdown: (claimBreakdown as unknown as any[]).map(r => ({
      claimType: r.claim_type,
      count: r.cnt,
      avgAmount: parseFloat(r.avg_amt) || 0,
    })),
    recentCalculations: (recent as unknown as any[]).map(r => ({
      calcId: r.calculation_id,
      formulaName: r.formula_claim ? `${r.formula_claim} - ${r.formula_damage}` : 'Unknown',
      claimType: r.claim_type,
      jurisdiction: r.jurisdiction,
      calculatedAmount: parseFloat(r.total_demand) || 0,
      createdAt: r.created_at,
    })),
    jurisdictionCoverage: (jurisdictions as unknown as any[]).map(r => ({
      jurisdiction: r.jurisdiction,
      formulaCount: r.cnt,
    })),
  };
}

/**
 * Compare multiple formulas for the same claim
 */
export async function compareFormulas(
  claimType: string,
  jurisdiction: string,
  variables: Record<string, number>
): Promise<{ formulaId: string; formulaName: string; amount: number; breakdown: CalculationBreakdown }[]> {
  const formulas = await listFormulas(claimType, jurisdiction);
  const results: { formulaId: string; formulaName: string; amount: number; breakdown: CalculationBreakdown }[] = [];

  for (const f of formulas) {
    try {
      // Build a formula-like object from FormulaInfo
      const formulaRow = {
        base_amount: f.baseAmount,
        multiplier: f.multiplier,
        per_day_amount: f.perDayAmount,
        per_violation_amount: f.perViolationAmount,
        interest_rate: f.interestRate,
        minimum_amount: f.minimumAmount,
        maximum_amount: f.maximumAmount,
        cap_type: f.capType,
      };
      const breakdown = executeFormula(formulaRow, variables, claimType);
      results.push({
        formulaId: f.formulaId,
        formulaName: `${f.claimType} - ${f.damageType}`,
        amount: breakdown.finalAmount,
        breakdown,
      });
    } catch {
      // Skip formulas that can't be calculated with given variables
    }
  }

  return results.sort((a, b) => b.amount - a.amount);
}

// ─── Helpers ───

function mapFormulaRow(r: any): FormulaInfo {
  return {
    formulaId: r.formula_id,
    claimType: r.claim_type,
    damageType: r.damage_type,
    jurisdiction: r.jurisdiction,
    baseAmount: parseFloat(r.base_amount) || 0,
    multiplier: parseFloat(r.multiplier) || 0,
    perDayAmount: parseFloat(r.per_day_amount) || 0,
    perViolationAmount: parseFloat(r.per_violation_amount) || 0,
    interestRate: parseFloat(r.interest_rate) || 0,
    minimumAmount: parseFloat(r.minimum_amount) || 0,
    maximumAmount: r.maximum_amount ? parseFloat(r.maximum_amount) : null,
    capType: r.cap_type || 'none',
    calculationExample: r.calculation_example,
    sourceLaw: r.source_law,
    statuteSection: r.statute_section,
  };
}
