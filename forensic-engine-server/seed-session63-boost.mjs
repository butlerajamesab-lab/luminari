import mysql from 'mysql2/promise';
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const now = Date.now();

// ============================================================
// 1. Signal Registry — Need 66 more to hit 100
// ============================================================
console.log('=== SIGNAL REGISTRY ===');
const signals = [
  { signalType: 'complaint_spike', domain: 'consumer_protection', jurisdiction: 'Federal', severity: 'high', description: 'Sudden increase in consumer complaints against financial institutions', detectionMethod: 'volume_anomaly', threshold: 50 },
  { signalType: 'enforcement_gap', domain: 'employment', jurisdiction: 'Federal', severity: 'medium', description: 'Low enforcement activity despite high complaint volume in wage theft', detectionMethod: 'ratio_analysis', threshold: 30 },
  { signalType: 'repeat_offender', domain: 'housing', jurisdiction: 'Federal', severity: 'critical', description: 'Same landlord entity appearing in multiple fair housing complaints', detectionMethod: 'entity_clustering', threshold: 5 },
  { signalType: 'geographic_cluster', domain: 'civil_rights', jurisdiction: 'Federal', severity: 'high', description: 'Concentrated civil rights violations in specific geographic area', detectionMethod: 'geo_clustering', threshold: 10 },
  { signalType: 'temporal_pattern', domain: 'benefits', jurisdiction: 'Federal', severity: 'medium', description: 'Seasonal spike in benefits denial rates', detectionMethod: 'temporal_analysis', threshold: 20 },
  { signalType: 'policy_regression', domain: 'disability', jurisdiction: 'Federal', severity: 'high', description: 'Rollback of disability accommodation requirements', detectionMethod: 'policy_tracking', threshold: 1 },
  { signalType: 'complaint_spike', domain: 'consumer_protection', jurisdiction: 'Washington', severity: 'high', description: 'Spike in predatory lending complaints in WA', detectionMethod: 'volume_anomaly', threshold: 25 },
  { signalType: 'enforcement_gap', domain: 'housing', jurisdiction: 'Washington', severity: 'medium', description: 'Low enforcement of tenant protections in WA', detectionMethod: 'ratio_analysis', threshold: 15 },
  { signalType: 'repeat_offender', domain: 'employment', jurisdiction: 'Washington', severity: 'critical', description: 'Repeat wage theft by same employer in WA', detectionMethod: 'entity_clustering', threshold: 3 },
  { signalType: 'geographic_cluster', domain: 'housing', jurisdiction: 'Washington', severity: 'high', description: 'Eviction cluster in specific WA neighborhoods', detectionMethod: 'geo_clustering', threshold: 8 },
  { signalType: 'complaint_spike', domain: 'employment', jurisdiction: 'California', severity: 'high', description: 'Spike in workplace discrimination complaints in CA', detectionMethod: 'volume_anomaly', threshold: 40 },
  { signalType: 'enforcement_gap', domain: 'consumer_protection', jurisdiction: 'California', severity: 'medium', description: 'Low enforcement of CCPA violations', detectionMethod: 'ratio_analysis', threshold: 20 },
  { signalType: 'repeat_offender', domain: 'housing', jurisdiction: 'California', severity: 'critical', description: 'Serial eviction filings by same property management company in CA', detectionMethod: 'entity_clustering', threshold: 5 },
  { signalType: 'temporal_pattern', domain: 'employment', jurisdiction: 'California', severity: 'medium', description: 'End-of-year spike in wrongful termination complaints in CA', detectionMethod: 'temporal_analysis', threshold: 15 },
  { signalType: 'complaint_spike', domain: 'civil_rights', jurisdiction: 'New York', severity: 'high', description: 'Increase in discrimination complaints in NYC', detectionMethod: 'volume_anomaly', threshold: 35 },
  { signalType: 'enforcement_gap', domain: 'employment', jurisdiction: 'New York', severity: 'medium', description: 'Low enforcement of wage theft laws in NY', detectionMethod: 'ratio_analysis', threshold: 25 },
  { signalType: 'repeat_offender', domain: 'consumer_protection', jurisdiction: 'New York', severity: 'critical', description: 'Repeat debt collection violations by same agency in NY', detectionMethod: 'entity_clustering', threshold: 4 },
  { signalType: 'geographic_cluster', domain: 'housing', jurisdiction: 'New York', severity: 'high', description: 'Concentrated housing code violations in specific NYC boroughs', detectionMethod: 'geo_clustering', threshold: 12 },
  { signalType: 'complaint_spike', domain: 'employment', jurisdiction: 'Texas', severity: 'high', description: 'Spike in workplace safety complaints in TX', detectionMethod: 'volume_anomaly', threshold: 30 },
  { signalType: 'enforcement_gap', domain: 'civil_rights', jurisdiction: 'Texas', severity: 'medium', description: 'Low enforcement of anti-discrimination laws in TX', detectionMethod: 'ratio_analysis', threshold: 20 },
  { signalType: 'complaint_spike', domain: 'consumer_protection', jurisdiction: 'Florida', severity: 'high', description: 'Spike in insurance claim denials in FL', detectionMethod: 'volume_anomaly', threshold: 25 },
  { signalType: 'repeat_offender', domain: 'housing', jurisdiction: 'Florida', severity: 'critical', description: 'Serial fair housing violations by same developer in FL', detectionMethod: 'entity_clustering', threshold: 3 },
  { signalType: 'complaint_spike', domain: 'employment', jurisdiction: 'Illinois', severity: 'high', description: 'Spike in discrimination complaints in IL', detectionMethod: 'volume_anomaly', threshold: 20 },
  { signalType: 'enforcement_gap', domain: 'housing', jurisdiction: 'Illinois', severity: 'medium', description: 'Low enforcement of lead paint regulations in IL', detectionMethod: 'ratio_analysis', threshold: 10 },
  { signalType: 'temporal_pattern', domain: 'benefits', jurisdiction: 'Federal', severity: 'medium', description: 'Q1 spike in SNAP benefit denials', detectionMethod: 'temporal_analysis', threshold: 15 },
  { signalType: 'policy_regression', domain: 'employment', jurisdiction: 'Federal', severity: 'high', description: 'Weakening of overtime protections', detectionMethod: 'policy_tracking', threshold: 1 },
  { signalType: 'geographic_cluster', domain: 'consumer_protection', jurisdiction: 'Federal', severity: 'high', description: 'Concentrated payday lending in low-income areas', detectionMethod: 'geo_clustering', threshold: 15 },
  { signalType: 'complaint_spike', domain: 'disability', jurisdiction: 'Federal', severity: 'high', description: 'Spike in ADA accommodation denials', detectionMethod: 'volume_anomaly', threshold: 20 },
  { signalType: 'repeat_offender', domain: 'consumer_protection', jurisdiction: 'Federal', severity: 'critical', description: 'Same financial institution with repeated CFPB enforcement actions', detectionMethod: 'entity_clustering', threshold: 3 },
  { signalType: 'enforcement_gap', domain: 'disability', jurisdiction: 'Federal', severity: 'medium', description: 'Low ADA enforcement in public accommodations', detectionMethod: 'ratio_analysis', threshold: 10 },
  { signalType: 'temporal_pattern', domain: 'housing', jurisdiction: 'Federal', severity: 'medium', description: 'Seasonal spike in eviction filings', detectionMethod: 'temporal_analysis', threshold: 25 },
  { signalType: 'policy_regression', domain: 'consumer_protection', jurisdiction: 'Federal', severity: 'high', description: 'Rollback of consumer financial protections', detectionMethod: 'policy_tracking', threshold: 1 },
  { signalType: 'geographic_cluster', domain: 'employment', jurisdiction: 'Federal', severity: 'high', description: 'Concentrated wage theft in agricultural regions', detectionMethod: 'geo_clustering', threshold: 10 },
  { signalType: 'complaint_spike', domain: 'elder_care', jurisdiction: 'Federal', severity: 'high', description: 'Spike in nursing home abuse complaints', detectionMethod: 'volume_anomaly', threshold: 15 },
  { signalType: 'repeat_offender', domain: 'elder_care', jurisdiction: 'Federal', severity: 'critical', description: 'Same nursing facility chain with repeated violations', detectionMethod: 'entity_clustering', threshold: 3 },
  { signalType: 'enforcement_gap', domain: 'immigration', jurisdiction: 'Federal', severity: 'medium', description: 'Low enforcement of employer immigration violations', detectionMethod: 'ratio_analysis', threshold: 10 },
  { signalType: 'complaint_spike', domain: 'education', jurisdiction: 'Federal', severity: 'high', description: 'Spike in special education denial complaints', detectionMethod: 'volume_anomaly', threshold: 15 },
  { signalType: 'geographic_cluster', domain: 'civil_rights', jurisdiction: 'Washington', severity: 'high', description: 'Concentrated police misconduct complaints in specific WA cities', detectionMethod: 'geo_clustering', threshold: 8 },
  { signalType: 'temporal_pattern', domain: 'employment', jurisdiction: 'Washington', severity: 'medium', description: 'Seasonal spike in agricultural worker complaints in WA', detectionMethod: 'temporal_analysis', threshold: 10 },
  { signalType: 'policy_regression', domain: 'housing', jurisdiction: 'Washington', severity: 'high', description: 'Weakening of tenant protections in WA', detectionMethod: 'policy_tracking', threshold: 1 },
  { signalType: 'geographic_cluster', domain: 'consumer_protection', jurisdiction: 'California', severity: 'high', description: 'Concentrated auto lending fraud in CA', detectionMethod: 'geo_clustering', threshold: 10 },
  { signalType: 'temporal_pattern', domain: 'housing', jurisdiction: 'California', severity: 'medium', description: 'Spike in rent increase complaints at lease renewal time in CA', detectionMethod: 'temporal_analysis', threshold: 20 },
  { signalType: 'enforcement_gap', domain: 'disability', jurisdiction: 'California', severity: 'medium', description: 'Low enforcement of FEHA disability accommodations in CA', detectionMethod: 'ratio_analysis', threshold: 15 },
  { signalType: 'repeat_offender', domain: 'employment', jurisdiction: 'California', severity: 'critical', description: 'Same gig economy company with repeated misclassification complaints in CA', detectionMethod: 'entity_clustering', threshold: 5 },
  { signalType: 'complaint_spike', domain: 'housing', jurisdiction: 'New York', severity: 'high', description: 'Spike in illegal lockout complaints in NYC', detectionMethod: 'volume_anomaly', threshold: 20 },
  { signalType: 'temporal_pattern', domain: 'consumer_protection', jurisdiction: 'New York', severity: 'medium', description: 'Holiday season spike in debt collection harassment in NY', detectionMethod: 'temporal_analysis', threshold: 15 },
  { signalType: 'enforcement_gap', domain: 'housing', jurisdiction: 'Texas', severity: 'medium', description: 'Low enforcement of habitability standards in TX', detectionMethod: 'ratio_analysis', threshold: 10 },
  { signalType: 'repeat_offender', domain: 'consumer_protection', jurisdiction: 'Texas', severity: 'critical', description: 'Same auto dealer with repeated deceptive practices in TX', detectionMethod: 'entity_clustering', threshold: 3 },
  { signalType: 'geographic_cluster', domain: 'employment', jurisdiction: 'Florida', severity: 'high', description: 'Concentrated wage theft in FL hospitality industry', detectionMethod: 'geo_clustering', threshold: 10 },
  { signalType: 'temporal_pattern', domain: 'housing', jurisdiction: 'Florida', severity: 'medium', description: 'Post-hurricane spike in insurance claim denials in FL', detectionMethod: 'temporal_analysis', threshold: 20 },
  { signalType: 'complaint_spike', domain: 'consumer_protection', jurisdiction: 'Michigan', severity: 'high', description: 'Spike in auto lending complaints in MI', detectionMethod: 'volume_anomaly', threshold: 15 },
  { signalType: 'enforcement_gap', domain: 'employment', jurisdiction: 'Michigan', severity: 'medium', description: 'Low enforcement of workplace safety in MI manufacturing', detectionMethod: 'ratio_analysis', threshold: 10 },
  { signalType: 'complaint_spike', domain: 'housing', jurisdiction: 'Minnesota', severity: 'high', description: 'Spike in tenant rights complaints in MN', detectionMethod: 'volume_anomaly', threshold: 15 },
  { signalType: 'geographic_cluster', domain: 'civil_rights', jurisdiction: 'Minnesota', severity: 'high', description: 'Concentrated police use-of-force complaints in MN', detectionMethod: 'geo_clustering', threshold: 8 },
  { signalType: 'repeat_offender', domain: 'employment', jurisdiction: 'Illinois', severity: 'critical', description: 'Same staffing agency with repeated wage theft in IL', detectionMethod: 'entity_clustering', threshold: 4 },
  { signalType: 'temporal_pattern', domain: 'consumer_protection', jurisdiction: 'Illinois', severity: 'medium', description: 'Tax season spike in predatory tax prep complaints in IL', detectionMethod: 'temporal_analysis', threshold: 10 },
  { signalType: 'policy_regression', domain: 'civil_rights', jurisdiction: 'Federal', severity: 'critical', description: 'Rollback of voting rights protections', detectionMethod: 'policy_tracking', threshold: 1 },
  { signalType: 'complaint_spike', domain: 'tribal_rights', jurisdiction: 'Federal', severity: 'high', description: 'Spike in ICWA compliance complaints', detectionMethod: 'volume_anomaly', threshold: 10 },
  { signalType: 'enforcement_gap', domain: 'tribal_rights', jurisdiction: 'Federal', severity: 'medium', description: 'Low enforcement of treaty rights protections', detectionMethod: 'ratio_analysis', threshold: 5 },
  { signalType: 'geographic_cluster', domain: 'elder_care', jurisdiction: 'Federal', severity: 'high', description: 'Concentrated nursing home violations in rural areas', detectionMethod: 'geo_clustering', threshold: 8 },
  { signalType: 'temporal_pattern', domain: 'immigration', jurisdiction: 'Federal', severity: 'medium', description: 'Spike in asylum denial rates during certain periods', detectionMethod: 'temporal_analysis', threshold: 15 },
  { signalType: 'repeat_offender', domain: 'education', jurisdiction: 'Federal', severity: 'critical', description: 'Same school district with repeated IDEA violations', detectionMethod: 'entity_clustering', threshold: 3 },
  { signalType: 'enforcement_gap', domain: 'elder_care', jurisdiction: 'Federal', severity: 'medium', description: 'Low enforcement of nursing home staffing requirements', detectionMethod: 'ratio_analysis', threshold: 10 },
  { signalType: 'complaint_spike', domain: 'juvenile_justice', jurisdiction: 'Federal', severity: 'high', description: 'Spike in juvenile detention condition complaints', detectionMethod: 'volume_anomaly', threshold: 10 },
  { signalType: 'geographic_cluster', domain: 'juvenile_justice', jurisdiction: 'Federal', severity: 'high', description: 'Concentrated school-to-prison pipeline indicators', detectionMethod: 'geo_clustering', threshold: 8 },
  { signalType: 'policy_regression', domain: 'immigration', jurisdiction: 'Federal', severity: 'critical', description: 'Rollback of asylum protections', detectionMethod: 'policy_tracking', threshold: 1 },
];

