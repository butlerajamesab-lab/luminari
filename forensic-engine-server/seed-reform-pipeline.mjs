/**
 * Seed Reform Pipeline Data
 * Sources: pasted_content.txt (reform packages) + pasted_content_2.txt (coalition intelligence)
 * Tables: reform_packages, advocacy_targets, coalition_legislators, coalition_agencies,
 *         coalition_advocacy_orgs, media_outlets (create), active_campaigns (create)
 */
import mysql from "mysql2/promise";

const dbUrl = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || "4000"),
  user: dbUrl.username,
  password: decodeURIComponent(dbUrl.password),
  database: "luminari_registry",
  ssl: { rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 5,
});

const now = Date.now();

// ─── CREATE MISSING TABLES ───────────────────────────────────────────────────

async function createTables(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS media_outlets (
      outlet_id VARCHAR(80) NOT NULL PRIMARY KEY,
      outlet_name VARCHAR(200) NOT NULL,
      outlet_type VARCHAR(100) NULL,
      coverage TEXT NULL,
      audience TEXT NULL,
      contact_email VARCHAR(200) NULL,
      website VARCHAR(500) NULL,
      domains JSON NULL,
      investigative TINYINT(1) NOT NULL DEFAULT 0,
      partnership_potential ENUM('HIGH','MEDIUM-HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);
  console.log("✓ media_outlets table ready");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS active_campaigns (
      campaign_id VARCHAR(80) NOT NULL PRIMARY KEY,
      campaign_name VARCHAR(300) NOT NULL,
      domain VARCHAR(80) NULL,
      status_stage VARCHAR(80) NULL,
      primary_sponsor VARCHAR(200) NULL,
      coalition_leads JSON NULL,
      demand TEXT NULL,
      legislative_vehicle VARCHAR(300) NULL,
      target_passage VARCHAR(200) NULL,
      current_stage VARCHAR(200) NULL,
      next_milestone TEXT NULL,
      advocacy_action TEXT NULL,
      supporting_evidence JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);
  console.log("✓ active_campaigns table ready");
}

// ─── REFORM PACKAGES ─────────────────────────────────────────────────────────

const REFORM_PACKAGES = [
  {
    package_id: "reform_001",
    pattern_id: "wage_theft_pattern",
    title: "Wage Theft Prevention Act: Mandatory Liquidated Damages + Enforcement Funding",
    status: "published",
    executive_summary: "Federal wage theft enforcement is underfunded, allowing systematic violations to persist. Current FLSA penalties are discretionary and minimal (~$50/violation). DOL investigation backlog exceeds 18 months. Recommended: (1) Amend FLSA to make liquidated damages mandatory (8 hours per violation, matching CA model), (2) Increase DOL Wage & Hour budget $300M → $500M, (3) Add private right of action for retaliation during wage claims.",
    evidence_section: JSON.stringify({
      luminari_signals: [
        "619 wage theft cases in system; 78% from states with weak protections (SOL < 3 years, minimal penalties)",
        "Mississippi wage theft SOL: 1 year (shortest in nation); 45% success rate vs national 75%",
        "Employer repeat violation rate: 3-5 violations per employer in states with minimal penalties; drops to <1 in CA",
        "DOL investigation timeline: average 18 months; creates gap allowing continued violations"
      ],
      enforcement_data: [
        "DOL WHD 2023: 8,000 investigations, $1.2B back wages recovered",
        "If investigations doubled + penalties increased: estimated $3-4B annual recovery",
        "NELP analysis: 2M+ workers affected by wage theft annually; average underpayment $2,500/worker/year"
      ]
    }),
    root_cause_section: JSON.stringify({
      cause_1: "Discretionary liquidated damages in FLSA § 216 allow judges/juries to award $0 if employer shows 'good faith'",
      cause_2: "Minimal statutory penalties ($50-100/violation) don't deter repeat violations; ROI for employers positive if caught",
      cause_3: "DOL Wage & Hour Division underfunded relative to caseload; investigation backlog growing",
      cause_4: "No federal private right of action for retaliation during wage claims; workers fear retaliation"
    }),
    recommended_reforms_section: JSON.stringify({
      legislative: [
        { reform: "Amend 29 USC § 216 - Liquidated Damages Mandate", language: "Liquidated damages shall be awarded in an amount equal to the unpaid wages or in an amount of 8 hours' work per day per violation, whichever is greater, unless the employer demonstrates by clear and convincing evidence that the violation was in good faith.", model_statute: "California Labor Code § 1194" },
        { reform: "Amend 29 USC § 216 - Penalty Increase + Inflation Indexing", language: "Civil penalties shall be $500 per day per employee per violation (adjusted annually for inflation). Penalties double for repeat violations within 5 years. Penalties triple for willful violations.", current: "$50-100/day (enacted 1938)", proposed: "$500/day (2026 dollars); indexed to inflation" },
        { reform: "Add 29 USC § 215(a)(3) - Retaliation Protection", language: "It shall be unlawful for any employer to discharge or otherwise discriminate against any employee because such employee has filed a wage claim, participated in an investigation, or pursued a wage theft action under this Act." }
      ],
      regulatory: [{ reform: "DOL Wage & Hour Division Rule Update", agency: "Department of Labor", change: "Streamline investigative procedures to reduce 18-month backlog to <6 months. Increase regional office staffing 50%." }]
    }),
    implementation_roadmap_section: JSON.stringify({
      phase_1: { timeline: "Months 1-3", actions: ["Coalition coordination: AFL-CIO, NELP, legal aid programs align on legislative language", "Legislative draft: Senate HELP Committee staff draft bill", "Media campaign: ProPublica investigates wage theft enforcement gaps"] },
      phase_2: { timeline: "Months 4-9", actions: ["Bill introduction: Senator Bernie Sanders + 25 co-sponsors introduce bill", "Committee hearings: HELP Committee hears testimony from workers, DOL, legal aid orgs", "Coalition pressure: Labor unions mobilize members; constituent visits to key members"] },
      phase_3: { timeline: "Months 10-18", actions: ["Floor debate and passage (if committee approves)", "House introduction and movement through Education and Workforce Committee", "Implementation: DOL rulemaking to implement penalty structure + enforcement protocol"] }
    }),
    supporting_data_section: JSON.stringify({
      coalition_partners: ["AFL-CIO", "NELP", "Legal Aid programs", "Worker Centers (national network)", "SEIU"],
      estimated_impact: { enforcement_volume: "DOL investigations increase from 8K to 15K annually", recovery_increase: "Back wages recovered increase from $1.2B to $3-4B annually", employer_deterrence: "Repeat violation rate drops 60-70%" },
      legislative_models: ["California Labor Code § 1194", "OSHA retaliation protection structure (29 USC § 660)", "Fair Debt Collection Practices Act penalty structure (15 USC § 1692)"]
    }),
    jurisdiction: "federal",
    reform_type: "employment",
  },
  {
    package_id: "reform_002",
    pattern_id: "housing_denial_pattern",
    title: "Housing Affordability Act: Eviction Prevention + Just-Cause Requirements",
    status: "published",
    executive_summary: "Eviction is leading cause of homelessness. Current federal law (Fair Housing Act) covers discrimination but not eviction protection. Recommended: (1) Federal just-cause eviction requirement, (2) Emergency rental assistance program reauthorization + expansion, (3) State enforcement of FHA eviction discrimination rules.",
    evidence_section: JSON.stringify({ luminari_signals: ["145 housing denial + unlawful eviction cases in system", "Geographic cluster: Southern states (TX, LA, MS, AL, GA) have highest unlawful eviction rates", "Temporal pattern: Eviction filings spike in months following policy changes", "Causal chain: Wage theft → debt → housing instability → eviction → homelessness"] }),
    root_cause_section: JSON.stringify({ cause_1: "Federal law allows no-cause evictions in most states", cause_2: "Emergency rental assistance programs (pandemic-era) expiring; no permanent federal housing stabilization fund", cause_3: "Fair Housing Act enforcement insufficient; landlords use seemingly-neutral reasons as proxies for discrimination" }),
    recommended_reforms_section: JSON.stringify({ legislative: [{ reform: "Add 42 USC § 3606 - Federal Just-Cause Eviction Standard", language: "No person shall be evicted from a dwelling except for one of the following causes: (1) nonpayment of rent; (2) lease violation (curable with 30-day notice to cure); (3) lease violation (non-curable); (4) illegal use of dwelling; (5) substantial damage to dwelling. Retaliatory evictions prohibited (within 180 days of complaint about housing violations).", model_statute: "California just-cause eviction law (Cal. Civ. Code § 1946.2)" }, { reform: "Reauthorize Emergency Rental Assistance as Permanent Program", language: "Establish permanent federal rental assistance fund ($5B annually) for low-income renters at risk of eviction. Eligibility: household income < 80% AMI; at risk of homelessness." }] }),
    implementation_roadmap_section: JSON.stringify({ phase_1: { timeline: "Months 1-4", actions: ["State-level pilots: 5 states implement just-cause eviction + federal monitoring", "Coalition: HUD, legal aid, housing advocates align on language"] }, phase_2: { timeline: "Months 5-12", actions: ["Federal legislation introduced (House + Senate)", "Committee hearings with state/local data on eviction + homelessness"] }, phase_3: { timeline: "Months 13-24", actions: ["Federal statute passage", "HUD rulemaking + state implementation guidelines", "Federal rental assistance program activation"] } }),
    supporting_data_section: JSON.stringify({ coalition_partners: ["National Low Income Housing Coalition", "Legal Aid programs", "HUD Office of Community Planning", "Homeless advocacy orgs"], estimated_impact: { evictions_prevented: "500K-1M evictions prevented annually", homelessness_reduction: "Permanent rental assistance + eviction prevention: estimated 20-30% reduction in homelessness" } }),
    jurisdiction: "federal",
    reform_type: "housing",
  },
  {
    package_id: "reform_003",
    pattern_id: "police_accountability_pattern",
    title: "Qualified Immunity Limitation Act: Restore Civil Rights Accountability",
    status: "published",
    executive_summary: "Qualified immunity doctrine allows government officials to escape civil rights liability unless rights were 'clearly established' at time of violation. Current standard makes 70% of police misconduct cases dismissible. Recommended: (1) Raise 'clearly established' bar / shift burden to officers, (2) Allow damages for negligent violations, (3) Municipal liability expansion.",
    evidence_section: JSON.stringify({ luminari_signals: ["89 police accountability cases in system; 71% dismissed on qualified immunity grounds (not on merits)", "Pattern: Identical violations have different outcomes based on whether prior case exists in jurisdiction", "Weak joint: 'Clearly established right' standard too high; requires near-identical prior case"] }),
    root_cause_section: JSON.stringify({ cause_1: "Harlow v. Fitzgerald (1982) established qualified immunity; 40+ years of Supreme Court precedent narrowing civil rights recovery", cause_2: "Clearly established right standard requires prior case on point; new violations escape liability", cause_3: "Burden on plaintiff to show right was clearly established; creates perverse incentive" }),
    recommended_reforms_section: JSON.stringify({ legislative: [{ reform: "Amend 42 USC § 1983 - Qualified Immunity Limitation", language: "Government officials acting under color of law shall be liable for damages unless they can demonstrate by clear and convincing evidence that their conduct did not violate a constitutional right that was established by prior case law, statute, or longstanding custom.", model_statute: "Colorado HB21-1281, New York S6457" }, { reform: "Amend 42 USC § 1983(c) - Municipal Liability Expansion", language: "A municipality shall be liable for damages resulting from official policy, custom, or practice that causes civil rights violations. Pattern of similar violations by multiple officers shall constitute evidence of municipal policy or custom." }] }),
    implementation_roadmap_section: JSON.stringify({ phase_1: { timeline: "Months 1-6", actions: ["State-level qualified immunity limits as model legislation", "Coalition: ACLU, NAACP, civil rights orgs coordinate on federal bill"] }, phase_2: { timeline: "Months 7-18", actions: ["Federal bill introduction (House Judiciary Committee)", "Media campaign on wrongful conviction + police misconduct cases"] } }),
    supporting_data_section: JSON.stringify({ coalition_partners: ["ACLU", "NAACP", "police accountability orgs", "civil rights lawyers"], estimated_impact: { cases_restored: "Estimated 20% of currently-dismissed cases would survive summary judgment", damages_increase: "Average damages per case increase from $0 (dismissed) to $100K-500K" } }),
    jurisdiction: "federal",
    reform_type: "civil_rights",
  },
  {
    package_id: "reform_004",
    pattern_id: "benefits_denial_pattern",
    title: "Benefits Modernization Act: Streamline SSDI/Medicaid Appeals + Increase SNAP Benefits",
    status: "published",
    executive_summary: "Benefits appeals backlog exceeds 1M cases; average wait time 2-3 years. Medicaid coverage remains fragmented. SNAP benefits inadequate (~$100-150/month per person). Recommended: (1) Reduce SSA appeals backlog via ALJ staffing increase, (2) Require all states to adopt Medicaid expansion, (3) Index SNAP benefits to inflation.",
    evidence_section: JSON.stringify({ luminari_signals: ["312 benefits denial cases in system; 48% of SSDI denials overturned on appeal (indicates initial error rate ~25-30%)", "Geographic cluster: Non-expansion Medicaid states (MS, LA, TX, WY) have 2-3x higher wrongful denial rates", "Temporal pattern: SSDI appeal wait time increased 50% in past 5 years (2021-2026)"] }),
    root_cause_section: JSON.stringify({ cause_1: "SSA Administrative Law Judge (ALJ) positions unfilled; backlog growing faster than resolution", cause_2: "Medicaid non-expansion states lack resources; higher error rates in initial eligibility determinations", cause_3: "SNAP benefits frozen at pre-2009 levels; inflation eroded purchasing power 40%" }),
    recommended_reforms_section: JSON.stringify({ legislative: [{ reform: "Amend 42 USC § 405 - SSA Appeals Timeline + ALJ Staffing", language: "The Social Security Administration shall hire sufficient Administrative Law Judges to ensure initial hearing decision within 180 days of request. All appeals levels shall complete review within 365 days of receipt." }, { reform: "Amend 42 USC § 1396a - Medicaid Expansion Requirement", language: "All states shall provide Medicaid coverage to individuals with income up to 138% federal poverty line. Federal matching rate: 90%." }, { reform: "Amend 7 USC § 2017 - SNAP Benefit Adequacy + Inflation Indexing", language: "SNAP maximum monthly benefit shall be indexed annually for inflation. Minimum benefit increase: 25% over 5-year period." }] }),
    implementation_roadmap_section: JSON.stringify({ phase_1: { timeline: "Months 1-6", actions: ["SSA ALJ hiring initiative", "Medicaid expansion pressure on holdout states"] }, phase_2: { timeline: "Months 7-18", actions: ["Federal legislation for mandatory Medicaid expansion", "SNAP benefit indexing amendment to farm bill"] } }),
    supporting_data_section: JSON.stringify({ coalition_partners: ["Center on Budget and Policy Priorities (CBPP)", "National Disability Rights Network", "food security advocates"], estimated_impact: { ssdi_appeals: "Backlog cleared within 3-5 years; 500K+ people receive benefits faster", medicaid_coverage: "3-4M additional people gain Medicaid coverage" } }),
    jurisdiction: "federal",
    reform_type: "benefits",
  },
  {
    package_id: "reform_005",
    pattern_id: "healthcare_denial_pattern",
    title: "Healthcare Access Accountability Act: Enforce ACA Coverage Denials + Mental Health Parity",
    status: "published",
    executive_summary: "ACA requires coverage of certain services + mental health parity, but enforcement weak. Insurance companies deny medically necessary care; appeals process opaque. Recommended: (1) Increase CMS enforcement funding, (2) Strengthen mental health parity enforcement, (3) Expedited appeals for medically necessary denials.",
    evidence_section: JSON.stringify({ luminari_signals: ["67 healthcare coverage denial cases; 65% of denials were medically necessary (overturned on appeal)", "Mental health parity violations: insurance companies deny mental health treatment while covering similar medical conditions; appeals backlog 6+ months"] }),
    root_cause_section: JSON.stringify({ cause_1: "CMS Office for Civil Rights underfunded relative to insurance company violations", cause_2: "Mental health parity enforcement delegated to states; inconsistent implementation" }),
    recommended_reforms_section: JSON.stringify({ legislative: [{ reform: "Increase CMS Office for Civil Rights Enforcement Budget", language: "Appropriations: $200M annually for ACA enforcement (investigation of coverage denials, appeals monitoring)", current: "$50M budget", proposed: "$200M (4x increase)" }, { reform: "Amend 42 USC § 300gg-13 - Mental Health Parity Enforcement", language: "CMS shall establish national standard for mental health parity enforcement. Insurance companies denying mental health coverage must provide written justification + path to appeal. Appeals decisions due within 15 days for urgent cases." }] }),
    implementation_roadmap_section: JSON.stringify({ phase_1: { timeline: "Months 1-6", actions: ["CMS enforcement funding increase via appropriations", "Mental health parity enforcement rule update"] } }),
    supporting_data_section: JSON.stringify({ coalition_partners: ["National Health Law Program (NHeLP)", "mental health advocacy orgs", "patient advocate groups"], estimated_impact: { coverage_denial_reduction: "Increased enforcement could prevent 100K+ wrongful denials annually", mental_health_access: "Mental health parity enforcement increases coverage + reduces disparities 30-40%" } }),
    jurisdiction: "federal",
    reform_type: "healthcare",
  },
  {
    package_id: "reform_006",
    pattern_id: "foia_withholding_pattern",
    title: "FOIA Transparency Act: Enforce Disclosure + Reduce Appeal Delays",
    status: "published",
    executive_summary: "Agencies delay FOIA responses; some never respond. Current timeline: 20 days (often extended indefinitely). Recommended: (1) Strict enforcement of 20-day deadline (extensions limited), (2) Increase DOJ enforcement capacity, (3) Presumption of disclosure (burden on agency to justify withholding).",
    evidence_section: JSON.stringify({ luminari_signals: ["34 FOIA cases; 50% of agencies exceeded 20-day deadline + extensions", "Pattern: Agencies with enforcement jurisdiction (DOL, FTC, EEOC) slower to disclose enforcement data (suspected delay to limit transparency)"] }),
    root_cause_section: JSON.stringify({ cause_1: "DOJ FOIA enforcement office underfunded; can only pursue subset of delay cases", cause_2: "Agencies abuse extension provision; extensions stack indefinitely" }),
    recommended_reforms_section: JSON.stringify({ legislative: [{ reform: "Amend 5 USC § 552(a)(4) - Deadline Enforcement + Extension Limits", language: "Agencies shall respond to FOIA requests within 20 calendar days. Extensions of 10 days are permitted once; multiple extensions prohibited. Requests failing to meet deadline shall be considered 'deemed released'.", proposed: "One extension only; deemed release for deadline violations" }] }),
    implementation_roadmap_section: JSON.stringify({ phase_1: { timeline: "Months 1-6", actions: ["DOJ FOIA enforcement office funding increase", "Agency compliance reporting requirement"] } }),
    supporting_data_section: JSON.stringify({ coalition_partners: ["ACLU Freedom of Information Project", "government transparency orgs"], estimated_impact: { disclosure_rate: "Increased from ~70% compliance to 95%+ compliance", appeal_timeline: "Average FOIA resolution reduced from 18+ months to <6 months" } }),
    jurisdiction: "federal",
    reform_type: "oversight",
  },
  {
    package_id: "reform_007",
    pattern_id: "debt_collection_pattern",
    title: "Debt Collection Reform Act: Strengthen FDCPA + State Protections",
    status: "published",
    executive_summary: "Debt collectors violate FDCPA repeatedly; penalties low ($1,000 per lawsuit cap ineffective). State laws stronger but inconsistent. Recommended: (1) Increase FDCPA statutory damages, (2) Require federal licensing of debt collectors, (3) Strengthen state debt collection protections.",
    evidence_section: JSON.stringify({ luminari_signals: ["78 debt collection violation cases; repeat violators (same collectors) appear 3-5 times (indicates penalties insufficient deterrent)"] }),
    root_cause_section: JSON.stringify({ cause_1: "FDCPA statutory damages $1,000/lawsuit (enacted 1977; not adjusted for inflation or severity)" }),
    recommended_reforms_section: JSON.stringify({ legislative: [{ reform: "Amend 15 USC § 1692k - FDCPA Damages Increase", language: "Statutory damages shall be $5,000 per violation (not per lawsuit). Repeat violators within 5 years: treble damages (up to $15,000). Attorney fees mandatory.", current: "$1,000 per lawsuit (cap)", proposed: "$5,000 per violation; treble for repeats" }] }),
    implementation_roadmap_section: JSON.stringify({ phase_1: { timeline: "Months 1-6", actions: ["CFPB rulemaking on FDCPA damages", "Federal licensing requirement for debt collectors"] } }),
    supporting_data_section: JSON.stringify({ coalition_partners: ["Consumer Federation of America (CFA)", "consumer advocacy orgs", "legal aid"], estimated_impact: { deterrence: "Higher penalties reduce repeat violations 40-50%" } }),
    jurisdiction: "federal",
    reform_type: "consumer_protection",
  },
  {
    package_id: "reform_008",
    pattern_id: "predatory_lending_pattern",
    title: "Predatory Lending Prevention Act: Strengthen TILA + RESPA Enforcement",
    status: "published",
    executive_summary: "Predatory lending (payday loans, medical debt collection) proliferates. TILA enforcement weak. Recommended: (1) Increase CFPB enforcement funding, (2) Strengthen TILA disclosure requirements, (3) Prohibit payday lending without rate caps.",
    evidence_section: JSON.stringify({ luminari_signals: ["45 predatory lending cases; majority payday loans (400%+ APR) and medical debt collection"] }),
    root_cause_section: JSON.stringify({ cause_1: "CFPB enforcement funding limited; can only pursue subset of violations", cause_2: "Payday lending unregulated at federal level (state regulation varies widely)" }),
    recommended_reforms_section: JSON.stringify({ legislative: [{ reform: "Extend TILA to Payday Loans + Add Rate Caps", language: "Payday loans (repayable within 45 days) shall be subject to TILA disclosure + rate cap of 36% APR (matching military lending cap). Violations subject to $5,000 statutory damages + treble damages for willful.", model_statute: "Military Lending Act (37 USC § 987 - 36% cap + disclosure)" }] }),
    implementation_roadmap_section: JSON.stringify({ phase_1: { timeline: "Months 1-6", actions: ["CFPB rulemaking on payday lending rate caps", "TILA extension to cover short-term loans"] } }),
    supporting_data_section: JSON.stringify({ coalition_partners: ["Consumer Federation of America", "Center for Responsible Lending", "consumer advocacy orgs"], estimated_impact: { borrower_protection: "36% rate cap prevents worst predatory lending; estimated savings $10B+ annually for consumers" } }),
    jurisdiction: "federal",
    reform_type: "consumer_protection",
  },
  {
    package_id: "reform_009",
    pattern_id: "retaliation_pattern",
    title: "Workplace Retaliation Prevention Act: Strengthen Whistleblower + Anti-Retaliation Protections",
    status: "published",
    executive_summary: "Whistleblower retaliation common; protections fragmented (OSHA 30-day deadline, Title VII, FLSA). Recommended: (1) Unified whistleblower protection statute, (2) Extend 30-day deadline, (3) Increase damages for retaliation.",
    evidence_section: JSON.stringify({ luminari_signals: ["156 retaliation cases; 60% involve whistleblower activity (safety complaint, wage claim, regulatory complaint)", "Temporal pattern: termination within 30 days of complaint 75% of cases (indicates motivation)"] }),
    root_cause_section: JSON.stringify({ cause_1: "Whistleblower protections fragmented across statutes (OSHA, FLSA, Title VII); confusing for workers", cause_2: "OSHA 30-day deadline strict; workers often don't realize deadline before missing it" }),
    recommended_reforms_section: JSON.stringify({ legislative: [{ reform: "Unified Whistleblower Protection Statute", language: "Create 29 USC § 701 (new): Unified whistleblower protection covering all federal employment laws. Protects employee for: (1) reporting law violation to government agency, (2) filing regulatory complaint, (3) refusing illegal order, (4) safety complaint. Retaliation prohibited for 180 days post-complaint (not 30 days). Damages: back pay + reinstatement + compensatory damages.", model_statute: "OSHA retaliation framework + FLSA extension" }] }),
    implementation_roadmap_section: JSON.stringify({ phase_1: { timeline: "Months 1-6", actions: ["Unified whistleblower bill introduction (Senate HELP Committee)", "Coalition: AFL-CIO, worker advocacy orgs align on language"] } }),
    supporting_data_section: JSON.stringify({ coalition_partners: ["AFL-CIO", "worker advocacy orgs", "whistleblower protection organizations"], estimated_impact: { protection_effectiveness: "Unified statute increases worker willingness to report violations 20-30%" } }),
    jurisdiction: "federal",
    reform_type: "employment",
  },
  {
    package_id: "reform_010",
    pattern_id: "civil_rights_litigation_pattern",
    title: "Judicial Efficiency Act: Reduce Civil Rights Litigation Timeline + Barriers",
    status: "published",
    executive_summary: "Civil rights litigation takes 3-5 years average; qualified immunity dismissals at summary judgment delay resolution further. Recommended: (1) Expedited discovery for civil rights cases, (2) Limit qualified immunity dismissals to trial stage (not summary judgment), (3) Increase federal judge appointments.",
    evidence_section: JSON.stringify({ luminari_signals: ["89 civil rights cases; average resolution time 4.2 years; 71% have qualified immunity motion before trial (avg delay 8-18 months)"] }),
    root_cause_section: JSON.stringify({ cause_1: "Federal judge shortage; civil rights cases low priority in dockets", cause_2: "Qualified immunity summary judgment motions create delay + expense" }),
    recommended_reforms_section: JSON.stringify({ legislative: [{ reform: "Civil Rights Cases: Expedited Discovery + Trial Priority", language: "Civil rights cases (§ 1983, § 1985, Fair Housing Act § 3613) shall receive expedited discovery (45 days instead of 120). Qualified immunity motions shall be decided at trial stage, not summary judgment (preserving jury right)." }, { reform: "Increase Federal Judge Appointments", language: "Create 40 additional federal judgeships (focused on districts with highest civil rights + employment caseloads)." }] }),
    implementation_roadmap_section: JSON.stringify({ phase_1: { timeline: "Months 1-6", actions: ["Federal judgeship authorization bill", "Civil rights expedited discovery rule amendment"] } }),
    supporting_data_section: JSON.stringify({ coalition_partners: ["ACLU", "civil rights lawyers", "federal judges (via judicial conference)"], estimated_impact: { timeline_reduction: "Average civil rights case resolution reduced from 4.2 years to 2.5 years", justice_access: "Faster resolution increases attorney willingness to take cases" } }),
    jurisdiction: "federal",
    reform_type: "civil_rights",
  },
];

// ─── MEDIA OUTLETS ────────────────────────────────────────────────────────────

const MEDIA_OUTLETS = [
  { outlet_id: "media_001", outlet_name: "ProPublica", outlet_type: "Investigative journalism nonprofit", coverage: "Deep investigations into government + institutional misconduct, inequality, access to justice", audience: "500K+ monthly readers; high influence among policymakers + foundations", contact_email: "publiceditor@propublica.org", website: "https://propublica.org", domains: JSON.stringify(["civil_rights", "employment", "oversight", "benefits"]), investigative: 1, partnership_potential: "HIGH" },
  { outlet_id: "media_002", outlet_name: "The Atlantic", outlet_type: "National magazine + website", coverage: "Civil rights, labor, inequality, policy analysis", audience: "2M+ monthly readers; educated, policy-interested demographic", contact_email: "pitches@theatlantic.com", website: "https://theatlantic.com", domains: JSON.stringify(["civil_rights", "employment", "benefits"]), investigative: 0, partnership_potential: "HIGH" },
  { outlet_id: "media_003", outlet_name: "Vox", outlet_type: "News site + video platform", coverage: "Policy + inequality explainers, breaking news on social policy", audience: "10M+ monthly; younger, digital-native audience", contact_email: "pitches@vox.com", website: "https://vox.com", domains: JSON.stringify(["civil_rights", "employment", "benefits", "healthcare"]), investigative: 0, partnership_potential: "HIGH" },
  { outlet_id: "media_004", outlet_name: "NPR", outlet_type: "National broadcast + digital", coverage: "Labor, civil rights, policy stories", audience: "25M+ monthly; wide demographic reach; trusted news brand", contact_email: "pitch@npr.org", website: "https://npr.org", domains: JSON.stringify(["civil_rights", "employment", "benefits", "healthcare", "oversight"]), investigative: 0, partnership_potential: "MEDIUM-HIGH" },
  { outlet_id: "media_005", outlet_name: "APM Reports", outlet_type: "Radio/podcast investigations", coverage: "Deep dives on systemic issues, inequality, workplace", audience: "2M+ listeners; engaged, policy-interested", contact_email: null, website: "https://apmreports.org", domains: JSON.stringify(["employment", "civil_rights", "oversight"]), investigative: 1, partnership_potential: "HIGH" },
];

// ─── ACTIVE CAMPAIGNS ─────────────────────────────────────────────────────────

const ACTIVE_CAMPAIGNS = [
  {
    campaign_id: "campaign_001",
    campaign_name: "Wage Theft Prevention Act 2026",
    domain: "employment",
    status_stage: "Legislative Draft",
    primary_sponsor: "Senator Bernie Sanders (VT-D)",
    coalition_leads: JSON.stringify(["AFL-CIO", "NELP", "Legal Aid programs"]),
    demand: "Mandatory liquidated damages (8 hours) + minimum $100/day penalties + attorney fees for all wage theft cases",
    legislative_vehicle: "Amendment to FLSA (29 USC § 216)",
    target_passage: "End of 2026 or 2027 session",
    current_stage: "Legislative Draft (in progress with committee staff)",
    next_milestone: "Introduce bill + secure 20+ co-sponsors",
    advocacy_action: "Coalition testimony at HELP Committee hearings; constituent meetings with key members",
    supporting_evidence: JSON.stringify(["NELP data: wage theft affects 2M+ workers annually", "Luminari pattern: same employers repeat violations 3-5x due to low penalties", "California model: CA liquidated damages mandate increased recovery 4x"]),
    is_active: 1,
  },
  {
    campaign_id: "campaign_002",
    campaign_name: "Qualified Immunity Limitation Act",
    domain: "civil_rights",
    status_stage: "Coalition Building",
    primary_sponsor: "Rep. Adam Schiff (CA-D), Rep. Barbara Lee (CA-D)",
    coalition_leads: JSON.stringify(["ACLU", "NAACP", "police accountability orgs"]),
    demand: "Raise 'clearly established' bar for immunity; shift burden to officers to show good faith; allow damages for negligent violations",
    legislative_vehicle: "Amendment to 42 USC § 1983",
    target_passage: "2027-2028 session (longer-term campaign)",
    current_stage: "Coalition Building (coordinating civil rights orgs + state-level allies)",
    next_milestone: "Secure 50+ House co-sponsors; introduce bill next session",
    advocacy_action: "Media campaign on wrongful conviction + police misconduct cases; state-level qualified immunity limits as model",
    supporting_evidence: JSON.stringify(["Luminari analysis: 70% of police accountability cases currently dismissed on qualified immunity grounds", "Model: Colorado + New York state-level qualified immunity limits (passed 2022-2023)"]),
    is_active: 1,
  },
];

// ─── ADDITIONAL LEGISLATORS (from file 2, beyond the 10 already in DB) ────────

const NEW_LEGISLATORS = [
  { id: "leg_001", name: "Virginia Foxx", title: "U.S. Representative", chamber: "House", state: "NC", party: "R", jurisdiction_level: "federal", committees: JSON.stringify(["House Education and Workforce Committee (Chair)"]), issue_alignment: JSON.stringify({ domains: ["employment", "wage_law"], stance: "NEGATIVE", notes: "Business-friendly; skeptical of labor regulations" }), contact_office: "House.gov/representatives/foxx", influence_score: 85, accessibility_score: 30, notes: "NEGATIVE - Unlikely supporter of wage theft protections. Coalition: Build pressure through constituent labor unions + business groups.", is_active: 1 },
  { id: "leg_002", name: "Patty Murray", title: "U.S. Senator", chamber: "Senate", state: "WA", party: "D", jurisdiction_level: "federal", committees: JSON.stringify(["HELP Committee (Ranking Member)", "Appropriations Committee"]), issue_alignment: JSON.stringify({ domains: ["benefits", "employment", "healthcare", "labor"], stance: "POSITIVE", notes: "Strong labor + benefits advocate" }), contact_office: "Murray.senate.gov", contact_email: null, influence_score: 90, accessibility_score: 70, notes: "POSITIVE - Strong potential sponsor for wage theft + benefits reform packages.", is_active: 1 },
  { id: "leg_003", name: "Jim Jordan", title: "U.S. Representative", chamber: "House", state: "OH", party: "R", jurisdiction_level: "federal", committees: JSON.stringify(["House Judiciary Committee (Ranking Member)"]), issue_alignment: JSON.stringify({ domains: ["civil_rights", "oversight"], stance: "MIXED", notes: "Anti-regulation; could be ally on regulatory accountability issues" }), contact_office: "House.gov/representatives/jordan", influence_score: 80, accessibility_score: 35, notes: "MIXED - Could be ally on regulatory accountability issues. Frame as government accountability, not labor advocacy.", is_active: 1 },
  { id: "leg_004", name: "Adam Schiff", title: "U.S. Representative", chamber: "House", state: "CA", party: "D", jurisdiction_level: "federal", committees: JSON.stringify(["House Judiciary Committee", "House Intelligence Committee"]), issue_alignment: JSON.stringify({ domains: ["civil_rights", "oversight"], stance: "POSITIVE", notes: "Strong civil rights, government accountability focus" }), contact_office: "House.gov/representatives/schiff", influence_score: 85, accessibility_score: 65, notes: "POSITIVE - Potential sponsor for civil rights + oversight reform.", is_active: 1 },
  { id: "leg_005", name: "Bernie Sanders", title: "U.S. Senator", chamber: "Senate", state: "VT", party: "I", jurisdiction_level: "federal", committees: JSON.stringify(["HELP Committee", "Budget Committee"]), issue_alignment: JSON.stringify({ domains: ["labor", "benefits", "healthcare", "economic_justice"], stance: "POSITIVE", notes: "Labor + benefits champion; strong enforcement advocate" }), contact_office: "sanders.senate.gov", influence_score: 95, accessibility_score: 75, notes: "POSITIVE - Strongest Senate ally for wage + benefits reform. Primary target for high-impact bills.", is_active: 1 },
];

// ─── ADDITIONAL ADVOCACY ORGS ─────────────────────────────────────────────────

const NEW_ADVOCACY_ORGS = [
  { id: "advocacy_001", name: "NAACP (National Association for the Advancement of Colored People)", org_type: "Civil Rights Organization", jurisdiction: "national", domains: JSON.stringify(["civil_rights", "employment", "housing"]), services_offered: JSON.stringify(["Employment discrimination", "Housing discrimination", "Police accountability"]), contact_email: "advocacy@naacp.org", website: "https://naacp.org", description: "2,000+ chapters nationwide. 500,000+ members. Civil rights coalition partner; can mobilize grassroots + media pressure.", coalition_willingness: "high", influence_score: 95, is_verified: 1, notes: "HIGH - Civil rights coalition partner; can mobilize grassroots + media pressure" },
  { id: "advocacy_002", name: "ACLU (American Civil Liberties Union)", org_type: "Civil Rights Organization", jurisdiction: "national", domains: JSON.stringify(["civil_rights", "oversight", "police_accountability"]), services_offered: JSON.stringify(["Government accountability", "Police misconduct", "Due process violations"]), contact_email: "advocacy@aclu.org", website: "https://aclu.org", description: "50+ state/local affiliates. 1.5M+ members. Strong litigation track record + legislative advocacy.", coalition_willingness: "high", influence_score: 95, is_verified: 1, notes: "HIGH - Strong litigation track record + legislative advocacy; priority partner for § 1983 + government accountability reform" },
  { id: "advocacy_003", name: "AFL-CIO (American Federation of Labor and Congress of Industrial Organizations)", org_type: "Labor Organization", jurisdiction: "national", domains: JSON.stringify(["employment", "wage_theft", "workplace_safety"]), services_offered: JSON.stringify(["Wage theft advocacy", "Workplace safety", "Union rights"]), contact_email: "policy@aflcio.org", website: "https://aflcio.org", description: "56+ state/local federations. 12.5M+ workers. Massive labor coalition; can mobilize for wage theft enforcement bills.", coalition_willingness: "high", influence_score: 98, is_verified: 1, notes: "HIGH - Massive labor coalition; can mobilize for wage theft enforcement bills" },
  { id: "advocacy_004", name: "National Employment Law Project (NELP)", org_type: "Policy Research Organization", jurisdiction: "national", domains: JSON.stringify(["employment", "benefits", "wage_theft"]), services_offered: JSON.stringify(["Wage theft enforcement data", "Unemployment insurance", "Worker protections"]), contact_email: "info@nelp.org", website: "https://nelp.org", description: "Published 50+ research reports on wage theft enforcement gaps. Evidence-based policy partner.", coalition_willingness: "high", influence_score: 85, is_verified: 1, notes: "HIGH - Evidence-based policy partner; provides enforcement data + legislative templates" },
  { id: "advocacy_005", name: "Center on Budget and Policy Priorities (CBPP)", org_type: "Policy Research Organization", jurisdiction: "national", domains: JSON.stringify(["benefits", "snap", "medicaid", "poverty"]), services_offered: JSON.stringify(["SNAP advocacy", "Medicaid advocacy", "SSI/SSDI", "Poverty research"]), contact_email: "info@cbpp.org", website: "https://cbpp.org", description: "100+ annual policy briefs on benefit programs. Evidence-based partner; provides data on benefit denial patterns.", coalition_willingness: "high", influence_score: 88, is_verified: 1, notes: "HIGH - Evidence-based partner; provides data on benefit denial patterns" },
  { id: "advocacy_006", name: "Legal Aid & Services Programs (statewide + regional)", org_type: "Legal Aid Network", jurisdiction: "national", domains: JSON.stringify(["benefits", "civil_rights", "employment", "healthcare", "oversight"]), services_offered: JSON.stringify(["Representation for low-income individuals"]), contact_email: null, website: "https://lawhelp.org", description: "57 state/territory legal aid organizations. Direct access to individual cases + on-the-ground enforcement gaps.", coalition_willingness: "high", influence_score: 80, is_verified: 1, notes: "HIGH - Direct access to individual cases + on-the-ground enforcement gaps" },
  { id: "advocacy_007", name: "National Health Law Program (NHeLP)", org_type: "Healthcare Advocacy Organization", jurisdiction: "national", domains: JSON.stringify(["healthcare", "medicaid"]), services_offered: JSON.stringify(["Medicaid coverage", "Healthcare access", "Insurance discrimination"]), contact_email: "info@healthlaw.org", website: "https://healthlaw.org", description: "Specialized healthcare policy partner focused on Medicaid and healthcare access.", coalition_willingness: "high", influence_score: 80, is_verified: 1, notes: "MEDIUM-HIGH - Specialized healthcare policy partner" },
  { id: "advocacy_008", name: "Consumer Federation of America (CFA)", org_type: "Consumer Advocacy Organization", jurisdiction: "national", domains: JSON.stringify(["consumer_protection", "debt_collection", "predatory_lending"]), services_offered: JSON.stringify(["Debt collection advocacy", "Predatory lending", "Consumer protections"]), contact_email: "info@consumerfed.org", website: "https://consumerfed.org", description: "Consumer coalition partner focused on debt collection and predatory lending reform.", coalition_willingness: "medium", influence_score: 75, is_verified: 1, notes: "MEDIUM - Consumer coalition partner" },
];

// ─── ADDITIONAL ADVOCACY TARGETS ─────────────────────────────────────────────

const NEW_ADVOCACY_TARGETS = [
  { target_id: "target_emp_001", name: "FLSA Wage Theft Penalties Reform", organization: "Congress / Senate HELP Committee", role: "Legislative target", jurisdiction: "federal", issue_domains: JSON.stringify(["employment", "wage_theft"]), influence_score: 90, public_visibility_score: 75, notes: "Current: Liquidated damages discretionary ($0 if employer shows good faith); penalties minimal. Desired: Liquidated damages mandatory (like CA); minimum $100/day penalties. Decision-maker: Congress (amendment to 29 USC § 216). Coalition: AFL-CIO, NELP, Legal Aid programs, worker advocacy orgs.", is_active: 1 },
  { target_id: "target_emp_002", name: "DOL Wage & Hour Division Funding Increase", organization: "Department of Labor / Congress (Appropriations)", role: "Regulatory + appropriations target", jurisdiction: "federal", issue_domains: JSON.stringify(["employment", "wage_theft"]), influence_score: 85, public_visibility_score: 60, notes: "Current: $300M budget; ~8,000 annual investigations; backlog growing. Desired: Increase budget to $500M+ to reduce investigation backlog from 18+ months to <6 months. Decision-maker: Congress (DOL appropriations). Estimated impact: DOL could conduct 12,000-15,000 investigations/year; $2B+ in annual back wages recovered.", is_active: 1 },
  { target_id: "target_cr_001", name: "Qualified Immunity Limitation (Section 1983)", organization: "Congress / House Judiciary Committee", role: "Legislative target", jurisdiction: "federal", issue_domains: JSON.stringify(["civil_rights", "police_accountability"]), influence_score: 88, public_visibility_score: 85, notes: "Current: Officers have near-absolute immunity unless rights were 'clearly established' (very high bar). Desired: Reduce qualified immunity standard; restore civil rights suits against government misconduct. Decision-maker: Congress (amendment to 42 USC § 1983). Coalition: ACLU, NAACP, civil rights orgs, police accountability advocates.", is_active: 1 },
  { target_id: "target_ben_001", name: "SNAP Benefit Adequacy + Inflation Indexing", organization: "Congress / House Agriculture Committee", role: "Legislative target", jurisdiction: "federal", issue_domains: JSON.stringify(["benefits", "snap", "food_security"]), influence_score: 80, public_visibility_score: 70, notes: "Current: SNAP max benefit varies by state ($100-280/month per person); not updated for inflation since 2009. Desired: Index SNAP benefits to inflation; increase max benefit 25-50%. Decision-maker: Congress (farm bill, 7 USC § 2011 amendment). Coalition: CBPP, food security advocates, anti-hunger orgs.", is_active: 1 },
  { target_id: "target_hc_001", name: "CMS Mental Health Parity Enforcement", organization: "Centers for Medicare & Medicaid Services (CMS)", role: "Regulatory target", jurisdiction: "federal", issue_domains: JSON.stringify(["healthcare", "mental_health"]), influence_score: 82, public_visibility_score: 65, notes: "Current: Mental health parity enforcement delegated to states; inconsistent implementation. Desired: National standard for mental health parity enforcement; 15-day appeals for urgent cases. Decision-maker: CMS (rulemaking under 42 USC § 300gg-13). Coalition: NHeLP, mental health advocacy orgs.", is_active: 1 },
];

// ─── MAIN SEED FUNCTION ───────────────────────────────────────────────────────

async function seed() {
  const conn = await pool.getConnection();
  let inserted = { reform_packages: 0, media_outlets: 0, active_campaigns: 0, legislators: 0, advocacy_orgs: 0, advocacy_targets: 0 };

  try {
    await createTables(conn);

    // Seed reform packages
    for (const pkg of REFORM_PACKAGES) {
      await conn.query(
        `INSERT INTO reform_packages (package_id, pattern_id, title, status, executive_summary, evidence_section, root_cause_section, recommended_reforms_section, implementation_roadmap_section, supporting_data_section, jurisdiction, reform_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title=VALUES(title), status=VALUES(status), executive_summary=VALUES(executive_summary), evidence_section=VALUES(evidence_section), root_cause_section=VALUES(root_cause_section), recommended_reforms_section=VALUES(recommended_reforms_section), implementation_roadmap_section=VALUES(implementation_roadmap_section), supporting_data_section=VALUES(supporting_data_section), updated_at=VALUES(updated_at)`,
        [pkg.package_id, pkg.pattern_id, pkg.title, pkg.status, pkg.executive_summary, pkg.evidence_section, pkg.root_cause_section, pkg.recommended_reforms_section, pkg.implementation_roadmap_section, pkg.supporting_data_section, pkg.jurisdiction, pkg.reform_type, now, now]
      );
      inserted.reform_packages++;
    }
    console.log(`✓ reform_packages: ${inserted.reform_packages} upserted`);

    // Seed media outlets
    for (const outlet of MEDIA_OUTLETS) {
      await conn.query(
        `INSERT INTO media_outlets (outlet_id, outlet_name, outlet_type, coverage, audience, contact_email, website, domains, investigative, partnership_potential, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE outlet_name=VALUES(outlet_name), coverage=VALUES(coverage), updated_at=VALUES(updated_at)`,
        [outlet.outlet_id, outlet.outlet_name, outlet.outlet_type, outlet.coverage, outlet.audience, outlet.contact_email, outlet.website, outlet.domains, outlet.investigative, outlet.partnership_potential, 1, now, now]
      );
      inserted.media_outlets++;
    }
    console.log(`✓ media_outlets: ${inserted.media_outlets} upserted`);

    // Seed active campaigns
    for (const campaign of ACTIVE_CAMPAIGNS) {
      await conn.query(
        `INSERT INTO active_campaigns (campaign_id, campaign_name, domain, status_stage, primary_sponsor, coalition_leads, demand, legislative_vehicle, target_passage, current_stage, next_milestone, advocacy_action, supporting_evidence, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE campaign_name=VALUES(campaign_name), status_stage=VALUES(status_stage), current_stage=VALUES(current_stage), updated_at=VALUES(updated_at)`,
        [campaign.campaign_id, campaign.campaign_name, campaign.domain, campaign.status_stage, campaign.primary_sponsor, campaign.coalition_leads, campaign.demand, campaign.legislative_vehicle, campaign.target_passage, campaign.current_stage, campaign.next_milestone, campaign.advocacy_action, campaign.supporting_evidence, campaign.is_active, now, now]
      );
      inserted.active_campaigns++;
    }
    console.log(`✓ active_campaigns: ${inserted.active_campaigns} upserted`);

    // Seed legislators
    for (const leg of NEW_LEGISLATORS) {
      await conn.query(
        `INSERT INTO coalition_legislators (id, name, title, chamber, state, party, jurisdiction_level, committees, issue_alignment, contact_office, influence_score, accessibility_score, notes, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), committees=VALUES(committees), issue_alignment=VALUES(issue_alignment), notes=VALUES(notes), updated_at=VALUES(updated_at)`,
        [leg.id, leg.name, leg.title, leg.chamber, leg.state, leg.party, leg.jurisdiction_level, leg.committees, leg.issue_alignment, leg.contact_office, leg.influence_score, leg.accessibility_score, leg.notes, leg.is_active, now, now]
      );
      inserted.legislators++;
    }
    console.log(`✓ coalition_legislators: ${inserted.legislators} upserted`);

    // Seed advocacy orgs
    for (const org of NEW_ADVOCACY_ORGS) {
      await conn.query(
        `INSERT INTO coalition_advocacy_orgs (id, name, org_type, jurisdiction, domains, services_offered, contact_email, website, description, coalition_willingness, influence_score, is_verified, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), domains=VALUES(domains), description=VALUES(description), notes=VALUES(notes), updated_at=VALUES(updated_at)`,
        [org.id, org.name, org.org_type, org.jurisdiction, org.domains, org.services_offered, org.contact_email, org.website, org.description, org.coalition_willingness, org.influence_score, org.is_verified, org.notes, now, now]
      );
      inserted.advocacy_orgs++;
    }
    console.log(`✓ coalition_advocacy_orgs: ${inserted.advocacy_orgs} upserted`);

    // Seed advocacy targets
    for (const target of NEW_ADVOCACY_TARGETS) {
      await conn.query(
        `INSERT INTO advocacy_targets (target_id, name, organization, role, jurisdiction, issue_domains, influence_score, public_visibility_score, notes, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), notes=VALUES(notes), updated_at=VALUES(updated_at)`,
        [target.target_id, target.name, target.organization, target.role, target.jurisdiction, target.issue_domains, target.influence_score, target.public_visibility_score, target.notes, target.is_active, now, now]
      );
      inserted.advocacy_targets++;
    }
    console.log(`✓ advocacy_targets: ${inserted.advocacy_targets} upserted`);

    console.log("\n=== SEED COMPLETE ===");
    console.log(JSON.stringify(inserted, null, 2));

  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch(e => { console.error("SEED FAILED:", e.message); process.exit(1); });
