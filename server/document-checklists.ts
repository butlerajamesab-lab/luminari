/**
 * Document Checklists — domain-specific document gathering guides for each pipeline type.
 * Each checklist item has a label, optional description, priority, and sort order.
 */

type ChecklistTemplate = {
  label: string;
  description?: string;
  priority: "critical" | "important" | "helpful";
  sortOrder: number;
};

const CHECKLISTS: Record<string, ChecklistTemplate[]> = {
  // ─── Personal Crisis ───
  insurance: [
    { label: "Insurance Policy (full document)", description: "The complete policy including declarations page, coverage limits, exclusions, and endorsements.", priority: "critical", sortOrder: 1 },
    { label: "Denial Letter", description: "The written denial from the insurer, including the stated reason for denial.", priority: "critical", sortOrder: 2 },
    { label: "Claim Submission Documents", description: "Your original claim filing and any supporting documents you submitted.", priority: "critical", sortOrder: 3 },
    { label: "Correspondence with Insurer", description: "All emails, letters, and written communications with the insurance company.", priority: "important", sortOrder: 4 },
    { label: "Medical Records (if health-related)", description: "Treatment records, bills, and provider notes relevant to the claim.", priority: "important", sortOrder: 5 },
    { label: "Repair Estimates / Damage Reports", description: "Professional assessments of property damage or loss.", priority: "important", sortOrder: 6 },
    { label: "Photos / Videos of Damage", description: "Visual documentation of the loss or damage.", priority: "helpful", sortOrder: 7 },
    { label: "Prior Claims History", description: "Records of any previous claims with this or other insurers.", priority: "helpful", sortOrder: 8 },
  ],
  custody: [
    { label: "Current Court Orders", description: "Existing custody, visitation, and support orders.", priority: "critical", sortOrder: 1 },
    { label: "Parenting Plan", description: "Any formal or informal parenting agreement.", priority: "critical", sortOrder: 2 },
    { label: "Communication Records", description: "Text messages, emails, and co-parenting app messages with the other parent.", priority: "important", sortOrder: 3 },
    { label: "School Records", description: "Report cards, attendance records, IEPs, and teacher communications.", priority: "important", sortOrder: 4 },
    { label: "Medical Records (children)", description: "Pediatric records, therapy notes, and health history.", priority: "important", sortOrder: 5 },
    { label: "Financial Documents", description: "Income verification, tax returns, and expense records for support calculations.", priority: "important", sortOrder: 6 },
    { label: "Police Reports / CPS Records", description: "Any reports involving domestic incidents or child welfare investigations.", priority: "important", sortOrder: 7 },
    { label: "Character References", description: "Letters from teachers, counselors, or community members.", priority: "helpful", sortOrder: 8 },
  ],
  medical: [
    { label: "Medical Records", description: "Complete treatment records from all providers involved.", priority: "critical", sortOrder: 1 },
    { label: "Billing Statements", description: "Itemized bills from hospitals, clinics, and specialists.", priority: "critical", sortOrder: 2 },
    { label: "Insurance EOBs", description: "Explanation of Benefits showing what was covered and denied.", priority: "critical", sortOrder: 3 },
    { label: "Denial Letters", description: "Any denial of coverage or prior authorization rejections.", priority: "important", sortOrder: 4 },
    { label: "Prescription Records", description: "Medication history and pharmacy records.", priority: "important", sortOrder: 5 },
    { label: "Provider Correspondence", description: "Letters between providers, referrals, and second opinions.", priority: "helpful", sortOrder: 6 },
    { label: "Patient Advocate Notes", description: "Any notes from hospital patient advocates or ombudsmen.", priority: "helpful", sortOrder: 7 },
  ],
  workplace: [
    { label: "Employment Contract / Offer Letter", description: "Your original employment agreement and any amendments.", priority: "critical", sortOrder: 1 },
    { label: "Employee Handbook", description: "Company policies, procedures, and code of conduct.", priority: "critical", sortOrder: 2 },
    { label: "Performance Reviews", description: "All performance evaluations and feedback documents.", priority: "important", sortOrder: 3 },
    { label: "Written Warnings / Disciplinary Actions", description: "Any formal warnings, PIPs, or disciplinary records.", priority: "important", sortOrder: 4 },
    { label: "Communication Records", description: "Emails, messages, and written communications with supervisors and HR.", priority: "important", sortOrder: 5 },
    { label: "Pay Stubs / Compensation Records", description: "Wage statements showing pay history, deductions, and overtime.", priority: "important", sortOrder: 6 },
    { label: "Complaint / Grievance Filings", description: "Any formal complaints filed with HR, EEOC, or state agencies.", priority: "important", sortOrder: 7 },
    { label: "Witness Statements", description: "Written accounts from coworkers who observed relevant events.", priority: "helpful", sortOrder: 8 },
  ],
  housing: [
    { label: "Lease Agreement", description: "Your current or most recent lease, including all addenda.", priority: "critical", sortOrder: 1 },
    { label: "Eviction Notice", description: "Any notice to quit, pay or vacate, or court filing.", priority: "critical", sortOrder: 2 },
    { label: "Rent Payment Records", description: "Receipts, bank statements, or money order records showing rent payments.", priority: "important", sortOrder: 3 },
    { label: "Maintenance Requests", description: "Written requests for repairs and landlord responses.", priority: "important", sortOrder: 4 },
    { label: "Photos of Conditions", description: "Photos documenting habitability issues, damage, or needed repairs.", priority: "important", sortOrder: 5 },
    { label: "Correspondence with Landlord", description: "All written communications with landlord or property manager.", priority: "important", sortOrder: 6 },
    { label: "Code Violation Reports", description: "Any housing inspection reports or code violation notices.", priority: "helpful", sortOrder: 7 },
  ],
  consumer: [
    { label: "Contracts / Agreements", description: "Service contracts, purchase agreements, and terms of service.", priority: "critical", sortOrder: 1 },
    { label: "Billing Statements", description: "All bills, invoices, and charge statements.", priority: "critical", sortOrder: 2 },
    { label: "Correspondence", description: "Emails, letters, and chat logs with the company.", priority: "important", sortOrder: 3 },
    { label: "Advertising Materials", description: "Ads, brochures, or website screenshots showing what was promised.", priority: "important", sortOrder: 4 },
    { label: "Complaint Filings", description: "BBB complaints, FTC reports, or attorney general filings.", priority: "helpful", sortOrder: 5 },
    { label: "Bank / Credit Card Statements", description: "Records showing charges and any disputed transactions.", priority: "helpful", sortOrder: 6 },
  ],

  // ─── Government Benefits ───
  disability: [
    { label: "Disability Application", description: "Your SSI/SSDI application and any reconsideration requests.", priority: "critical", sortOrder: 1 },
    { label: "Denial Letter", description: "The written denial with stated reasons.", priority: "critical", sortOrder: 2 },
    { label: "Medical Records", description: "All treatment records supporting your disability claim.", priority: "critical", sortOrder: 3 },
    { label: "Doctor's Statements", description: "Physician opinions on your functional limitations.", priority: "important", sortOrder: 4 },
    { label: "Work History Report", description: "Your employment history for the past 15 years.", priority: "important", sortOrder: 5 },
    { label: "Function Report", description: "Your daily activities questionnaire.", priority: "important", sortOrder: 6 },
    { label: "Consultative Exam Reports", description: "Reports from SSA-ordered medical examinations.", priority: "helpful", sortOrder: 7 },
  ],
  medicaid: [
    { label: "Application / Enrollment Documents", description: "Your Medicaid/Medicare application and enrollment confirmation.", priority: "critical", sortOrder: 1 },
    { label: "Denial or Termination Notice", description: "Any notice of denial, reduction, or termination of benefits.", priority: "critical", sortOrder: 2 },
    { label: "Income Verification", description: "Pay stubs, tax returns, or benefit statements proving eligibility.", priority: "important", sortOrder: 3 },
    { label: "Medical Necessity Documentation", description: "Doctor's orders or letters supporting needed services.", priority: "important", sortOrder: 4 },
    { label: "Appeal Documents", description: "Any appeals you've filed and responses received.", priority: "important", sortOrder: 5 },
    { label: "EOBs / Coverage Statements", description: "Explanation of Benefits showing what was covered or denied.", priority: "helpful", sortOrder: 6 },
  ],
  snap: [
    { label: "SNAP/WIC Application", description: "Your application for food assistance benefits.", priority: "critical", sortOrder: 1 },
    { label: "Denial or Reduction Notice", description: "Any notice changing or denying your benefits.", priority: "critical", sortOrder: 2 },
    { label: "Income Documentation", description: "Pay stubs, benefit letters, or self-employment records.", priority: "important", sortOrder: 3 },
    { label: "Household Composition Proof", description: "Documents showing who lives in your household.", priority: "important", sortOrder: 4 },
    { label: "Expense Documentation", description: "Rent, utility bills, and childcare costs for deduction calculations.", priority: "helpful", sortOrder: 5 },
  ],
  veterans: [
    { label: "DD-214 / Service Records", description: "Your discharge papers and military service records.", priority: "critical", sortOrder: 1 },
    { label: "VA Claim / Decision Letter", description: "Your benefits claim and the VA's decision.", priority: "critical", sortOrder: 2 },
    { label: "Service-Connected Medical Records", description: "Military medical records documenting conditions during service.", priority: "critical", sortOrder: 3 },
    { label: "Current Medical Records", description: "Post-service treatment records from VA and private providers.", priority: "important", sortOrder: 4 },
    { label: "Buddy Statements", description: "Written statements from fellow service members about your condition.", priority: "important", sortOrder: 5 },
    { label: "Nexus Letter", description: "Doctor's letter connecting your current condition to military service.", priority: "important", sortOrder: 6 },
    { label: "C&P Exam Results", description: "Compensation and Pension examination reports.", priority: "helpful", sortOrder: 7 },
  ],
  unemployment: [
    { label: "Unemployment Claim Filing", description: "Your initial unemployment claim and any weekly certifications.", priority: "critical", sortOrder: 1 },
    { label: "Denial / Disqualification Notice", description: "Any notice denying or stopping your benefits.", priority: "critical", sortOrder: 2 },
    { label: "Separation Documents", description: "Termination letter, layoff notice, or resignation documentation.", priority: "important", sortOrder: 3 },
    { label: "Employer Correspondence", description: "Communications with your former employer about the separation.", priority: "important", sortOrder: 4 },
    { label: "Pay Stubs / W-2s", description: "Wage records from the qualifying period.", priority: "important", sortOrder: 5 },
    { label: "Job Search Records", description: "Documentation of your active job search efforts.", priority: "helpful", sortOrder: 6 },
  ],

  // ─── Elder Care & Protection ───
  nursing: [
    { label: "Admission Agreement", description: "The contract with the nursing home or assisted living facility.", priority: "critical", sortOrder: 1 },
    { label: "Care Plan", description: "The resident's individualized care plan and any updates.", priority: "critical", sortOrder: 2 },
    { label: "Medical Records", description: "Treatment records, medication logs, and incident reports from the facility.", priority: "critical", sortOrder: 3 },
    { label: "Billing Statements", description: "All bills, including itemized charges and Medicaid/Medicare claims.", priority: "important", sortOrder: 4 },
    { label: "State Inspection Reports", description: "Facility inspection results and any deficiency citations.", priority: "important", sortOrder: 5 },
    { label: "Photos / Documentation of Conditions", description: "Photos showing injuries, living conditions, or neglect.", priority: "important", sortOrder: 6 },
    { label: "Complaint Filings", description: "Complaints filed with the state ombudsman or licensing board.", priority: "helpful", sortOrder: 7 },
  ],
  guardianship: [
    { label: "Guardianship / Conservatorship Petition", description: "The court filing establishing the guardianship.", priority: "critical", sortOrder: 1 },
    { label: "Court Orders", description: "All court orders related to the guardianship.", priority: "critical", sortOrder: 2 },
    { label: "Guardian's Reports", description: "Annual reports filed by the guardian with the court.", priority: "important", sortOrder: 3 },
    { label: "Financial Accountings", description: "Records of how the ward's money has been managed.", priority: "important", sortOrder: 4 },
    { label: "Medical Capacity Evaluations", description: "Assessments of the ward's decision-making capacity.", priority: "important", sortOrder: 5 },
    { label: "Correspondence", description: "Communications between the ward, guardian, and court.", priority: "helpful", sortOrder: 6 },
  ],
  elderabuse: [
    { label: "Medical Records", description: "Records documenting injuries, unexplained weight loss, or medication issues.", priority: "critical", sortOrder: 1 },
    { label: "Financial Records", description: "Bank statements, credit card records, and any unusual transactions.", priority: "critical", sortOrder: 2 },
    { label: "Photos of Injuries / Conditions", description: "Visual documentation of physical harm or neglect.", priority: "critical", sortOrder: 3 },
    { label: "APS Reports", description: "Adult Protective Services investigation reports.", priority: "important", sortOrder: 4 },
    { label: "Power of Attorney Documents", description: "Any POA or fiduciary documents that may have been misused.", priority: "important", sortOrder: 5 },
    { label: "Witness Statements", description: "Written accounts from family members, neighbors, or caregivers.", priority: "helpful", sortOrder: 6 },
  ],

  // ─── Vulnerable Populations ───
  immigration: [
    { label: "Immigration Application / Petition", description: "Your visa, asylum, or status adjustment application.", priority: "critical", sortOrder: 1 },
    { label: "Denial / RFE Notice", description: "Any denial, Request for Evidence, or Notice to Appear.", priority: "critical", sortOrder: 2 },
    { label: "Identity Documents", description: "Passport, birth certificate, and national ID (copies only — keep originals safe).", priority: "critical", sortOrder: 3 },
    { label: "Country Conditions Evidence", description: "Reports documenting conditions in your home country (for asylum cases).", priority: "important", sortOrder: 4 },
    { label: "Employment Authorization", description: "Work permits and employment verification documents.", priority: "important", sortOrder: 5 },
    { label: "Supporting Declarations", description: "Personal statements and affidavits from witnesses.", priority: "important", sortOrder: 6 },
    { label: "Prior Immigration History", description: "Records of previous applications, entries, and status changes.", priority: "helpful", sortOrder: 7 },
  ],
  childwelfare: [
    { label: "CPS Investigation Reports", description: "All reports from Child Protective Services investigations.", priority: "critical", sortOrder: 1 },
    { label: "Court Orders", description: "Any court orders related to your children's welfare.", priority: "critical", sortOrder: 2 },
    { label: "Service Plan", description: "The family service plan and compliance documentation.", priority: "important", sortOrder: 3 },
    { label: "Visitation Records", description: "Documentation of supervised or unsupervised visits.", priority: "important", sortOrder: 4 },
    { label: "Provider Reports", description: "Reports from therapists, counselors, and parenting class instructors.", priority: "important", sortOrder: 5 },
    { label: "Communication Records", description: "Correspondence with caseworkers and the agency.", priority: "helpful", sortOrder: 6 },
  ],
  education: [
    { label: "IEP / 504 Plan", description: "Current Individualized Education Program or Section 504 plan.", priority: "critical", sortOrder: 1 },
    { label: "Evaluation Reports", description: "Psychoeducational evaluations and assessments.", priority: "critical", sortOrder: 2 },
    { label: "School Records", description: "Report cards, attendance records, and disciplinary records.", priority: "important", sortOrder: 3 },
    { label: "Correspondence with School", description: "Emails and letters with teachers, administrators, and special education staff.", priority: "important", sortOrder: 4 },
    { label: "Meeting Notes", description: "Notes from IEP meetings, parent-teacher conferences, and hearings.", priority: "important", sortOrder: 5 },
    { label: "Independent Evaluations", description: "Any private evaluations obtained outside the school system.", priority: "helpful", sortOrder: 6 },
  ],
  section8: [
    { label: "Housing Voucher Documents", description: "Your Section 8 voucher and program participation agreement.", priority: "critical", sortOrder: 1 },
    { label: "Denial / Termination Notice", description: "Any notice of denial, termination, or reduction of assistance.", priority: "critical", sortOrder: 2 },
    { label: "Income Verification", description: "Pay stubs, benefit letters, and tax returns.", priority: "important", sortOrder: 3 },
    { label: "Lease Agreement", description: "Your current lease with the landlord.", priority: "important", sortOrder: 4 },
    { label: "Housing Authority Correspondence", description: "All communications with the housing authority.", priority: "important", sortOrder: 5 },
    { label: "Inspection Reports", description: "Housing quality standards inspection results.", priority: "helpful", sortOrder: 6 },
  ],
  juvenile: [
    { label: "Court Documents", description: "Petitions, orders, and disposition records from juvenile court.", priority: "critical", sortOrder: 1 },
    { label: "School Records", description: "Academic records, disciplinary actions, and IEP if applicable.", priority: "important", sortOrder: 2 },
    { label: "Mental Health Records", description: "Therapy notes, evaluations, and treatment plans.", priority: "important", sortOrder: 3 },
    { label: "Probation Records", description: "Probation officer reports and compliance documentation.", priority: "important", sortOrder: 4 },
    { label: "Police Reports", description: "Incident reports and arrest records.", priority: "important", sortOrder: 5 },
    { label: "Family History Documentation", description: "Records relevant to family circumstances affecting the case.", priority: "helpful", sortOrder: 6 },
  ],

  // ─── Tribal Law / Indigenous Rights ───
  icwa: [
    { label: "Tribal Membership / Enrollment Documentation", description: "Proof of tribal membership or eligibility for the child and family.", priority: "critical", sortOrder: 1 },
    { label: "ICWA Notice to Tribe", description: "The formal notice sent to the tribe as required by ICWA.", priority: "critical", sortOrder: 2 },
    { label: "Active Efforts Documentation", description: "Records showing what 'active efforts' were made to prevent family breakup.", priority: "critical", sortOrder: 3 },
    { label: "Placement Preference Records", description: "Documentation of placement decisions and whether ICWA preferences were followed.", priority: "important", sortOrder: 4 },
    { label: "State Court Records", description: "All state court filings and orders in the child welfare case.", priority: "important", sortOrder: 5 },
    { label: "Tribal Social Services Records", description: "Reports from tribal social services or ICWA workers.", priority: "important", sortOrder: 6 },
    { label: "Expert Witness Testimony", description: "Qualified expert witness statements on tribal customs and family dynamics.", priority: "helpful", sortOrder: 7 },
  ],
  mmiw: [
    { label: "Police Reports (all jurisdictions)", description: "Reports from tribal, local, state, and federal law enforcement.", priority: "critical", sortOrder: 1 },
    { label: "Missing Person Flyers / Reports", description: "Official missing person reports filed with all relevant agencies.", priority: "critical", sortOrder: 2 },
    { label: "Communication Records", description: "Last known communications — texts, calls, social media activity.", priority: "important", sortOrder: 3 },
    { label: "Medical / Dental Records", description: "Records that may aid in identification.", priority: "important", sortOrder: 4 },
    { label: "FOIA Responses", description: "Freedom of Information Act requests to federal agencies.", priority: "important", sortOrder: 5 },
    { label: "Jurisdictional Correspondence", description: "Communications showing which agency claimed or declined jurisdiction.", priority: "important", sortOrder: 6 },
    { label: "Community Search Records", description: "Documentation of community-organized search efforts.", priority: "helpful", sortOrder: 7 },
  ],
  treatyrights: [
    { label: "Treaty Text", description: "The relevant treaty or treaties, including all articles and amendments.", priority: "critical", sortOrder: 1 },
    { label: "Federal Register Notices", description: "Published federal actions affecting treaty rights.", priority: "important", sortOrder: 2 },
    { label: "Environmental Impact Statements", description: "EIS documents for projects affecting treaty-protected resources.", priority: "important", sortOrder: 3 },
    { label: "Consultation Records", description: "Government-to-government consultation correspondence.", priority: "important", sortOrder: 4 },
    { label: "Historical Maps / Surveys", description: "Maps showing original treaty boundaries and ceded territories.", priority: "helpful", sortOrder: 5 },
    { label: "Court Decisions", description: "Relevant court rulings interpreting the treaty.", priority: "helpful", sortOrder: 6 },
  ],
  triballand: [
    { label: "Allotment Records", description: "Original allotment documents and any subsequent transfers.", priority: "critical", sortOrder: 1 },
    { label: "BIA Correspondence", description: "Letters and decisions from the Bureau of Indian Affairs.", priority: "critical", sortOrder: 2 },
    { label: "IIM Account Statements", description: "Individual Indian Money account statements and transaction history.", priority: "important", sortOrder: 3 },
    { label: "Title Status Reports", description: "BIA title status reports showing ownership interests.", priority: "important", sortOrder: 4 },
    { label: "Probate Records", description: "Records from Indian probate proceedings.", priority: "important", sortOrder: 5 },
    { label: "Survey / Plat Maps", description: "Land surveys and plat maps showing parcel boundaries.", priority: "helpful", sortOrder: 6 },
  ],
  tribalenrollment: [
    { label: "Enrollment Application", description: "Your tribal enrollment or citizenship application.", priority: "critical", sortOrder: 1 },
    { label: "Genealogical Records", description: "Birth certificates, family trees, and lineage documentation.", priority: "critical", sortOrder: 2 },
    { label: "Dawes Roll / Base Roll Records", description: "Historical roll entries for ancestors.", priority: "critical", sortOrder: 3 },
    { label: "Tribal Constitution / Membership Criteria", description: "The tribe's enrollment requirements and governing documents.", priority: "important", sortOrder: 4 },
    { label: "Denial / Disenrollment Notice", description: "Any notice of denial or disenrollment with stated reasons.", priority: "important", sortOrder: 5 },
    { label: "Census Records", description: "Historical Indian census rolls and federal census records.", priority: "helpful", sortOrder: 6 },
  ],
  tribalhousing: [
    { label: "NAHASDA Application", description: "Application for tribal housing assistance under NAHASDA.", priority: "critical", sortOrder: 1 },
    { label: "Tribal Housing Authority Correspondence", description: "All communications with the tribal housing authority.", priority: "critical", sortOrder: 2 },
    { label: "Lease / Homeownership Agreement", description: "Your housing agreement with the tribal housing authority.", priority: "important", sortOrder: 3 },
    { label: "Income Verification", description: "Documents proving income eligibility.", priority: "important", sortOrder: 4 },
    { label: "Maintenance Requests", description: "Written requests for repairs and responses received.", priority: "important", sortOrder: 5 },
    { label: "HUD Inspection Reports", description: "Any HUD or tribal housing inspection results.", priority: "helpful", sortOrder: 6 },
  ],
  tribalsovereignty: [
    { label: "Jurisdictional Documents", description: "Documents establishing which jurisdiction applies (tribal, state, federal).", priority: "critical", sortOrder: 1 },
    { label: "PL-280 Status Documentation", description: "Records showing whether PL-280 applies to your tribe's territory.", priority: "critical", sortOrder: 2 },
    { label: "Tribal Court Records", description: "Filings and orders from tribal court proceedings.", priority: "important", sortOrder: 3 },
    { label: "State/Federal Court Records", description: "Parallel proceedings in state or federal courts.", priority: "important", sortOrder: 4 },
    { label: "Cross-Deputization Agreements", description: "Any agreements between tribal and non-tribal law enforcement.", priority: "helpful", sortOrder: 5 },
    { label: "Tribal Code / Ordinances", description: "Relevant tribal laws and ordinances.", priority: "helpful", sortOrder: 6 },
  ],

  // ─── Justice & Financial Defense ───
  workerscomp: [
    { label: "Incident / Injury Report", description: "The workplace injury report filed with your employer.", priority: "critical", sortOrder: 1 },
    { label: "Workers' Comp Claim Filing", description: "Your claim form and any acknowledgment from the insurer.", priority: "critical", sortOrder: 2 },
    { label: "Medical Records", description: "All treatment records related to your workplace injury.", priority: "critical", sortOrder: 3 },
    { label: "IME Reports", description: "Independent Medical Examination reports ordered by the insurer.", priority: "important", sortOrder: 4 },
    { label: "Wage Statements", description: "Pay stubs and W-2s showing your pre-injury earnings.", priority: "important", sortOrder: 5 },
    { label: "Denial / Dispute Letters", description: "Any denial of benefits or disputed treatment authorizations.", priority: "important", sortOrder: 6 },
    { label: "Return-to-Work Documentation", description: "Light duty offers, functional capacity evaluations, and work restrictions.", priority: "helpful", sortOrder: 7 },
  ],
  wrongfulconviction: [
    { label: "Trial Transcript", description: "The complete transcript of the trial proceedings.", priority: "critical", sortOrder: 1 },
    { label: "Police Reports", description: "All police investigation reports and supplemental reports.", priority: "critical", sortOrder: 2 },
    { label: "Brady / Discovery Materials", description: "All materials disclosed (or that should have been disclosed) by the prosecution.", priority: "critical", sortOrder: 3 },
    { label: "Forensic Evidence Reports", description: "Lab reports, DNA analysis, fingerprint analysis, and other forensic evidence.", priority: "critical", sortOrder: 4 },
    { label: "Witness Statements", description: "All witness statements, recantations, and identification procedures.", priority: "important", sortOrder: 5 },
    { label: "Appellate Records", description: "Prior appeal filings and court decisions.", priority: "important", sortOrder: 6 },
    { label: "Jail / Prison Records", description: "Disciplinary records, medical records, and correspondence from incarceration.", priority: "helpful", sortOrder: 7 },
  ],
  debtcollection: [
    { label: "Collection Letters / Notices", description: "All letters from debt collectors, including the initial validation notice.", priority: "critical", sortOrder: 1 },
    { label: "Original Contract / Agreement", description: "The original credit agreement or contract creating the alleged debt.", priority: "critical", sortOrder: 2 },
    { label: "Account Statements", description: "Monthly statements showing the debt balance and payment history.", priority: "important", sortOrder: 3 },
    { label: "Dispute Correspondence", description: "Any letters you sent disputing the debt and responses received.", priority: "important", sortOrder: 4 },
    { label: "Credit Reports", description: "Credit reports showing how the debt is being reported.", priority: "important", sortOrder: 5 },
    { label: "Call Logs", description: "Records of collector phone calls (dates, times, what was said).", priority: "helpful", sortOrder: 6 },
    { label: "Court Filings (if sued)", description: "Summons, complaint, and any court documents if a lawsuit was filed.", priority: "critical", sortOrder: 7 },
  ],
  policemisconduct: [
    { label: "Police Report / Incident Report", description: "The official police report of the incident.", priority: "critical", sortOrder: 1 },
    { label: "Body Camera / Dash Camera Footage", description: "Any video footage from police body cameras or vehicle cameras.", priority: "critical", sortOrder: 2 },
    { label: "Medical Records", description: "Records documenting any injuries sustained.", priority: "critical", sortOrder: 3 },
    { label: "Witness Statements", description: "Written or recorded statements from witnesses.", priority: "important", sortOrder: 4 },
    { label: "Internal Affairs Complaint", description: "Any complaint filed with the department's internal affairs division.", priority: "important", sortOrder: 5 },
    { label: "Photos / Videos", description: "Your own photos or videos of the incident, injuries, or scene.", priority: "important", sortOrder: 6 },
    { label: "Officer Disciplinary History", description: "Public records of prior complaints or disciplinary actions against the officer.", priority: "helpful", sortOrder: 7 },
    { label: "911 / Dispatch Records", description: "Call records and dispatch logs.", priority: "helpful", sortOrder: 8 },
  ],
  bankruptcy: [
    { label: "Debt Summary", description: "A list of all debts including creditor names, amounts, and account numbers.", priority: "critical", sortOrder: 1 },
    { label: "Income Documentation", description: "Pay stubs, tax returns, and all sources of income for the past 6 months.", priority: "critical", sortOrder: 2 },
    { label: "Bank Statements", description: "Statements from all bank accounts for the past 6 months.", priority: "critical", sortOrder: 3 },
    { label: "Tax Returns", description: "Federal and state tax returns for the past 2 years.", priority: "important", sortOrder: 4 },
    { label: "Property Records", description: "Deeds, vehicle titles, and documentation of all assets.", priority: "important", sortOrder: 5 },
    { label: "Collection Lawsuits / Judgments", description: "Any pending lawsuits or existing judgments against you.", priority: "important", sortOrder: 6 },
    { label: "Monthly Expense Summary", description: "Documentation of your regular monthly expenses.", priority: "helpful", sortOrder: 7 },
  ],

  // ─── Community & Institutional ───
  environmental: [
    { label: "Environmental Test Results", description: "Water, air, or soil testing results from your area.", priority: "critical", sortOrder: 1 },
    { label: "Health Records", description: "Medical records documenting health issues potentially linked to contamination.", priority: "critical", sortOrder: 2 },
    { label: "EPA / State Agency Correspondence", description: "Communications with environmental regulatory agencies.", priority: "important", sortOrder: 3 },
    { label: "Permit Documents", description: "Environmental permits issued to the polluting facility.", priority: "important", sortOrder: 4 },
    { label: "Community Health Data", description: "Cancer cluster data, disease prevalence studies, or community health surveys.", priority: "important", sortOrder: 5 },
    { label: "Photos / Videos", description: "Visual documentation of pollution, contamination, or environmental damage.", priority: "helpful", sortOrder: 6 },
    { label: "News Articles / Reports", description: "Media coverage of the environmental issue.", priority: "helpful", sortOrder: 7 },
  ],
  hoa: [
    { label: "CC&Rs / Governing Documents", description: "The community's Covenants, Conditions & Restrictions and bylaws.", priority: "critical", sortOrder: 1 },
    { label: "Violation Notices", description: "Any violation notices or fines you've received.", priority: "critical", sortOrder: 2 },
    { label: "Board Meeting Minutes", description: "Minutes from HOA board meetings relevant to your dispute.", priority: "important", sortOrder: 3 },
    { label: "Financial Records", description: "HOA financial statements, budgets, and special assessment notices.", priority: "important", sortOrder: 4 },
    { label: "Correspondence", description: "All communications with the HOA board and management company.", priority: "important", sortOrder: 5 },
    { label: "Photos", description: "Photos documenting the alleged violation or selective enforcement.", priority: "helpful", sortOrder: 6 },
  ],
  taxdispute: [
    { label: "IRS / State Tax Notice", description: "The notice you received (CP2000, audit letter, levy notice, etc.).", priority: "critical", sortOrder: 1 },
    { label: "Tax Returns", description: "The tax returns for the years in question.", priority: "critical", sortOrder: 2 },
    { label: "Supporting Documents", description: "W-2s, 1099s, receipts, and records supporting your return.", priority: "critical", sortOrder: 3 },
    { label: "Correspondence with IRS/State", description: "All letters and responses exchanged with the tax authority.", priority: "important", sortOrder: 4 },
    { label: "Payment Records", description: "Records of any payments, installment agreements, or offers in compromise.", priority: "important", sortOrder: 5 },
    { label: "Bank Statements", description: "Bank records relevant to income or deduction disputes.", priority: "helpful", sortOrder: 6 },
  ],
  fostercare: [
    { label: "Placement Records", description: "Records of all foster care placements and dates.", priority: "critical", sortOrder: 1 },
    { label: "Case Files", description: "Your complete child welfare case file (request from the agency).", priority: "critical", sortOrder: 2 },
    { label: "Court Orders", description: "All court orders related to your case.", priority: "important", sortOrder: 3 },
    { label: "Medical / Mental Health Records", description: "Health records from during your time in care.", priority: "important", sortOrder: 4 },
    { label: "School Records", description: "Academic records, school changes, and any educational assessments.", priority: "important", sortOrder: 5 },
    { label: "Aging-Out Documents", description: "Transition planning documents, independent living plans, and benefits enrollment.", priority: "important", sortOrder: 6 },
    { label: "Personal Documents", description: "Birth certificate, Social Security card, and any identity documents.", priority: "helpful", sortOrder: 7 },
  ],
  medmalpractice: [
    { label: "Medical Records", description: "Complete records from the provider(s) involved in the alleged malpractice.", priority: "critical", sortOrder: 1 },
    { label: "Informed Consent Forms", description: "Any consent forms you signed before the procedure.", priority: "critical", sortOrder: 2 },
    { label: "Billing Records", description: "Itemized bills showing treatments and procedures performed.", priority: "important", sortOrder: 3 },
    { label: "Second Opinion Records", description: "Records from providers who treated you after the incident.", priority: "important", sortOrder: 4 },
    { label: "Photos of Injuries", description: "Visual documentation of harm caused.", priority: "important", sortOrder: 5 },
    { label: "Correspondence with Provider", description: "Communications with the provider about the incident.", priority: "helpful", sortOrder: 6 },
    { label: "Expert Medical Opinion", description: "A medical expert's assessment of whether the standard of care was met.", priority: "helpful", sortOrder: 7 },
  ],

  // ─── Systemic Accountability ───
  predatorylending: [
    { label: "Loan Agreement / Mortgage", description: "The complete loan agreement including all terms, rates, and fees.", priority: "critical", sortOrder: 1 },
    { label: "Truth in Lending Disclosure", description: "The TILA disclosure showing APR, finance charges, and total payments.", priority: "critical", sortOrder: 2 },
    { label: "Payment History", description: "Records of all payments made and how they were applied.", priority: "important", sortOrder: 3 },
    { label: "Correspondence with Lender", description: "All communications with the lender or servicer.", priority: "important", sortOrder: 4 },
    { label: "Appraisal / Property Valuation", description: "The appraisal used at the time of the loan.", priority: "important", sortOrder: 5 },
    { label: "Credit Report at Time of Loan", description: "Your credit report from when the loan was originated.", priority: "helpful", sortOrder: 6 },
    { label: "Marketing Materials", description: "Ads, flyers, or solicitations that led you to the lender.", priority: "helpful", sortOrder: 7 },
  ],
  whistleblower: [
    { label: "Evidence of Wrongdoing", description: "Documents, emails, or records showing the misconduct you reported.", priority: "critical", sortOrder: 1 },
    { label: "Your Report / Complaint", description: "Your original report to management, compliance, or a government agency.", priority: "critical", sortOrder: 2 },
    { label: "Retaliation Documentation", description: "Evidence of adverse actions taken after your report (demotion, termination, harassment).", priority: "critical", sortOrder: 3 },
    { label: "Performance Reviews", description: "Reviews before and after your report showing any change in treatment.", priority: "important", sortOrder: 4 },
    { label: "Communication Records", description: "Emails and messages showing the timeline of events.", priority: "important", sortOrder: 5 },
    { label: "Witness Information", description: "Names and statements of coworkers who witnessed the retaliation.", priority: "important", sortOrder: 6 },
    { label: "Government Agency Filings", description: "OSHA, SEC, or other agency complaint filings and responses.", priority: "helpful", sortOrder: 7 },
  ],
  nonprofitcompliance: [
    { label: "Form 990 Returns", description: "The organization's annual IRS Form 990 filings.", priority: "critical", sortOrder: 1 },
    { label: "Bylaws / Articles of Incorporation", description: "The organization's governing documents.", priority: "critical", sortOrder: 2 },
    { label: "Financial Statements", description: "Audited or unaudited financial statements and bank records.", priority: "critical", sortOrder: 3 },
    { label: "Board Meeting Minutes", description: "Minutes from board meetings showing governance decisions.", priority: "important", sortOrder: 4 },
    { label: "Grant Agreements", description: "Agreements for restricted funds and compliance requirements.", priority: "important", sortOrder: 5 },
    { label: "Donor Communications", description: "Solicitation materials and donor acknowledgment letters.", priority: "important", sortOrder: 6 },
    { label: "Whistleblower Complaints", description: "Any internal or external complaints about the organization.", priority: "helpful", sortOrder: 7 },
  ],
  marketconcentration: [
    { label: "Market Share / Industry Reports", description: "Reports showing market share concentration over time — from USDA, FTC, DOJ, industry analysts, or academic research. Look for data showing how many companies control what percentage of the market.", priority: "critical", sortOrder: 1 },
    { label: "Merger & Acquisition Records", description: "SEC filings, FTC merger reviews, DOJ antitrust actions, and news coverage of industry consolidation events.", priority: "critical", sortOrder: 2 },
    { label: "Pricing Data / Cost Histories", description: "Historical pricing for inputs, products, or services showing price changes over time as consolidation increased.", priority: "critical", sortOrder: 3 },
    { label: "Lobbying Disclosures", description: "OpenSecrets data, congressional lobbying reports, campaign contribution records, and revolving door documentation.", priority: "important", sortOrder: 4 },
    { label: "Government Subsidy / Bailout Records", description: "USDA subsidy databases (EWG), Farm Bill allocations, TARP records, PPP data, or other government payment records showing where bailout money went.", priority: "important", sortOrder: 5 },
    { label: "Congressional Testimony / Hearing Records", description: "Testimony from industry executives, regulators, or affected parties before congressional committees.", priority: "important", sortOrder: 6 },
    { label: "Regulatory Filings", description: "FTC complaints, DOJ antitrust filings, state AG actions, or regulatory comment periods related to mergers or market conduct.", priority: "important", sortOrder: 7 },
    { label: "Impact Documentation", description: "Stories, data, or records showing the impact on small operators, consumers, workers, or communities.", priority: "helpful", sortOrder: 8 },
    { label: "News Coverage & Investigative Reports", description: "Journalism covering the consolidation pattern, pricing impacts, or bailout flows.", priority: "helpful", sortOrder: 9 },
  ],
  agricultureexploitation: [
    { label: "Farm Expense Records", description: "Annual expense records showing input costs — seeds, fertilizer, chemicals, equipment, fuel, labor. Multiple years show the trend.", priority: "critical", sortOrder: 1 },
    { label: "Input Purchase Receipts / Invoices", description: "Receipts from seed dealers, chemical suppliers, equipment dealers, and fertilizer companies. These show who you're buying from and at what price.", priority: "critical", sortOrder: 2 },
    { label: "Revenue / Crop Sale Records", description: "Records of what you sold your crop for — elevator receipts, contract prices, market prices at time of sale.", priority: "critical", sortOrder: 3 },
    { label: "Loan Documents / Debt Records", description: "Operating loans, equipment financing, land mortgages, and FSA loan documents. Show the debt cycle.", priority: "critical", sortOrder: 4 },
    { label: "USDA Subsidy Records", description: "Records of government payments received — searchable at the EWG Farm Subsidy Database. Shows where the money actually goes.", priority: "important", sortOrder: 5 },
    { label: "Crop Insurance Claims", description: "Claims filed, payouts received, and premium costs. The crop insurance system is part of the cycle.", priority: "important", sortOrder: 6 },
    { label: "Seed / Chemical Contracts", description: "Technology Use Agreements (TUAs) from Monsanto/Bayer, seed licensing terms, chemical application requirements.", priority: "important", sortOrder: 7 },
    { label: "Equipment Financing Agreements", description: "John Deere Financial, AGCO Finance, or dealer financing terms. Equipment costs are a major consolidation pressure point.", priority: "important", sortOrder: 8 },
    { label: "Land Lease Agreements", description: "Cash rent or crop-share lease terms showing how land costs have changed.", priority: "helpful", sortOrder: 9 },
    { label: "Bankruptcy / Foreclosure Records", description: "If applicable — records of farm bankruptcy, foreclosure, or forced sale.", priority: "helpful", sortOrder: 10 },
    { label: "USDA / FSA Correspondence", description: "Letters and communications with USDA, Farm Service Agency, or state agriculture departments.", priority: "helpful", sortOrder: 11 },
  ],

  // ─── General ───
  other: [
    { label: "Primary Documents", description: "The main documents at the center of your situation.", priority: "critical", sortOrder: 1 },
    { label: "Correspondence", description: "All relevant emails, letters, and written communications.", priority: "important", sortOrder: 2 },
    { label: "Official Records", description: "Government filings, court records, or agency documents.", priority: "important", sortOrder: 3 },
    { label: "Financial Records", description: "Bank statements, bills, or payment records if relevant.", priority: "helpful", sortOrder: 4 },
    { label: "Photos / Evidence", description: "Visual documentation supporting your situation.", priority: "helpful", sortOrder: 5 },
  ],
};

export function getChecklistForPipeline(pipelineType: string): ChecklistTemplate[] {
  return CHECKLISTS[pipelineType] || CHECKLISTS.other;
}

export function getAllPipelineTypes(): string[] {
  return Object.keys(CHECKLISTS);
}