let sigInserted = 0;
for (const s of signals) {
  try {
    await conn.query(
      `INSERT IGNORE INTO signal_registry (signalType, domain, jurisdiction, severity, description, detectionMethod, \`threshold\`, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.signalType, s.domain, s.jurisdiction, s.severity, s.description, s.detectionMethod, s.threshold, now, now]
    );
    sigInserted++;
  } catch(e) { console.error('  Signal error:', e.message.substring(0,80)); }
}
console.log(`[Signal Registry] Inserted ${sigInserted} signals`);

// ============================================================
// 2. Pattern Registry — Need 40 more to hit 50
// ============================================================
console.log('=== PATTERN REGISTRY ===');
const patterns = [
  { patternType: 'repeat_violation', domain: 'employment', jurisdiction: 'Federal', description: 'Same employer with 3+ OSHA violations in 12 months', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'geographic_concentration', domain: 'housing', jurisdiction: 'Federal', description: 'Fair housing complaints concentrated in specific zip codes', minOccurrences: 5, timeWindowDays: 180 },
  { patternType: 'escalation_pattern', domain: 'consumer_protection', jurisdiction: 'Federal', description: 'Consumer complaints escalating from informal to formal', minOccurrences: 2, timeWindowDays: 90 },
  { patternType: 'regulatory_gap', domain: 'disability', jurisdiction: 'Federal', description: 'High ADA complaints with low enforcement actions', minOccurrences: 10, timeWindowDays: 365 },
  { patternType: 'seasonal_spike', domain: 'benefits', jurisdiction: 'Federal', description: 'Q4 spike in benefits denial rates', minOccurrences: 20, timeWindowDays: 90 },
  { patternType: 'repeat_violation', domain: 'housing', jurisdiction: 'Washington', description: 'Same landlord with 3+ tenant complaints in WA', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'geographic_concentration', domain: 'employment', jurisdiction: 'Washington', description: 'Wage theft concentrated in WA agricultural regions', minOccurrences: 5, timeWindowDays: 180 },
  { patternType: 'regulatory_gap', domain: 'consumer_protection', jurisdiction: 'Washington', description: 'High consumer complaints with low AG enforcement in WA', minOccurrences: 8, timeWindowDays: 365 },
  { patternType: 'repeat_violation', domain: 'employment', jurisdiction: 'California', description: 'Same employer with repeated FEHA violations in CA', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'geographic_concentration', domain: 'housing', jurisdiction: 'California', description: 'Eviction filings concentrated in specific CA cities', minOccurrences: 10, timeWindowDays: 180 },
  { patternType: 'escalation_pattern', domain: 'employment', jurisdiction: 'California', description: 'Workplace complaints escalating to DFEH filings in CA', minOccurrences: 3, timeWindowDays: 90 },
  { patternType: 'regulatory_gap', domain: 'housing', jurisdiction: 'New York', description: 'High housing code violations with low enforcement in NYC', minOccurrences: 15, timeWindowDays: 365 },
  { patternType: 'repeat_violation', domain: 'consumer_protection', jurisdiction: 'New York', description: 'Same debt collector with repeated FDCPA violations in NY', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'seasonal_spike', domain: 'employment', jurisdiction: 'New York', description: 'Holiday season spike in retail worker complaints in NY', minOccurrences: 10, timeWindowDays: 60 },
  { patternType: 'geographic_concentration', domain: 'civil_rights', jurisdiction: 'Texas', description: 'Discrimination complaints concentrated in TX metro areas', minOccurrences: 8, timeWindowDays: 180 },
  { patternType: 'regulatory_gap', domain: 'employment', jurisdiction: 'Texas', description: 'High workplace safety complaints with low OSHA enforcement in TX', minOccurrences: 10, timeWindowDays: 365 },
  { patternType: 'repeat_violation', domain: 'housing', jurisdiction: 'Florida', description: 'Same property management company with repeated violations in FL', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'seasonal_spike', domain: 'consumer_protection', jurisdiction: 'Florida', description: 'Post-hurricane spike in insurance complaints in FL', minOccurrences: 15, timeWindowDays: 90 },
  { patternType: 'escalation_pattern', domain: 'civil_rights', jurisdiction: 'Federal', description: 'Civil rights complaints escalating from state to federal level', minOccurrences: 2, timeWindowDays: 180 },
  { patternType: 'repeat_violation', domain: 'elder_care', jurisdiction: 'Federal', description: 'Same nursing facility with repeated CMS violations', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'geographic_concentration', domain: 'elder_care', jurisdiction: 'Federal', description: 'Nursing home violations concentrated in rural areas', minOccurrences: 5, timeWindowDays: 365 },
  { patternType: 'regulatory_gap', domain: 'immigration', jurisdiction: 'Federal', description: 'High asylum denial rate with low appeal success', minOccurrences: 20, timeWindowDays: 365 },
  { patternType: 'repeat_violation', domain: 'education', jurisdiction: 'Federal', description: 'Same school district with repeated IDEA violations', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'escalation_pattern', domain: 'disability', jurisdiction: 'Federal', description: 'ADA complaints escalating from informal to DOJ involvement', minOccurrences: 2, timeWindowDays: 180 },
  { patternType: 'seasonal_spike', domain: 'housing', jurisdiction: 'Federal', description: 'Winter spike in habitability complaints', minOccurrences: 15, timeWindowDays: 90 },
  { patternType: 'geographic_concentration', domain: 'consumer_protection', jurisdiction: 'Federal', description: 'Payday lending concentrated in low-income zip codes', minOccurrences: 10, timeWindowDays: 365 },
  { patternType: 'regulatory_gap', domain: 'employment', jurisdiction: 'Federal', description: 'High misclassification complaints with low DOL enforcement', minOccurrences: 15, timeWindowDays: 365 },
  { patternType: 'repeat_violation', domain: 'consumer_protection', jurisdiction: 'Federal', description: 'Same financial institution with repeated CFPB actions', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'escalation_pattern', domain: 'housing', jurisdiction: 'Federal', description: 'Fair housing complaints escalating from HUD to DOJ', minOccurrences: 2, timeWindowDays: 180 },
  { patternType: 'seasonal_spike', domain: 'consumer_protection', jurisdiction: 'Federal', description: 'Holiday season spike in debt collection complaints', minOccurrences: 20, timeWindowDays: 60 },
  { patternType: 'geographic_concentration', domain: 'employment', jurisdiction: 'Illinois', description: 'Wage theft concentrated in IL restaurant industry', minOccurrences: 8, timeWindowDays: 180 },
  { patternType: 'regulatory_gap', domain: 'housing', jurisdiction: 'Illinois', description: 'High lead paint complaints with low enforcement in IL', minOccurrences: 10, timeWindowDays: 365 },
  { patternType: 'repeat_violation', domain: 'employment', jurisdiction: 'Michigan', description: 'Same auto manufacturer with repeated safety violations in MI', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'geographic_concentration', domain: 'consumer_protection', jurisdiction: 'Michigan', description: 'Auto lending fraud concentrated in MI metro areas', minOccurrences: 5, timeWindowDays: 180 },
  { patternType: 'regulatory_gap', domain: 'civil_rights', jurisdiction: 'Minnesota', description: 'High police misconduct complaints with low accountability in MN', minOccurrences: 10, timeWindowDays: 365 },
  { patternType: 'escalation_pattern', domain: 'tribal_rights', jurisdiction: 'Federal', description: 'ICWA violations escalating from state to federal court', minOccurrences: 2, timeWindowDays: 365 },
  { patternType: 'repeat_violation', domain: 'juvenile_justice', jurisdiction: 'Federal', description: 'Same juvenile facility with repeated condition violations', minOccurrences: 3, timeWindowDays: 365 },
  { patternType: 'geographic_concentration', domain: 'juvenile_justice', jurisdiction: 'Federal', description: 'School-to-prison pipeline indicators in specific districts', minOccurrences: 5, timeWindowDays: 365 },
  { patternType: 'regulatory_gap', domain: 'elder_care', jurisdiction: 'Federal', description: 'High nursing home staffing complaints with low CMS enforcement', minOccurrences: 10, timeWindowDays: 365 },
  { patternType: 'seasonal_spike', domain: 'immigration', jurisdiction: 'Federal', description: 'Spike in asylum applications during certain periods', minOccurrences: 20, timeWindowDays: 90 },
];

let patInserted = 0;
for (const p of patterns) {
  try {
    await conn.query(
      `INSERT IGNORE INTO pattern_registry (patternType, domain, jurisdiction, description, minOccurrences, timeWindowDays, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.patternType, p.domain, p.jurisdiction, p.description, p.minOccurrences, p.timeWindowDays, now, now]
    );
    patInserted++;
  } catch(e) { console.error('  Pattern error:', e.message.substring(0,80)); }
}
console.log(`[Pattern Registry] Inserted ${patInserted} patterns`);

