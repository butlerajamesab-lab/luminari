import { useState } from "react";
import { ExternalLink, ChevronDown, ChevronUp, BookOpen, Phone, Globe, Shield } from "lucide-react";

type Resource = {
  name: string;
  url: string;
  description: string;
  type: "legal_aid" | "hotline" | "government" | "nonprofit";
};

const RESOURCE_ICON = {
  legal_aid: BookOpen,
  hotline: Phone,
  government: Globe,
  nonprofit: Shield,
};

const RESOURCES: Record<string, Resource[]> = {
  // Personal Crisis
  insurance: [
    { name: "National Association of Insurance Commissioners", url: "https://www.naic.org", description: "File complaints and find your state insurance department.", type: "government" },
    { name: "United Policyholders", url: "https://www.uphelp.org", description: "Free insurance claim help and advocacy resources.", type: "nonprofit" },
    { name: "State Insurance Department Finder", url: "https://www.naic.org/state_web_map.htm", description: "Find your state's insurance regulator.", type: "government" },
  ],
  custody: [
    { name: "LawHelp.org", url: "https://www.lawhelp.org", description: "Find free legal aid in your area for family law matters.", type: "legal_aid" },
    { name: "National Domestic Violence Hotline", url: "https://www.thehotline.org", description: "1-800-799-7233 — Safety planning and legal referrals.", type: "hotline" },
    { name: "Child Welfare Information Gateway", url: "https://www.childwelfare.gov", description: "Federal resources for families in the child welfare system.", type: "government" },
  ],
  medical: [
    { name: "Patient Advocate Foundation", url: "https://www.patientadvocate.org", description: "Free case management for patients with chronic conditions.", type: "nonprofit" },
    { name: "Medicare Rights Center", url: "https://www.medicarerights.org", description: "Free counseling for Medicare beneficiaries.", type: "nonprofit" },
    { name: "CMS Hospital Compare", url: "https://www.medicare.gov/care-compare/", description: "Compare hospital quality and patient outcomes.", type: "government" },
  ],
  workplace: [
    { name: "EEOC", url: "https://www.eeoc.gov", description: "File discrimination charges and learn about your rights.", type: "government" },
    { name: "Department of Labor", url: "https://www.dol.gov/agencies/whd/contact/complaints", description: "File wage and hour complaints.", type: "government" },
    { name: "National Employment Law Project", url: "https://www.nelp.org", description: "Workers' rights research and advocacy.", type: "nonprofit" },
  ],
  housing: [
    { name: "HUD Housing Counseling", url: "https://www.hud.gov/counseling", description: "Free housing counseling services.", type: "government" },
    { name: "National Housing Law Project", url: "https://www.nhlp.org", description: "Legal resources for tenants and housing advocates.", type: "legal_aid" },
    { name: "Eviction Lab", url: "https://evictionlab.org", description: "Eviction data and tenant resources by state.", type: "nonprofit" },
  ],
  consumer: [
    { name: "Consumer Financial Protection Bureau", url: "https://www.consumerfinance.gov", description: "Submit complaints and access consumer protection tools.", type: "government" },
    { name: "FTC Consumer Complaint", url: "https://reportfraud.ftc.gov", description: "Report fraud and unfair business practices.", type: "government" },
    { name: "National Consumer Law Center", url: "https://www.nclc.org", description: "Consumer rights legal resources and advocacy.", type: "nonprofit" },
  ],

  // Government Benefits
  disability: [
    { name: "SSA Disability", url: "https://www.ssa.gov/disability/", description: "Apply for and manage disability benefits.", type: "government" },
    { name: "Disability Rights Advocates", url: "https://dralegal.org", description: "Free legal advocacy for people with disabilities.", type: "legal_aid" },
    { name: "National Organization of Social Security Claimants' Representatives", url: "https://www.nosscr.org", description: "Find a disability attorney.", type: "legal_aid" },
  ],
  medicaid: [
    { name: "Medicaid.gov", url: "https://www.medicaid.gov", description: "Official Medicaid information and state contacts.", type: "government" },
    { name: "National Health Law Program", url: "https://healthlaw.org", description: "Legal advocacy for health care access.", type: "legal_aid" },
    { name: "Benefits.gov", url: "https://www.benefits.gov", description: "Find government benefits you may be eligible for.", type: "government" },
  ],
  snap: [
    { name: "SNAP Information", url: "https://www.fns.usda.gov/snap/supplemental-nutrition-assistance-program", description: "Official SNAP program information.", type: "government" },
    { name: "Food Research & Action Center", url: "https://frac.org", description: "Anti-hunger advocacy and SNAP resources.", type: "nonprofit" },
    { name: "WIC Program", url: "https://www.fns.usda.gov/wic", description: "Women, Infants, and Children nutrition program.", type: "government" },
  ],
  veterans: [
    { name: "VA Benefits", url: "https://www.va.gov/", description: "Apply for and manage VA benefits.", type: "government" },
    { name: "National Veterans Legal Services Program", url: "https://www.nvlsp.org", description: "Free legal services for veterans.", type: "legal_aid" },
    { name: "Veterans Crisis Line", url: "https://www.veteranscrisisline.net", description: "988 then press 1 — 24/7 crisis support.", type: "hotline" },
    { name: "Disabled American Veterans", url: "https://www.dav.org", description: "Free claims assistance and advocacy.", type: "nonprofit" },
  ],
  unemployment: [
    { name: "CareerOneStop", url: "https://www.careeronestop.org/LocalHelp/UnemploymentBenefits/unemployment-benefits.aspx", description: "Find your state unemployment office.", type: "government" },
    { name: "National Employment Law Project", url: "https://www.nelp.org", description: "Unemployment insurance advocacy and resources.", type: "nonprofit" },
  ],

  // Elder Care
  nursing: [
    { name: "Long-Term Care Ombudsman", url: "https://theconsumervoice.org/get_help", description: "Find your local ombudsman for nursing home complaints.", type: "government" },
    { name: "Medicare Nursing Home Compare", url: "https://www.medicare.gov/care-compare/", description: "Compare nursing home quality ratings.", type: "government" },
    { name: "National Center on Elder Abuse", url: "https://ncea.acl.gov", description: "Resources for recognizing and reporting elder abuse.", type: "nonprofit" },
  ],
  guardianship: [
    { name: "National Guardianship Association", url: "https://www.guardianship.org", description: "Standards and resources for guardianship.", type: "nonprofit" },
    { name: "AARP Guardianship Resources", url: "https://www.aarp.org", description: "Information on guardianship rights and alternatives.", type: "nonprofit" },
  ],
  elderabuse: [
    { name: "Eldercare Locator", url: "https://eldercare.acl.gov", description: "1-800-677-1116 — Connect to local aging services.", type: "hotline" },
    { name: "National Center on Elder Abuse", url: "https://ncea.acl.gov", description: "Report abuse and find state resources.", type: "government" },
    { name: "Adult Protective Services", url: "https://www.napsa-now.org/get-help/help-in-your-area/", description: "Find your local APS office.", type: "government" },
  ],

  // Vulnerable Populations
  immigration: [
    { name: "USCIS", url: "https://www.uscis.gov", description: "Official immigration services and case status.", type: "government" },
    { name: "American Immigration Lawyers Association", url: "https://www.aila.org", description: "Find an immigration attorney.", type: "legal_aid" },
    { name: "National Immigrant Justice Center", url: "https://immigrantjustice.org", description: "Free legal services for immigrants.", type: "legal_aid" },
    { name: "RAICES", url: "https://www.raicestexas.org", description: "Free legal services for immigrant communities.", type: "nonprofit" },
  ],
  childwelfare: [
    { name: "Child Welfare Information Gateway", url: "https://www.childwelfare.gov", description: "Federal resources and state contacts.", type: "government" },
    { name: "National CASA/GAL Association", url: "https://nationalcasagal.org", description: "Court Appointed Special Advocates for children.", type: "nonprofit" },
  ],
  education: [
    { name: "Wrightslaw", url: "https://www.wrightslaw.com", description: "Special education law and advocacy resources.", type: "legal_aid" },
    { name: "Parent Center Hub", url: "https://www.parentcenterhub.org", description: "Find your state's parent training center.", type: "nonprofit" },
    { name: "Office for Civil Rights", url: "https://www.ed.gov/about/offices/list/ocr/", description: "File disability discrimination complaints.", type: "government" },
  ],
  section8: [
    { name: "HUD Section 8", url: "https://www.hud.gov/topics/housing_choice_voucher_program_section_8", description: "Official Section 8 program information.", type: "government" },
    { name: "National Housing Law Project", url: "https://www.nhlp.org", description: "Legal resources for voucher holders.", type: "legal_aid" },
  ],
  juvenile: [
    { name: "National Juvenile Defender Center", url: "https://njdc.info", description: "Resources for juvenile defense.", type: "legal_aid" },
    { name: "Campaign for Youth Justice", url: "https://campaignforyouthjustice.org", description: "Advocacy for youth in the justice system.", type: "nonprofit" },
  ],

  // Tribal Law
  icwa: [
    { name: "National Indian Child Welfare Association", url: "https://www.nicwa.org", description: "ICWA resources, training, and advocacy.", type: "nonprofit" },
    { name: "Native American Rights Fund (NARF)", url: "https://www.narf.org", description: "Free legal representation for tribes and Native people.", type: "legal_aid" },
    { name: "BIA ICWA Resources", url: "https://www.bia.gov/bia/ois/dhs/icwa", description: "Federal ICWA guidelines and compliance resources.", type: "government" },
  ],
  mmiw: [
    { name: "National Missing and Unidentified Persons System", url: "https://www.namus.gov", description: "Report and search for missing persons.", type: "government" },
    { name: "Sovereign Bodies Institute", url: "https://www.sovereign-bodies.org", description: "MMIW data and advocacy.", type: "nonprofit" },
    { name: "StrongHearts Native Helpline", url: "https://strongheartshelpline.org", description: "1-844-762-8483 — Support for Native victims.", type: "hotline" },
    { name: "Urban Indian Health Institute", url: "https://www.uihi.org", description: "MMIW research and community health.", type: "nonprofit" },
  ],
  treatyrights: [
    { name: "Native American Rights Fund", url: "https://www.narf.org", description: "Treaty rights litigation and advocacy.", type: "legal_aid" },
    { name: "National Congress of American Indians", url: "https://www.ncai.org", description: "Policy advocacy for tribal sovereignty.", type: "nonprofit" },
  ],
  triballand: [
    { name: "Bureau of Indian Affairs", url: "https://www.bia.gov", description: "Land, trust, and allotment services.", type: "government" },
    { name: "Indian Land Tenure Foundation", url: "https://iltf.org", description: "Resources for Indian land recovery and management.", type: "nonprofit" },
    { name: "National Archives — American Indian Records", url: "https://www.archives.gov/research/native-americans", description: "Historical records for land and enrollment research.", type: "government" },
  ],
  tribalenrollment: [
    { name: "National Archives — Dawes Rolls", url: "https://www.archives.gov/research/native-americans/dawes", description: "Search Dawes Roll records online.", type: "government" },
    { name: "Bureau of Indian Affairs", url: "https://www.bia.gov", description: "Tribal enrollment and recognition services.", type: "government" },
  ],
  tribalhousing: [
    { name: "HUD Office of Native American Programs", url: "https://www.hud.gov/program_offices/public_indian_housing/ih", description: "NAHASDA and tribal housing resources.", type: "government" },
    { name: "National American Indian Housing Council", url: "https://naihc.net", description: "Tribal housing advocacy and technical assistance.", type: "nonprofit" },
  ],
  tribalsovereignty: [
    { name: "Tribal Law and Policy Institute", url: "https://www.home.tlpi.org", description: "Resources on tribal justice systems and sovereignty.", type: "nonprofit" },
    { name: "National Congress of American Indians", url: "https://www.ncai.org", description: "Tribal sovereignty advocacy.", type: "nonprofit" },
  ],

  // Justice & Financial Defense
  workerscomp: [
    { name: "OSHA", url: "https://www.osha.gov", description: "File workplace safety complaints.", type: "government" },
    { name: "Workers' Compensation State Directory", url: "https://www.dol.gov/agencies/owcp/wc", description: "Find your state workers' comp program.", type: "government" },
  ],
  wrongfulconviction: [
    { name: "Innocence Project", url: "https://innocenceproject.org", description: "Free legal services for wrongful convictions.", type: "legal_aid" },
    { name: "National Registry of Exonerations", url: "https://www.law.umich.edu/special/exoneration/Pages/about.aspx", description: "Database of exonerations and wrongful conviction data.", type: "nonprofit" },
    { name: "Innocence Network", url: "https://innocencenetwork.org", description: "Find an innocence organization near you.", type: "legal_aid" },
  ],
  debtcollection: [
    { name: "CFPB Debt Collection", url: "https://www.consumerfinance.gov/consumer-tools/debt-collection/", description: "Know your rights and file complaints.", type: "government" },
    { name: "National Consumer Law Center", url: "https://www.nclc.org", description: "Consumer debt legal resources.", type: "legal_aid" },
  ],
  policemisconduct: [
    { name: "ACLU", url: "https://www.aclu.org", description: "Civil liberties legal advocacy.", type: "legal_aid" },
    { name: "DOJ Civil Rights Division", url: "https://www.justice.gov/crt/how-file-complaint", description: "File federal civil rights complaints.", type: "government" },
    { name: "National Police Accountability Project", url: "https://www.nlg-npap.org", description: "Legal resources for police misconduct cases.", type: "legal_aid" },
  ],
  bankruptcy: [
    { name: "US Courts Bankruptcy", url: "https://www.uscourts.gov/services-forms/bankruptcy", description: "Official bankruptcy court information.", type: "government" },
    { name: "Legal Services Corporation", url: "https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help", description: "Find free legal aid for bankruptcy.", type: "legal_aid" },
  ],

  // Community & Institutional
  environmental: [
    { name: "EPA Environmental Justice", url: "https://www.epa.gov/environmentaljustice", description: "Environmental justice resources and complaints.", type: "government" },
    { name: "Earthjustice", url: "https://earthjustice.org", description: "Free environmental law representation.", type: "legal_aid" },
  ],
  hoa: [
    { name: "Community Associations Institute", url: "https://www.caionline.org", description: "HOA governance resources and dispute resolution.", type: "nonprofit" },
  ],
  taxdispute: [
    { name: "IRS Taxpayer Advocate Service", url: "https://www.taxpayeradvocate.irs.gov", description: "Free help resolving IRS problems.", type: "government" },
    { name: "Low Income Taxpayer Clinics", url: "https://www.taxpayeradvocate.irs.gov/about-us/low-income-taxpayer-clinics-litc/", description: "Free tax legal help for qualifying taxpayers.", type: "legal_aid" },
  ],
  fostercare: [
    { name: "Foster Club", url: "https://www.fosterclub.com", description: "Resources and community for foster youth.", type: "nonprofit" },
    { name: "National Center for Missing & Exploited Children", url: "https://www.missingkids.org", description: "1-800-843-5678 — Safety resources.", type: "hotline" },
  ],
  medmalpractice: [
    { name: "State Medical Board Directory", url: "https://www.fsmb.org/contact-a-state-medical-board/", description: "File complaints with your state medical board.", type: "government" },
  ],

  // Systemic Accountability
  predatorylending: [
    { name: "CFPB Mortgage Help", url: "https://www.consumerfinance.gov/housing/", description: "Mortgage assistance and complaint filing.", type: "government" },
    { name: "National Fair Housing Alliance", url: "https://nationalfairhousing.org", description: "Fair lending advocacy and complaints.", type: "nonprofit" },
  ],
  whistleblower: [
    { name: "OSHA Whistleblower Protection", url: "https://www.osha.gov/whistleblower", description: "File whistleblower retaliation complaints.", type: "government" },
    { name: "Government Accountability Project", url: "https://whistleblower.org", description: "Legal support for whistleblowers.", type: "legal_aid" },
    { name: "SEC Whistleblower Program", url: "https://www.sec.gov/whistleblower", description: "Report securities violations.", type: "government" },
  ],
  nonprofitcompliance: [
    { name: "IRS Tax Exempt Organizations", url: "https://www.irs.gov/charities-non-profits", description: "Nonprofit compliance information.", type: "government" },
    { name: "National Council of Nonprofits", url: "https://www.councilofnonprofits.org", description: "Nonprofit governance resources.", type: "nonprofit" },
  ],

  // General
  other: [
    { name: "LawHelp.org", url: "https://www.lawhelp.org", description: "Find free legal aid in your area.", type: "legal_aid" },
    { name: "Legal Services Corporation", url: "https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help", description: "Locate legal aid programs near you.", type: "legal_aid" },
    { name: "211 Helpline", url: "https://www.211.org", description: "Dial 211 — Connect to local social services.", type: "hotline" },
  ],
};

export function ResourceDirectory({ pipelineType }: { pipelineType?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const resources = RESOURCES[pipelineType || "other"] || RESOURCES.other;

  if (!resources || resources.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">Resource Directory</span>
          <span className="text-xs text-muted-foreground">{resources.length} resources</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {resources.map((resource, i) => {
            const Icon = RESOURCE_ICON[resource.type];
            return (
              <a
                key={i}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/30 transition-colors group"
              >
                <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0 group-hover:text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium group-hover:text-primary transition-colors">{resource.name}</span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{resource.description}</p>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
