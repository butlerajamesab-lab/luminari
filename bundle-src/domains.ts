/**
 * Domain question modules for the offline intake bundle.
 * Phase A: Top 5 domains (DV, custody, insurance, housing, workplace).
 * Each domain provides guided intake questions and suggested document types.
 */

export interface DomainQuestion {
  id: string;
  text: string;
  helpText?: string;
  type: "text" | "textarea" | "date" | "select" | "multiselect";
  options?: string[];
  required?: boolean;
}

export interface DomainModule {
  id: string;
  label: string;
  icon: string; // emoji
  description: string;
  questions: DomainQuestion[];
  suggestedDocuments: string[];
  safetyNote?: string; // Shown prominently for safety-critical domains
}

export const DOMAIN_MODULES: DomainModule[] = [
  {
    id: "domestic_violence",
    label: "Domestic Violence",
    icon: "\u{1F6E1}\uFE0F",
    description: "Document incidents, gather evidence, and build a safety record.",
    safetyNote: "Your safety comes first. If you are in immediate danger, call 911 or the National DV Hotline: 1-800-799-7233. You can close this at any time using the X button or pressing Escape.",
    questions: [
      { id: "dv_relationship", text: "What is your relationship to the person?", type: "select", options: ["Spouse/Partner", "Ex-Spouse/Ex-Partner", "Parent", "Family Member", "Roommate", "Other"], required: true },
      { id: "dv_duration", text: "How long has this been happening?", type: "select", options: ["Less than 1 month", "1-6 months", "6-12 months", "1-3 years", "More than 3 years"] },
      { id: "dv_types", text: "What types of abuse have you experienced?", helpText: "Select all that apply", type: "multiselect", options: ["Physical violence", "Emotional/verbal abuse", "Financial control", "Isolation from family/friends", "Threats", "Stalking/monitoring", "Sexual abuse", "Property destruction", "Threats involving children", "Threats involving pets"] },
      { id: "dv_children", text: "Are children involved or affected?", type: "select", options: ["Yes", "No", "Prefer not to say"] },
      { id: "dv_protection_order", text: "Do you have a protection/restraining order?", type: "select", options: ["Yes, currently active", "Yes, but expired", "Applied but denied", "No", "Not sure"] },
      { id: "dv_police_reports", text: "Have you filed any police reports?", type: "select", options: ["Yes", "No", "Tried but was turned away"] },
      { id: "dv_safe_contact", text: "Is there a safe way to contact you?", helpText: "Phone, email, or other method that the abuser cannot monitor", type: "textarea" },
      { id: "dv_situation", text: "In your own words, describe what has been happening.", helpText: "Take your time. Include dates and details if you can remember them.", type: "textarea", required: true },
    ],
    suggestedDocuments: [
      "Photos of injuries or property damage",
      "Screenshots of threatening messages/texts/emails",
      "Police reports or incident numbers",
      "Medical records from related visits",
      "Protection/restraining orders",
      "Witness statements",
      "Journal or diary entries documenting incidents",
      "Financial records showing control",
      "Recordings (where legally permitted)",
    ],
  },
  {
    id: "custody",
    label: "Custody / Family Court",
    icon: "\u{1F46A}",
    description: "Organize court documents, communication records, and parenting evidence.",
    questions: [
      { id: "cust_status", text: "What is the current custody situation?", type: "select", options: ["No custody order yet", "Existing order — seeking modification", "Emergency custody situation", "Visitation dispute", "Relocation dispute", "Other"], required: true },
      { id: "cust_children_count", text: "How many children are involved?", type: "select", options: ["1", "2", "3", "4+"] },
      { id: "cust_children_ages", text: "Ages of the children", type: "text" },
      { id: "cust_other_parent", text: "Describe the other parent's involvement", type: "textarea" },
      { id: "cust_concerns", text: "What are your primary concerns?", type: "multiselect", options: ["Child safety", "Substance abuse", "Domestic violence", "Neglect", "Parental alienation", "Relocation", "Financial support", "Communication issues", "Violation of existing order"] },
      { id: "cust_court", text: "Which court is handling (or would handle) the case?", type: "text" },
      { id: "cust_situation", text: "Describe the situation in your own words.", helpText: "Include any relevant history and what outcome you are hoping for.", type: "textarea", required: true },
    ],
    suggestedDocuments: [
      "Existing court orders",
      "Parenting plan or custody agreement",
      "Communication logs with the other parent",
      "School records",
      "Medical records for children",
      "Photos or evidence of living conditions",
      "Financial records (child support)",
      "Witness statements from family/teachers/counselors",
      "Police reports (if applicable)",
    ],
  },
  {
    id: "insurance",
    label: "Insurance Claim Denial",
    icon: "\u{1F6E1}\uFE0F",
    description: "Document your denied claim and build an appeal case.",
    questions: [
      { id: "ins_type", text: "What type of insurance?", type: "select", options: ["Health insurance", "Auto insurance", "Homeowner/renter insurance", "Life insurance", "Disability insurance", "Long-term care", "Other"], required: true },
      { id: "ins_company", text: "Insurance company name", type: "text", required: true },
      { id: "ins_policy_number", text: "Policy number (if you have it)", type: "text" },
      { id: "ins_claim_date", text: "When did you file the claim?", type: "date" },
      { id: "ins_denial_date", text: "When was it denied?", type: "date" },
      { id: "ins_denial_reason", text: "What reason did they give for the denial?", type: "textarea" },
      { id: "ins_appealed", text: "Have you already appealed?", type: "select", options: ["No, not yet", "Yes, once", "Yes, multiple times", "Not sure how to"] },
      { id: "ins_situation", text: "Describe what happened and what was denied.", helpText: "Include the treatment, repair, or coverage you were seeking.", type: "textarea", required: true },
    ],
    suggestedDocuments: [
      "Denial letter from insurance company",
      "Your insurance policy document",
      "Claim submission paperwork",
      "Medical records or bills (for health claims)",
      "Repair estimates (for property claims)",
      "Correspondence with insurance company",
      "Appeal letters (if already submitted)",
      "Doctor's letter of medical necessity",
      "Explanation of Benefits (EOB)",
    ],
  },
  {
    id: "housing",
    label: "Housing / Landlord Dispute",
    icon: "\u{1F3E0}",
    description: "Document lease violations, repair issues, or eviction concerns.",
    questions: [
      { id: "hous_type", text: "What type of housing issue?", type: "select", options: ["Eviction notice", "Needed repairs not made", "Security deposit dispute", "Lease violation by landlord", "Discrimination", "Habitability issues", "Rent increase dispute", "Illegal lockout", "Other"], required: true },
      { id: "hous_rental_type", text: "Type of housing", type: "select", options: ["Apartment", "House", "Mobile home", "Room rental", "Public/subsidized housing", "Other"] },
      { id: "hous_lease", text: "Do you have a written lease?", type: "select", options: ["Yes", "No — month to month", "No — verbal agreement", "Not sure"] },
      { id: "hous_duration", text: "How long have you lived there?", type: "select", options: ["Less than 6 months", "6-12 months", "1-2 years", "2-5 years", "More than 5 years"] },
      { id: "hous_landlord_contact", text: "Have you contacted the landlord about this?", type: "select", options: ["Yes, in writing", "Yes, verbally", "No", "They won't respond"] },
      { id: "hous_situation", text: "Describe the situation in your own words.", helpText: "Include dates, what happened, and what you've tried so far.", type: "textarea", required: true },
    ],
    suggestedDocuments: [
      "Lease or rental agreement",
      "Eviction notice (if received)",
      "Photos of property conditions/damage",
      "Written communication with landlord",
      "Repair requests (written)",
      "Rent payment receipts",
      "Security deposit receipt",
      "Building inspection reports",
      "Witness statements from neighbors",
    ],
  },
  {
    id: "workplace",
    label: "Workplace Retaliation",
    icon: "\u{1F4BC}",
    description: "Document workplace issues, discrimination, or retaliation.",
    questions: [
      { id: "work_type", text: "What type of workplace issue?", type: "select", options: ["Discrimination", "Harassment", "Retaliation for reporting", "Wrongful termination", "Wage theft", "Unsafe conditions", "Disability accommodation denial", "FMLA violation", "Other"], required: true },
      { id: "work_employer", text: "Employer name", type: "text" },
      { id: "work_duration", text: "How long have you worked there?", type: "select", options: ["Less than 6 months", "6-12 months", "1-3 years", "3-5 years", "More than 5 years", "No longer employed there"] },
      { id: "work_reported", text: "Have you reported this to HR or management?", type: "select", options: ["Yes", "No — afraid of retaliation", "No — no HR department", "Reported to external agency (EEOC, etc.)"] },
      { id: "work_filed", text: "Have you filed any formal complaints?", type: "select", options: ["No", "EEOC charge", "State agency complaint", "Workers' comp claim", "OSHA complaint", "Other"] },
      { id: "work_situation", text: "Describe what happened.", helpText: "Include dates, names of people involved, and what changed after you reported (if applicable).", type: "textarea", required: true },
    ],
    suggestedDocuments: [
      "Employment contract or offer letter",
      "Performance reviews",
      "Written warnings or disciplinary actions",
      "Emails or messages showing discrimination/harassment",
      "HR complaint records",
      "Pay stubs showing wage discrepancies",
      "Medical records (if related to workplace injury/stress)",
      "Witness statements from coworkers",
      "EEOC or agency filings",
      "Termination letter (if applicable)",
    ],
  },
];

export function getDomainModule(id: string): DomainModule | undefined {
  return DOMAIN_MODULES.find(m => m.id === id);
}

export function getDomainLabel(id: string): string {
  return DOMAIN_MODULES.find(m => m.id === id)?.label || id;
}