// ============================================================
// 3. Settlement Formulas — Need 89 more to hit 100
// ============================================================
console.log('=== SETTLEMENT FORMULAS ===');
const formulas = [
  { claimType: 'wage_theft', jurisdiction: 'Federal', formulaName: 'FLSA Back Pay', baseMultiplier: 2.0, description: 'FLSA allows recovery of unpaid wages plus equal amount as liquidated damages' },
  { claimType: 'wage_theft', jurisdiction: 'Federal', formulaName: 'FLSA Overtime', baseMultiplier: 1.5, description: 'Overtime at 1.5x regular rate for hours over 40/week' },
  { claimType: 'wage_theft', jurisdiction: 'California', formulaName: 'CA Wage Theft', baseMultiplier: 3.0, description: 'CA Labor Code allows treble damages for willful wage theft' },
  { claimType: 'wage_theft', jurisdiction: 'Washington', formulaName: 'WA Wage Recovery', baseMultiplier: 2.0, description: 'WA allows double damages for willful wage violations' },
  { claimType: 'wage_theft', jurisdiction: 'New York', formulaName: 'NY Wage Theft', baseMultiplier: 2.0, description: 'NY WTPA allows liquidated damages equal to unpaid wages' },
  { claimType: 'employment_discrimination', jurisdiction: 'Federal', formulaName: 'Title VII Compensatory', baseMultiplier: 1.0, description: 'Compensatory damages for emotional distress, capped by employer size' },
  { claimType: 'employment_discrimination', jurisdiction: 'Federal', formulaName: 'Title VII Punitive', baseMultiplier: 2.0, description: 'Punitive damages for malicious or reckless discrimination' },
  { claimType: 'employment_discrimination', jurisdiction: 'California', formulaName: 'FEHA Unlimited', baseMultiplier: 3.0, description: 'FEHA has no cap on compensatory or punitive damages' },
  { claimType: 'employment_discrimination', jurisdiction: 'New York', formulaName: 'NYCHRL Enhanced', baseMultiplier: 3.0, description: 'NYC Human Rights Law provides enhanced damages and attorney fees' },
  { claimType: 'housing_discrimination', jurisdiction: 'Federal', formulaName: 'FHA Compensatory', baseMultiplier: 1.0, description: 'Fair Housing Act compensatory damages for actual losses' },
  { claimType: 'housing_discrimination', jurisdiction: 'Federal', formulaName: 'FHA Punitive', baseMultiplier: 2.0, description: 'Fair Housing Act punitive damages for intentional discrimination' },
  { claimType: 'housing_discrimination', jurisdiction: 'California', formulaName: 'CA Fair Housing', baseMultiplier: 3.0, description: 'California fair housing treble damages' },
  { claimType: 'housing_discrimination', jurisdiction: 'Washington', formulaName: 'WLAD Housing', baseMultiplier: 2.0, description: 'Washington Law Against Discrimination housing damages' },
  { claimType: 'wrongful_termination', jurisdiction: 'Federal', formulaName: 'Lost Wages', baseMultiplier: 1.0, description: 'Back pay and front pay for wrongful termination' },
  { claimType: 'wrongful_termination', jurisdiction: 'Federal', formulaName: 'Emotional Distress', baseMultiplier: 0.5, description: 'Emotional distress damages for wrongful termination' },
  { claimType: 'wrongful_termination', jurisdiction: 'California', formulaName: 'CA Wrongful Term', baseMultiplier: 2.0, description: 'California wrongful termination with punitive damages' },
  { claimType: 'disability_discrimination', jurisdiction: 'Federal', formulaName: 'ADA Compensatory', baseMultiplier: 1.0, description: 'ADA compensatory damages capped by employer size' },
  { claimType: 'disability_discrimination', jurisdiction: 'Federal', formulaName: 'ADA Reasonable Accommodation', baseMultiplier: 1.5, description: 'Damages for failure to provide reasonable accommodation' },
  { claimType: 'disability_discrimination', jurisdiction: 'California', formulaName: 'CA ADA Enhanced', baseMultiplier: 3.0, description: 'California disability discrimination with no damage caps' },
  { claimType: 'consumer_protection', jurisdiction: 'Federal', formulaName: 'FDCPA Statutory', baseMultiplier: 1.0, description: 'FDCPA statutory damages up to $1,000 per violation' },
  { claimType: 'consumer_protection', jurisdiction: 'Federal', formulaName: 'FCRA Statutory', baseMultiplier: 1.0, description: 'FCRA statutory damages $100-$1,000 per violation' },
  { claimType: 'consumer_protection', jurisdiction: 'Federal', formulaName: 'TILA Statutory', baseMultiplier: 2.0, description: 'TILA statutory damages twice the finance charge' },
  { claimType: 'consumer_protection', jurisdiction: 'Washington', formulaName: 'WA CPA Treble', baseMultiplier: 3.0, description: 'Washington CPA allows treble damages plus attorney fees' },
  { claimType: 'consumer_protection', jurisdiction: 'California', formulaName: 'CA UCL Restitution', baseMultiplier: 1.0, description: 'California UCL restitution and injunctive relief' },
  { claimType: 'retaliation', jurisdiction: 'Federal', formulaName: 'Whistleblower', baseMultiplier: 2.0, description: 'Whistleblower retaliation double back pay' },
  { claimType: 'retaliation', jurisdiction: 'Federal', formulaName: 'SOX Whistleblower', baseMultiplier: 2.0, description: 'Sarbanes-Oxley whistleblower protections' },
  { claimType: 'retaliation', jurisdiction: 'California', formulaName: 'CA Whistleblower', baseMultiplier: 3.0, description: 'California whistleblower enhanced protections' },
  { claimType: 'sexual_harassment', jurisdiction: 'Federal', formulaName: 'Title VII Sexual Harassment', baseMultiplier: 2.0, description: 'Title VII sexual harassment compensatory and punitive damages' },
  { claimType: 'sexual_harassment', jurisdiction: 'New York', formulaName: 'NYCHRL Harassment', baseMultiplier: 3.0, description: 'NYC Human Rights Law enhanced sexual harassment damages' },
  { claimType: 'sexual_harassment', jurisdiction: 'California', formulaName: 'FEHA Harassment', baseMultiplier: 3.0, description: 'FEHA unlimited damages for sexual harassment' },
  { claimType: 'age_discrimination', jurisdiction: 'Federal', formulaName: 'ADEA Liquidated', baseMultiplier: 2.0, description: 'ADEA liquidated damages for willful violations' },
  { claimType: 'age_discrimination', jurisdiction: 'California', formulaName: 'FEHA Age', baseMultiplier: 3.0, description: 'FEHA age discrimination with no damage caps' },
  { claimType: 'pregnancy_discrimination', jurisdiction: 'Federal', formulaName: 'PDA Damages', baseMultiplier: 2.0, description: 'Pregnancy Discrimination Act compensatory and punitive damages' },
  { claimType: 'pregnancy_discrimination', jurisdiction: 'Federal', formulaName: 'PWFA Accommodation', baseMultiplier: 1.5, description: 'Pregnant Workers Fairness Act accommodation damages' },
  { claimType: 'tenant_rights', jurisdiction: 'Federal', formulaName: 'FHA Tenant', baseMultiplier: 1.0, description: 'Fair Housing Act tenant protection damages' },
  { claimType: 'tenant_rights', jurisdiction: 'Washington', formulaName: 'WA RLTA', baseMultiplier: 2.0, description: 'Washington RLTA damages for landlord violations' },
  { claimType: 'tenant_rights', jurisdiction: 'California', formulaName: 'CA Tenant Protection', baseMultiplier: 3.0, description: 'California tenant protection enhanced damages' },
  { claimType: 'tenant_rights', jurisdiction: 'New York', formulaName: 'NY Tenant Rights', baseMultiplier: 2.0, description: 'New York tenant rights damages and penalties' },
  { claimType: 'police_misconduct', jurisdiction: 'Federal', formulaName: 'Section 1983', baseMultiplier: 1.0, description: 'Section 1983 compensatory damages for constitutional violations' },
  { claimType: 'police_misconduct', jurisdiction: 'Federal', formulaName: 'Section 1983 Punitive', baseMultiplier: 3.0, description: 'Section 1983 punitive damages for egregious misconduct' },
  { claimType: 'ssdi_denial', jurisdiction: 'Federal', formulaName: 'SSDI Back Benefits', baseMultiplier: 1.0, description: 'SSDI back benefits from date of disability onset' },
  { claimType: 'unemployment_denial', jurisdiction: 'Federal', formulaName: 'UI Back Benefits', baseMultiplier: 1.0, description: 'Unemployment insurance back benefits from denial date' },
  { claimType: 'workers_compensation', jurisdiction: 'Federal', formulaName: 'Workers Comp TTD', baseMultiplier: 0.667, description: 'Temporary total disability at 2/3 average weekly wage' },
  { claimType: 'workers_compensation', jurisdiction: 'Washington', formulaName: 'WA Workers Comp', baseMultiplier: 0.75, description: 'Washington workers comp at 75% of average weekly wage' },
  { claimType: 'workers_compensation', jurisdiction: 'California', formulaName: 'CA Workers Comp', baseMultiplier: 0.667, description: 'California workers comp at 2/3 average weekly wage' },
  { claimType: 'medical_malpractice', jurisdiction: 'Federal', formulaName: 'Med Mal Compensatory', baseMultiplier: 1.0, description: 'Medical malpractice compensatory damages' },
  { claimType: 'medical_malpractice', jurisdiction: 'California', formulaName: 'CA MICRA Cap', baseMultiplier: 1.0, description: 'California MICRA non-economic damage cap' },
  { claimType: 'nursing_home_abuse', jurisdiction: 'Federal', formulaName: 'Nursing Home Abuse', baseMultiplier: 2.0, description: 'Nursing home abuse compensatory and punitive damages' },
  { claimType: 'nursing_home_abuse', jurisdiction: 'California', formulaName: 'CA Elder Abuse', baseMultiplier: 3.0, description: 'California Elder Abuse Act enhanced damages' },
  { claimType: 'education_rights', jurisdiction: 'Federal', formulaName: 'IDEA Compensatory Ed', baseMultiplier: 1.0, description: 'IDEA compensatory education services' },
  { claimType: 'education_rights', jurisdiction: 'Federal', formulaName: 'Section 504 Ed', baseMultiplier: 1.0, description: 'Section 504 educational discrimination damages' },
  { claimType: 'voting_rights', jurisdiction: 'Federal', formulaName: 'VRA Damages', baseMultiplier: 1.0, description: 'Voting Rights Act damages and injunctive relief' },
  { claimType: 'immigration', jurisdiction: 'Federal', formulaName: 'Immigration Relief', baseMultiplier: 1.0, description: 'Immigration relief and status adjustment' },
  { claimType: 'debt_collection', jurisdiction: 'Federal', formulaName: 'FDCPA Class Action', baseMultiplier: 1.0, description: 'FDCPA class action damages up to $500,000' },
  { claimType: 'debt_collection', jurisdiction: 'New York', formulaName: 'NY Debt Collection', baseMultiplier: 2.0, description: 'New York enhanced debt collection violation damages' },
  { claimType: 'predatory_lending', jurisdiction: 'Federal', formulaName: 'TILA Rescission', baseMultiplier: 1.0, description: 'TILA right of rescission for predatory loans' },
  { claimType: 'predatory_lending', jurisdiction: 'Federal', formulaName: 'ECOA Damages', baseMultiplier: 1.0, description: 'Equal Credit Opportunity Act damages' },
  { claimType: 'genetic_discrimination', jurisdiction: 'Federal', formulaName: 'GINA Damages', baseMultiplier: 2.0, description: 'GINA compensatory and punitive damages' },
  { claimType: 'military_employment', jurisdiction: 'Federal', formulaName: 'USERRA Damages', baseMultiplier: 2.0, description: 'USERRA liquidated damages for willful violations' },
  { claimType: 'plant_closing', jurisdiction: 'Federal', formulaName: 'WARN Act', baseMultiplier: 1.0, description: 'WARN Act 60 days back pay and benefits per employee' },
  { claimType: 'equal_pay', jurisdiction: 'Federal', formulaName: 'EPA Liquidated', baseMultiplier: 2.0, description: 'Equal Pay Act liquidated damages' },
  { claimType: 'equal_pay', jurisdiction: 'California', formulaName: 'CA Equal Pay', baseMultiplier: 3.0, description: 'California Fair Pay Act enhanced damages' },
  { claimType: 'family_leave', jurisdiction: 'Federal', formulaName: 'FMLA Liquidated', baseMultiplier: 2.0, description: 'FMLA liquidated damages for willful violations' },
  { claimType: 'family_leave', jurisdiction: 'Washington', formulaName: 'WA PFML', baseMultiplier: 1.0, description: 'Washington Paid Family Medical Leave benefits' },
  { claimType: 'fair_credit', jurisdiction: 'Federal', formulaName: 'FCRA Willful', baseMultiplier: 3.0, description: 'FCRA punitive damages for willful violations' },
  { claimType: 'auto_fraud', jurisdiction: 'Federal', formulaName: 'Magnuson-Moss', baseMultiplier: 2.0, description: 'Magnuson-Moss Warranty Act damages' },
  { claimType: 'auto_fraud', jurisdiction: 'California', formulaName: 'CA Lemon Law', baseMultiplier: 2.0, description: 'California Lemon Law buyback plus damages' },
  { claimType: 'insurance_bad_faith', jurisdiction: 'Federal', formulaName: 'Bad Faith Punitive', baseMultiplier: 3.0, description: 'Insurance bad faith punitive damages' },
  { claimType: 'insurance_bad_faith', jurisdiction: 'Washington', formulaName: 'WA Insurance Bad Faith', baseMultiplier: 3.0, description: 'Washington insurance bad faith treble damages' },
];

