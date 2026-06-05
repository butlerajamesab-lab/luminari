import { useState } from "react";
import {
  Scale, ChevronDown, ChevronUp, ExternalLink, BookOpen,
  FileText, Shield, AlertTriangle, Quote, Clock,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

// ─── Pipeline → Legal Domain Mapping ───
// Maps pipeline types (from case.pipelineType) to legal library domain tags
const PIPELINE_DOMAIN_MAP: Record<string, string[]> = {
  // Family & Custody
  domestic_violence: ["family", "criminal_justice", "civil_rights"],
  custody: ["family", "civil_rights"],
  custody_dispute: ["family", "civil_rights"],
  child_welfare: ["family", "civil_rights"],
  family_law: ["family"],
  parental_rights_termination: ["family", "civil_rights"],
  supervised_visitation: ["family"],
  child_support: ["family"],
  adoption: ["family"],
  foster_care: ["family", "civil_rights"],
  juvenile_justice: ["family", "criminal_justice"],
  guardianship_family: ["family", "disability"],
  paternity: ["family"],
  relocation_custody: ["family"],
  domestic_partnership: ["family", "civil_rights"],

  // Insurance & Healthcare
  insurance: ["insurance", "consumer"],
  auto_insurance: ["insurance", "consumer"],
  home_insurance: ["insurance", "housing", "consumer"],
  life_insurance: ["insurance", "consumer"],
  disability_insurance: ["insurance", "disability"],
  long_term_care_insurance: ["insurance", "healthcare"],
  health_insurance_denial: ["insurance", "healthcare"],
  medicaid_denial: ["benefits", "healthcare"],
  medicare_denial: ["benefits", "healthcare"],
  medical_malpractice: ["healthcare"],
  dental_insurance: ["insurance", "healthcare"],
  workers_comp_insurance: ["insurance", "employment"],
  bad_faith_insurance: ["insurance", "consumer"],

  // Housing & Tenant Rights
  housing: ["housing"],
  tenant_rights: ["housing", "civil_rights"],
  eviction: ["housing"],
  landlord_harassment: ["housing", "civil_rights"],
  housing_discrimination: ["housing", "civil_rights"],
  section_8: ["housing", "benefits"],
  hoa_dispute: ["housing", "consumer"],
  foreclosure: ["housing", "consumer"],
  habitability: ["housing"],
  rent_control: ["housing"],
  fair_housing: ["housing", "civil_rights"],
  mobile_home_rights: ["housing"],

  // Employment & Workplace
  workplace: ["employment"],
  wrongful_termination: ["employment", "civil_rights"],
  wage_theft: ["employment", "wages"],
  workplace_discrimination: ["employment", "civil_rights"],
  workplace_harassment: ["employment", "civil_rights"],
  workers_comp: ["employment"],
  gig_worker_misclassification: ["employment", "wages"],
  non_compete_dispute: ["employment"],
  retaliation: ["employment", "civil_rights"],
  fmla_violation: ["employment"],
  unemployment_denial: ["employment", "benefits"],

  // Financial & Consumer
  consumer: ["consumer"],
  debt_collection: ["consumer"],
  predatory_lending: ["consumer", "housing"],
  bankruptcy: ["consumer"],
  identity_theft: ["consumer", "criminal_justice"],
  crypto_fraud: ["consumer", "criminal_justice"],
  bank_account_closure: ["consumer"],
  student_loan: ["consumer", "education"],
  tax_dispute: ["consumer", "tax"],
  financial_exploitation: ["consumer", "criminal_justice"],
  credit_reporting: ["consumer"],
  auto_fraud: ["consumer"],

  // Justice & Accountability
  police_misconduct: ["criminal_justice", "civil_rights"],
  wrongful_conviction: ["criminal_justice", "civil_rights"],
  prison_conditions: ["criminal_justice", "civil_rights"],
  prosecutorial_misconduct: ["criminal_justice"],
  judicial_misconduct: ["criminal_justice"],
  bail_reform: ["criminal_justice", "civil_rights"],
  sex_offender_registry: ["criminal_justice"],
  parole_violation: ["criminal_justice"],
  civil_asset_forfeiture: ["criminal_justice", "civil_rights"],
  death_penalty: ["criminal_justice", "civil_rights"],
  sentencing_disparity: ["criminal_justice", "civil_rights"],
  whistleblower: ["employment", "civil_rights"],
  government_corruption: ["criminal_justice"],
  civil_rights_violation: ["civil_rights"],
  voting_rights: ["civil_rights", "voting"],

  // Elder Care
  nursing: ["healthcare", "disability"],
  guardianship: ["family", "disability"],
  elder_abuse: ["criminal_justice", "healthcare"],
  elder_financial_exploitation: ["consumer", "criminal_justice"],
  nursing_home_neglect: ["healthcare"],
  assisted_living: ["healthcare"],
  elder_isolation: ["healthcare", "civil_rights"],
  power_of_attorney_abuse: ["family", "criminal_justice"],
  medicare_fraud: ["healthcare", "criminal_justice"],
  elder_housing: ["housing", "disability"],
  veterans_benefits: ["benefits"],

  // Immigration
  immigration: ["immigration"],
  asylum: ["immigration", "civil_rights"],
  deportation_defense: ["immigration"],
  visa_denial: ["immigration"],
  daca: ["immigration", "civil_rights"],
  immigration_detention: ["immigration", "civil_rights"],
  family_separation: ["immigration", "family"],

  // Environment
  environmental: ["environmental"],
  water_contamination: ["environmental", "healthcare"],
  air_quality: ["environmental", "healthcare"],
  toxic_exposure: ["environmental", "healthcare"],
  environmental_racism: ["environmental", "civil_rights"],
  land_use: ["environmental", "housing"],
  waste_disposal: ["environmental"],
  climate_litigation: ["environmental"],
  noise_pollution: ["environmental"],
  pesticide_exposure: ["environmental", "employment"],

  // Benefits
  disability: ["disability", "benefits"],
  snap: ["benefits"],
  medicaid: ["benefits", "healthcare"],
  veterans: ["benefits"],
  unemployment: ["benefits", "employment"],
  social_security: ["benefits"],
  tanf: ["benefits"],
  child_care_subsidy: ["benefits", "family"],

  // LGBTQ+ Rights
  lgbtq_discrimination: ["civil_rights"],
  transgender_rights: ["civil_rights", "healthcare"],
  same_sex_marriage: ["family", "civil_rights"],
  conversion_therapy: ["healthcare", "civil_rights"],
  lgbtq_workplace: ["employment", "civil_rights"],
  lgbtq_housing: ["housing", "civil_rights"],
  lgbtq_healthcare: ["healthcare", "civil_rights"],
  lgbtq_education: ["education", "civil_rights"],

  // Tribal
  icwa: ["tribal", "family"],
  mmiw: ["tribal", "criminal_justice"],
  treaty_rights: ["tribal", "civil_rights"],
  tribal_land: ["tribal"],
  tribal_enrollment: ["tribal"],
  tribal_housing: ["tribal", "housing"],
  tribal_sovereignty: ["tribal"],
  tribal_water_rights: ["tribal", "environmental"],
  tribal_gaming: ["tribal"],
  tribal_child_welfare: ["tribal", "family"],

  // Market & Corporate
  antitrust: ["consumer"],
  securities_fraud: ["consumer", "criminal_justice"],
  corporate_governance: ["consumer"],
  merger_review: ["consumer"],
  market_manipulation: ["consumer", "criminal_justice"],
  insider_trading: ["consumer", "criminal_justice"],
  patent_dispute: ["other"],
  trademark_dispute: ["other"],
  trade_secret: ["other"],
  franchise_dispute: ["consumer"],
  nonprofit_compliance: ["other"],

  // Public Safety
  school_safety: ["education", "criminal_justice"],
  gun_violence: ["criminal_justice"],
  emergency_response: ["other"],
  food_safety: ["healthcare", "consumer"],
  product_liability: ["consumer"],
  transportation_safety: ["other"],
  workplace_safety: ["employment"],
  fire_safety: ["housing"],
  public_health: ["healthcare"],
  cybersecurity: ["consumer"],
  infrastructure: ["other"],

  // Mental Health
  involuntary_commitment: ["healthcare", "civil_rights", "disability"],
  mental_health_parity: ["insurance", "healthcare"],
  psychiatric_abuse: ["healthcare", "civil_rights"],
  competency_evaluation: ["criminal_justice", "healthcare"],
  substance_abuse_rights: ["healthcare", "civil_rights"],
  mental_health_discrimination: ["civil_rights", "disability"],

  // General
  complaint_filing: ["other"],
  document_review: ["other"],
  general_legal_question: ["other"],
  legal_research: ["other"],
  pro_se_assistance: ["other"],
  records_request: ["foia"],
};

function getDomainForPipeline(pipelineType: string): string | undefined {
  const domains = PIPELINE_DOMAIN_MAP[pipelineType];
  if (domains && domains.length > 0) return domains[0];
  return undefined;
}

function getAllDomainsForPipeline(pipelineType: string): string[] {
  return PIPELINE_DOMAIN_MAP[pipelineType] || [];
}

// ─── Case Law Detail Card ───
function CaseLawCard({ caseItem }: { caseItem: any }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border/40 bg-card/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-3 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-start gap-2">
          <Scale className="h-3.5 w-3.5 text-amber-400 mt-1 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-mono text-muted-foreground leading-tight">
              {caseItem.citation}
            </p>
            <p className="text-sm font-medium mt-0.5">{caseItem.case_name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">{caseItem.court}</span>
              {caseItem.year_decided && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  {caseItem.year_decided}
                </span>
              )}
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30">
          {/* Holding */}
          {caseItem.holding && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-amber-400/70 font-semibold mb-1">Holding</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{caseItem.holding}</p>
            </div>
          )}

          {/* Key Quotes */}
          {caseItem.key_quotes && caseItem.key_quotes.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-400/70 font-semibold mb-1.5">Key Quotes</p>
              <div className="space-y-2">
                {caseItem.key_quotes.map((q: any, i: number) => (
                  <div key={i} className="pl-2.5 border-l-2 border-amber-500/30">
                    <div className="flex items-start gap-1.5">
                      <Quote className="h-3 w-3 text-amber-400/50 mt-0.5 shrink-0" />
                      <p className="text-xs text-foreground/80 italic leading-relaxed">"{q.quote}"</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 ml-4">
                      {q.page && <span className="text-[10px] text-muted-foreground">p. {q.page}</span>}
                      {q.context && <span className="text-[10px] text-muted-foreground">— {q.context}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Statutes Interpreted */}
          {caseItem.statutes_interpreted && caseItem.statutes_interpreted.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-400/70 font-semibold mb-1">Statutes Interpreted</p>
              <div className="flex flex-wrap gap-1">
                {caseItem.statutes_interpreted.map((s: string, i: number) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground font-mono">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Subsequent History */}
          {caseItem.subsequent_history && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-400/70 font-semibold mb-1">Subsequent History</p>
              <p className="text-xs text-muted-foreground">{caseItem.subsequent_history}</p>
            </div>
          )}

          {/* Source Link */}
          {caseItem.source_url && (
            <a
              href={caseItem.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              <ExternalLink className="h-3 w-3" />
              Read full opinion
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Statute Card ───
function StatuteCard({ statute }: { statute: any }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-md hover:bg-muted/20 transition-colors">
      <FileText className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-mono text-muted-foreground">{statute.citation}</p>
        <p className="text-sm font-medium mt-0.5">{statute.title}</p>
        {statute.summary && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{statute.summary}</p>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground mt-1 inline-block">
          {statute.jurisdiction}
        </span>
      </div>
    </div>
  );
}

// ─── Enforcement Card ───
function EnforcementCard({ record }: { record: any }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-md hover:bg-muted/20 transition-colors">
      <Shield className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{record.agency_name}</p>
        {record.complaint_type && (
          <p className="text-xs text-muted-foreground mt-0.5">{record.complaint_type}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground">
            {record.jurisdiction}
          </span>
          {record.outcome && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              record.outcome === "resolved" ? "bg-emerald-500/10 text-emerald-400" :
              record.outcome === "pending_review" ? "bg-amber-500/10 text-amber-400" :
              "bg-muted/30 text-muted-foreground"
            }`}>
              {record.outcome?.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───
type Tab = "cases" | "statutes" | "enforcement";

export function LegalResources({ pipelineType }: { pipelineType?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("cases");

  const primaryDomain = pipelineType ? getDomainForPipeline(pipelineType) : undefined;
  const allDomains = pipelineType ? getAllDomainsForPipeline(pipelineType) : [];

  // Fetch relevant case law
  const { data: caseLawData } = trpc.legalLibrary.searchCaseLaw.useQuery(
    { domain: primaryDomain as any, limit: 10 },
    { enabled: expanded && !!primaryDomain }
  );

  // Fetch relevant statutes
  const { data: statuteData } = trpc.legalLibrary.searchStatutes.useQuery(
    { domain: primaryDomain as any, limit: 8 },
    { enabled: expanded && !!primaryDomain && activeTab === "statutes" }
  );

  // Fetch relevant enforcement records
  const { data: enforcementData } = trpc.legalLibrary.searchEnforcement.useQuery(
    { domain: primaryDomain as any, limit: 8 },
    { enabled: expanded && !!primaryDomain && activeTab === "enforcement" }
  );

  if (!pipelineType || !primaryDomain) return null;

  const caseLawItems = Array.isArray(caseLawData) ? caseLawData : [];
  const statuteItems = Array.isArray(statuteData) ? statuteData : [];
  const enforcementItems = Array.isArray(enforcementData) ? enforcementData : [];

  const totalCount = caseLawItems.length + statuteItems.length + enforcementItems.length;

  const TABS: { key: Tab; label: string; icon: typeof Scale; count: number }[] = [
    { key: "cases", label: "Case Law", icon: Scale, count: caseLawItems.length },
    { key: "statutes", label: "Statutes", icon: FileText, count: statuteItems.length },
    { key: "enforcement", label: "Enforcement", icon: Shield, count: enforcementItems.length },
  ];

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold">Legal Resources</span>
          {expanded && totalCount > 0 && (
            <span className="text-xs text-muted-foreground">{totalCount} relevant</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!expanded && allDomains.length > 0 && (
            <div className="flex gap-1">
              {allDomains.slice(0, 3).map((d) => (
                <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                  {d.replace(/_/g, " ")}
                </span>
              ))}
              {allDomains.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{allDomains.length - 3}</span>
              )}
            </div>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Tab bar */}
          <div className="flex gap-1 mb-3 border-b border-border/30 pb-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-amber-500/10 text-amber-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1 rounded ${
                    activeTab === tab.key ? "bg-amber-500/20" : "bg-muted/40"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {activeTab === "cases" && (
              caseLawItems.length > 0 ? (
                caseLawItems.map((c: any) => <CaseLawCard key={c.id} caseItem={c} />)
              ) : (
                <div className="text-center py-6">
                  <Scale className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No case law found for this domain</p>
                </div>
              )
            )}

            {activeTab === "statutes" && (
              statuteItems.length > 0 ? (
                statuteItems.map((s: any) => <StatuteCard key={s.id} statute={s} />)
              ) : (
                <div className="text-center py-6">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No statutes found for this domain</p>
                </div>
              )
            )}

            {activeTab === "enforcement" && (
              enforcementItems.length > 0 ? (
                enforcementItems.map((e: any) => <EnforcementCard key={e.id} record={e} />)
              ) : (
                <div className="text-center py-6">
                  <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No enforcement records found for this domain</p>
                </div>
              )
            )}
          </div>

          {/* Link to full library */}
          <div className="mt-3 pt-2 border-t border-border/30">
            <Link
              href="/legal-library"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <BookOpen className="h-3 w-3" />
              Browse full Legal Library
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