let sfInserted = 0;
for (const f of formulas) {
  try {
    await conn.query(
      `INSERT IGNORE INTO settlement_formulas (claimType, jurisdiction, formulaName, baseMultiplier, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [f.claimType, f.jurisdiction, f.formulaName, f.baseMultiplier, f.description, now, now]
    );
    sfInserted++;
  } catch(e) { console.error('  Formula error:', e.message.substring(0,80)); }
}
console.log(`[Settlement Formulas] Inserted ${sfInserted} formulas`);

// ============================================================
// 4. Evidence Confidence Rules — Need 58 more to hit 100
// ============================================================
console.log('=== EVIDENCE CONFIDENCE RULES ===');
const ecRules = [
  { evidence_type: 'employment_contract', claim_type: 'wage_theft', base_weight: 90, description: 'Written employment contract showing agreed wage terms' },
  { evidence_type: 'pay_stubs', claim_type: 'wage_theft', base_weight: 85, description: 'Pay stubs showing actual wages paid' },
  { evidence_type: 'time_records', claim_type: 'wage_theft', base_weight: 80, description: 'Time clock or timesheet records' },
  { evidence_type: 'bank_statements', claim_type: 'wage_theft', base_weight: 75, description: 'Bank statements showing deposits from employer' },
  { evidence_type: 'witness_statement', claim_type: 'wage_theft', base_weight: 60, description: 'Co-worker witness statements about pay practices' },
  { evidence_type: 'email_correspondence', claim_type: 'employment_discrimination', base_weight: 85, description: 'Emails showing discriminatory language or intent' },
  { evidence_type: 'performance_review', claim_type: 'employment_discrimination', base_weight: 75, description: 'Performance reviews showing pretext for adverse action' },
  { evidence_type: 'comparator_evidence', claim_type: 'employment_discrimination', base_weight: 80, description: 'Evidence of similarly situated employees treated differently' },
  { evidence_type: 'statistical_data', claim_type: 'employment_discrimination', base_weight: 70, description: 'Statistical evidence of disparate impact' },
  { evidence_type: 'hr_complaint', claim_type: 'employment_discrimination', base_weight: 65, description: 'HR complaint records and responses' },
  { evidence_type: 'lease_agreement', claim_type: 'housing_discrimination', base_weight: 90, description: 'Lease agreement showing terms and conditions' },
  { evidence_type: 'correspondence', claim_type: 'housing_discrimination', base_weight: 80, description: 'Written correspondence with landlord/property manager' },
  { evidence_type: 'testing_evidence', claim_type: 'housing_discrimination', base_weight: 95, description: 'Fair housing testing evidence showing differential treatment' },
  { evidence_type: 'photos', claim_type: 'housing_discrimination', base_weight: 70, description: 'Photos of property conditions or discriminatory notices' },
  { evidence_type: 'medical_records', claim_type: 'disability_discrimination', base_weight: 90, description: 'Medical records documenting disability' },
  { evidence_type: 'accommodation_request', claim_type: 'disability_discrimination', base_weight: 85, description: 'Written reasonable accommodation request' },
  { evidence_type: 'denial_letter', claim_type: 'disability_discrimination', base_weight: 80, description: 'Employer denial of accommodation request' },
  { evidence_type: 'interactive_process', claim_type: 'disability_discrimination', base_weight: 75, description: 'Records of interactive process (or lack thereof)' },
  { evidence_type: 'collection_letter', claim_type: 'consumer_protection', base_weight: 85, description: 'Debt collection letters showing violations' },
  { evidence_type: 'call_recording', claim_type: 'consumer_protection', base_weight: 90, description: 'Recordings of harassing debt collection calls' },
  { evidence_type: 'credit_report', claim_type: 'consumer_protection', base_weight: 80, description: 'Credit report showing inaccurate information' },
  { evidence_type: 'contract', claim_type: 'consumer_protection', base_weight: 85, description: 'Consumer contract with deceptive terms' },
  { evidence_type: 'police_report', claim_type: 'police_misconduct', base_weight: 70, description: 'Police report (may be self-serving)' },
  { evidence_type: 'body_camera', claim_type: 'police_misconduct', base_weight: 95, description: 'Body camera footage of incident' },
  { evidence_type: 'bystander_video', claim_type: 'police_misconduct', base_weight: 90, description: 'Bystander video recording of incident' },
  { evidence_type: 'medical_records', claim_type: 'police_misconduct', base_weight: 85, description: 'Medical records showing injuries from police encounter' },
  { evidence_type: 'complaint_history', claim_type: 'police_misconduct', base_weight: 75, description: 'Officer complaint history showing pattern' },
  { evidence_type: 'denial_letter', claim_type: 'ssdi_denial', base_weight: 90, description: 'SSA denial letter with stated reasons' },
  { evidence_type: 'medical_records', claim_type: 'ssdi_denial', base_weight: 95, description: 'Medical records supporting disability claim' },
  { evidence_type: 'doctor_opinion', claim_type: 'ssdi_denial', base_weight: 85, description: 'Treating physician opinion on limitations' },
  { evidence_type: 'work_history', claim_type: 'ssdi_denial', base_weight: 70, description: 'Work history showing inability to perform past work' },
  { evidence_type: 'vocational_assessment', claim_type: 'ssdi_denial', base_weight: 80, description: 'Vocational expert assessment' },
  { evidence_type: 'termination_letter', claim_type: 'wrongful_termination', base_weight: 85, description: 'Termination letter with stated reasons' },
  { evidence_type: 'timeline', claim_type: 'wrongful_termination', base_weight: 80, description: 'Timeline showing proximity of protected activity to termination' },
  { evidence_type: 'performance_history', claim_type: 'wrongful_termination', base_weight: 75, description: 'Performance history showing pretext' },
  { evidence_type: 'handbook_policy', claim_type: 'wrongful_termination', base_weight: 70, description: 'Employee handbook showing policy violations by employer' },
  { evidence_type: 'incident_report', claim_type: 'nursing_home_abuse', base_weight: 80, description: 'Facility incident report' },
  { evidence_type: 'medical_records', claim_type: 'nursing_home_abuse', base_weight: 90, description: 'Medical records showing unexplained injuries or decline' },
  { evidence_type: 'staffing_records', claim_type: 'nursing_home_abuse', base_weight: 75, description: 'Staffing records showing understaffing' },
  { evidence_type: 'cms_survey', claim_type: 'nursing_home_abuse', base_weight: 85, description: 'CMS survey results showing deficiencies' },
  { evidence_type: 'iep_document', claim_type: 'education_rights', base_weight: 90, description: 'IEP document showing agreed services' },
  { evidence_type: 'progress_report', claim_type: 'education_rights', base_weight: 75, description: 'Progress reports showing lack of progress' },
  { evidence_type: 'evaluation', claim_type: 'education_rights', base_weight: 85, description: 'Independent educational evaluation' },
  { evidence_type: 'meeting_notes', claim_type: 'education_rights', base_weight: 70, description: 'IEP meeting notes showing procedural violations' },
  { evidence_type: 'financial_records', claim_type: 'elder_financial_abuse', base_weight: 90, description: 'Financial records showing unauthorized transactions' },
  { evidence_type: 'power_of_attorney', claim_type: 'elder_financial_abuse', base_weight: 85, description: 'Power of attorney documents showing scope' },
  { evidence_type: 'bank_records', claim_type: 'elder_financial_abuse', base_weight: 95, description: 'Bank records showing suspicious withdrawals' },
  { evidence_type: 'capacity_assessment', claim_type: 'elder_financial_abuse', base_weight: 80, description: 'Capacity assessment showing vulnerability' },
  { evidence_type: 'asylum_application', claim_type: 'immigration', base_weight: 85, description: 'Asylum application with supporting narrative' },
  { evidence_type: 'country_conditions', claim_type: 'immigration', base_weight: 80, description: 'Country conditions evidence from State Dept or NGOs' },
  { evidence_type: 'personal_declaration', claim_type: 'immigration', base_weight: 75, description: 'Personal declaration of persecution' },
  { evidence_type: 'expert_witness', claim_type: 'immigration', base_weight: 85, description: 'Expert witness on country conditions' },
  { evidence_type: 'dd214', claim_type: 'veterans_benefits', base_weight: 95, description: 'DD-214 discharge papers' },
  { evidence_type: 'service_records', claim_type: 'veterans_benefits', base_weight: 90, description: 'Military service records' },
  { evidence_type: 'va_decision', claim_type: 'veterans_benefits', base_weight: 85, description: 'VA decision letter' },
  { evidence_type: 'buddy_statement', claim_type: 'veterans_benefits', base_weight: 70, description: 'Buddy statement from fellow service member' },
  { evidence_type: 'nexus_letter', claim_type: 'veterans_benefits', base_weight: 90, description: 'Medical nexus letter connecting condition to service' },
  { evidence_type: 'tribal_enrollment', claim_type: 'icwa', base_weight: 95, description: 'Tribal enrollment or eligibility documentation' },
];

let ecInserted = 0;
for (const r of ecRules) {
  try {
    await conn.query(
      `INSERT IGNORE INTO evidence_confidence_rules (evidence_type, claim_type, base_weight, description, created_at) VALUES (?, ?, ?, ?, NOW())`,
      [r.evidence_type, r.claim_type, r.base_weight, r.description]
    );
    ecInserted++;
  } catch(e) { console.error('  EC Rule error:', e.message.substring(0,80)); }
}
console.log(`[Evidence Confidence Rules] Inserted ${ecInserted} rules`);

// ============================================================
// Final counts
// ============================================================
console.log('=== FINAL COUNTS ===');
for (const t of ['signal_registry', 'pattern_registry', 'settlement_formulas', 'evidence_confidence_rules']) {
  const [[row]] = await conn.query(`SELECT COUNT(*) as cnt FROM ${t}`);
  console.log(`  ${t}: ${row.cnt}`);
}

await conn.end();
console.log('Session 63 boost complete!');
