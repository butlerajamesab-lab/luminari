import 'dotenv/config';
import { createConnection } from 'mysql2/promise';

const now = Date.now();

const paths = [
  // ═══════════════════════════════════════════════════════════
  // PATH 1: HUD Fair Housing Discrimination Complaint (Federal)
  // For: housing_discrimination, benefits_denial (discrimination basis)
  // ═══════════════════════════════════════════════════════════
  {
    pipelineType: "housing_discrimination",
    claimLabel: "Housing Discrimination Complaint",
    jurisdiction: "federal",
    priority: 1,
    agencyName: "U.S. Department of Housing and Urban Development — Office of Fair Housing and Equal Opportunity",
    agencyAcronym: "HUD FHEO",
    agencyDescription: "HUD's Office of Fair Housing and Equal Opportunity (FHEO) investigates allegations of housing discrimination under the Fair Housing Act. FHEO can investigate complaints, facilitate conciliation, and refer cases for legal action.",
    agencyPhone: "1-800-669-9777",
    agencyWebsite: "https://www.hud.gov/program_offices/fair_housing_equal_opp",
    agencyEmail: null,
    agencyAddress: "U.S. Department of Housing and Urban Development, 451 7th Street SW, Washington, DC 20410",
    formName: "Housing Discrimination Complaint Form",
    formNumber: "HUD-903",
    formUrl: "https://portalapps.hud.gov/FHEO903/Form903/Form903Start.action",
    formDescription: "The HUD-903 form is used to report housing discrimination. It collects information about the alleged discriminatory act, the parties involved, and the basis of discrimination (race, color, national origin, religion, sex, familial status, or disability).",
    submissionMethods: JSON.stringify([
      { method: "online", details: "Submit HUD-903 form online through HUD's portal", url: "https://portalapps.hud.gov/FHEO903/Form903/Form903Start.action", preferred: true },
      { method: "phone", details: "Call HUD's Fair Housing hotline at 1-800-669-9777 (voice) or 1-800-927-9275 (TTY)", url: null, preferred: false },
      { method: "mail", details: "Mail completed HUD-903 form to your nearest HUD regional office or to HUD headquarters in Washington, DC", url: null, preferred: false },
      { method: "email", details: "Email complaint details to your regional HUD FHEO office", url: null, preferred: false }
    ]),
    filingDeadlineDays: 365,
    filingDeadlineDescription: "You must file your complaint within ONE YEAR of the last date of the alleged discrimination under the Fair Housing Act. File as soon as possible — delays can weaken your case.",
    expectedResponseDays: 10,
    expectedResponseDescription: "After filing, HUD has 10 days to serve the complaint on the respondent (the party you're complaining about). HUD will assign an investigator shortly after intake.",
    investigationTimelineDays: 100,
    investigationTimelineDescription: "HUD is required to complete its investigation within 100 days of filing, though complex cases may take longer. Throughout the investigation, HUD will attempt conciliation between the parties.",
    steps: JSON.stringify([
      {
        order: 1,
        title: "Gather Your Evidence",
        description: "Collect all documents related to the discrimination: denial letters, application materials, correspondence with the housing provider, witness contact information, and a timeline of events.",
        actionType: "prepare",
        tips: [
          "Write down exactly what happened, when, and who was involved while it's fresh in your memory",
          "Save all text messages, emails, and voicemails from the housing provider",
          "Get contact information for anyone who witnessed the discrimination",
          "Keep copies of your housing application and any denial letters"
        ]
      },
      {
        order: 2,
        title: "File HUD-903 Complaint",
        description: "Submit the Housing Discrimination Complaint Form (HUD-903) online, by phone, or by mail. The online portal is fastest. Include all details about the discriminatory act and the basis of discrimination.",
        actionType: "file",
        tips: [
          "The online form at portalapps.hud.gov is the fastest way to file",
          "Be specific about dates, locations, and what was said or done",
          "Identify the protected class basis: race, color, national origin, religion, sex, familial status, or disability",
          "You can call 1-800-669-9777 for help completing the form"
        ]
      },
      {
        order: 3,
        title: "HUD Intake Review",
        description: "HUD reviews your complaint to determine if it falls under the Fair Housing Act. If it does, HUD drafts a formal allegation for your review and signature. HUD may refer your case to a state or local Fair Housing Assistance Program (FHAP) agency.",
        actionType: "wait",
        tips: [
          "Respond promptly to any requests for additional information from HUD",
          "HUD may interview you as part of the intake process",
          "If referred to a FHAP agency, the process is similar but handled locally"
        ]
      },
      {
        order: 4,
        title: "Investigation & Conciliation",
        description: "HUD assigns investigators who gather evidence, interview parties and witnesses, and inspect properties. Throughout the investigation, HUD attempts to help parties reach a voluntary agreement (conciliation).",
        actionType: "wait",
        tips: [
          "Cooperate fully with investigators — provide documents and be available for interviews",
          "You are not required to accept any conciliation offer",
          "Any agreement must be satisfactory to both parties and HUD",
          "Keep records of all communications with HUD during this period"
        ]
      },
      {
        order: 5,
        title: "Determination & Legal Action",
        description: "After investigation, HUD issues findings. If reasonable cause is found, the case proceeds to either a HUD Administrative Law Judge hearing or federal court (your choice). If no reasonable cause is found, you may still file a private lawsuit.",
        actionType: "respond",
        tips: [
          "If HUD finds reasonable cause, the government handles the legal case at no cost to you",
          "You can elect to have the case heard in federal court instead of by an ALJ",
          "Even if HUD finds no reasonable cause, you retain the right to file a private lawsuit within 2 years",
          "Consider consulting a fair housing attorney for advice on your options"
        ]
      }
    ]),
    escalationPaths: JSON.stringify([
      {
        condition: "HUD dismisses your complaint or finds no reasonable cause",
        action: "File a private lawsuit in federal or state court within 2 years of the discriminatory act",
        agencyName: "U.S. District Court or State Court",
        contactInfo: "Contact a fair housing attorney or legal aid organization",
        deadline: "2 years from the date of the discriminatory act"
      },
      {
        condition: "You need immediate legal help or the housing provider is retaliating",
        action: "Contact your local Legal Aid office or Fair Housing organization for emergency assistance",
        agencyName: "Local Legal Aid / Fair Housing Center",
        contactInfo: "Find legal aid at lawhelp.org or call 211",
        deadline: "Immediately — retaliation is a separate violation of the Fair Housing Act"
      },
      {
        condition: "The discrimination involves a pattern or practice affecting multiple people",
        action: "Report to the U.S. Department of Justice Civil Rights Division, which handles systemic cases",
        agencyName: "DOJ Civil Rights Division — Housing and Civil Enforcement Section",
        contactInfo: "1-800-896-7743 or civilrights.justice.gov",
        deadline: "No specific deadline for DOJ referrals, but file promptly"
      }
    ]),
    primaryStatuteCitation: "42 U.S.C. §§ 3601-3619",
    primaryStatuteTitle: "Fair Housing Act (Title VIII of the Civil Rights Act of 1968)",
    relatedStatutes: JSON.stringify([
      { citation: "42 U.S.C. § 3604", title: "Discrimination in sale or rental of housing", relevance: "Prohibits discrimination in housing transactions based on protected classes" },
      { citation: "42 U.S.C. § 3617", title: "Interference, coercion, or intimidation", relevance: "Prohibits retaliation against anyone exercising fair housing rights" },
      { citation: "Section 504 of the Rehabilitation Act", title: "Disability discrimination in federally-assisted programs", relevance: "Additional protections for people with disabilities in HUD-funded housing" },
      { citation: "Americans with Disabilities Act (ADA)", title: "Disability discrimination", relevance: "Applies to public housing authorities and some private housing" }
    ]),
    possibleOutcomes: JSON.stringify([
      { outcome: "Conciliation Agreement", description: "Voluntary settlement between you and the housing provider, monitored by HUD. May include compensation, policy changes, and housing placement.", likelihood: "common" },
      { outcome: "Reasonable Cause Determination + Legal Action", description: "HUD finds discrimination occurred and the case goes to an Administrative Law Judge or federal court. Government handles the case at no cost to you.", likelihood: "possible" },
      { outcome: "No Reasonable Cause", description: "HUD investigation does not find sufficient evidence of discrimination. You retain the right to file a private lawsuit.", likelihood: "possible" },
      { outcome: "Referral to FHAP Agency", description: "Your complaint is handled by a state or local fair housing agency with equivalent authority.", likelihood: "common" }
    ]),
    documentsNeeded: JSON.stringify([
      "Denial letter or written notice of adverse action from housing provider",
      "Housing application and any supporting documents you submitted",
      "All correspondence with the housing provider (emails, texts, letters)",
      "Timeline of events with specific dates",
      "Names and contact information of witnesses",
      "Photos or recordings if relevant (check state recording laws)",
      "Any advertisements or listings showing discriminatory language",
      "Proof of your protected class status if relevant (e.g., disability documentation)"
    ]),
    commonMistakes: JSON.stringify([
      "Waiting too long to file — the 1-year deadline is strict under the Fair Housing Act",
      "Not keeping copies of the denial letter or correspondence",
      "Accepting verbal explanations without getting them in writing",
      "Not identifying the correct legal basis (protected class) for the discrimination",
      "Failing to document the timeline of events while details are fresh",
      "Not reporting retaliation as a separate violation"
    ]),
    practicalTips: JSON.stringify([
      "File as soon as possible — don't wait for the 1-year deadline to approach",
      "You do NOT need a lawyer to file a HUD complaint — the process is designed for self-filing",
      "HUD's investigation and legal action are FREE to you if reasonable cause is found",
      "Keep a log of every interaction with the housing provider going forward",
      "If you're facing imminent homelessness, also contact 211 for emergency housing assistance",
      "Fair housing organizations can help you file and may provide free legal representation",
      "Testing organizations can help prove discrimination by sending matched testers to the housing provider"
    ]),
    isActive: true,
    lastVerifiedAt: now,
    dataSource: "HUD.gov FHEO, 42 U.S.C. §§ 3601-3619, 24 CFR Part 100",
    createdAt: now,
    updatedAt: now,
  },

  // ═══════════════════════════════════════════════════════════
  // PATH 2: Section 8 / Housing Choice Voucher Denial Appeal
  // For: section8_disputes, voucher_termination, benefits_denial
  // ═══════════════════════════════════════════════════════════
  {
    pipelineType: "section8_disputes",
    claimLabel: "Section 8 Voucher Denial or Termination Appeal",
    jurisdiction: "federal",
    priority: 1,
    agencyName: "Local Public Housing Authority (PHA)",
    agencyAcronym: "PHA",
    agencyDescription: "Your local Public Housing Authority administers the Section 8 Housing Choice Voucher program. When a PHA denies or terminates your voucher, federal law (24 CFR § 982.555) guarantees your right to an informal hearing to challenge the decision.",
    agencyPhone: null,
    agencyWebsite: "https://www.hud.gov/program_offices/public_indian_housing/pha/contacts",
    agencyEmail: null,
    agencyAddress: null,
    formName: "Written Request for Informal Hearing",
    formNumber: null,
    formUrl: null,
    formDescription: "There is no standard federal form. You must submit a WRITTEN request for an informal hearing to your PHA within the deadline stated in your denial/termination notice. The request should state that you disagree with the decision and want a hearing.",
    submissionMethods: JSON.stringify([
      { method: "mail", details: "Send a written hearing request to your PHA by certified mail (return receipt requested) to create a paper trail", url: null, preferred: true },
      { method: "in_person", details: "Deliver your written hearing request in person to the PHA office and get a dated receipt", url: null, preferred: false },
      { method: "email", details: "Some PHAs accept email requests — check your denial notice for instructions", url: null, preferred: false }
    ]),
    filingDeadlineDays: null,
    filingDeadlineDescription: "The deadline to request a hearing is set by YOUR LOCAL PHA — check your denial or termination notice carefully. It is typically 10 to 30 days from the date of the notice. MISSING THIS DEADLINE CAN WAIVE YOUR RIGHT TO A HEARING.",
    expectedResponseDays: 14,
    expectedResponseDescription: "After requesting a hearing, the PHA must schedule it in a reasonably expeditious manner. Most PHAs schedule hearings within 2-4 weeks of the request.",
    investigationTimelineDays: null,
    investigationTimelineDescription: "The hearing officer must issue a written decision after the hearing. There is no federal deadline for the decision, but it should be prompt. The decision must state the reasons and be based on a preponderance of the evidence.",
    steps: JSON.stringify([
      {
        order: 1,
        title: "Read Your Denial/Termination Notice Carefully",
        description: "Your PHA must provide written notice with the reason for denial or termination and your right to request a hearing. Find the DEADLINE for requesting a hearing — this is your most critical date.",
        actionType: "prepare",
        tips: [
          "The deadline is usually 10-30 days from the notice date — mark it on your calendar immediately",
          "The notice must state the specific reason for the adverse action",
          "If you didn't receive a written notice, that itself may be a violation of your rights",
          "Keep the original notice in a safe place"
        ]
      },
      {
        order: 2,
        title: "Submit Written Hearing Request",
        description: "Write a letter to your PHA stating: (1) you received the notice dated [date], (2) you disagree with the decision, and (3) you request an informal hearing under 24 CFR § 982.555. Send it by certified mail or deliver in person with a receipt.",
        actionType: "file",
        tips: [
          "Keep it simple — you don't need to explain your full case in the request letter",
          "Send by certified mail with return receipt requested for proof of delivery",
          "If delivering in person, get a stamped/dated copy as your receipt",
          "File BEFORE the deadline even if you're still gathering evidence"
        ]
      },
      {
        order: 3,
        title: "Prepare for Your Hearing",
        description: "Before the hearing, you have the right to examine any PHA documents relevant to the decision. Gather your own evidence: lease documents, payment records, correspondence, and witness statements.",
        actionType: "prepare",
        tips: [
          "Request to review the PHA's file on your case — they must allow this before the hearing",
          "You can bring a lawyer or representative at your own expense",
          "Organize your documents chronologically",
          "Prepare a brief written summary of your position",
          "Contact legal aid for free representation — many legal aid offices handle Section 8 hearings"
        ]
      },
      {
        order: 4,
        title: "Attend the Informal Hearing",
        description: "Present your case to the hearing officer. You can present evidence, call witnesses, and question the PHA's witnesses. The hearing officer cannot be the person who made the original decision.",
        actionType: "respond",
        tips: [
          "Be on time — missing the hearing may result in losing your appeal",
          "Present your evidence clearly and calmly",
          "The standard is 'preponderance of evidence' — you need to show it's more likely than not that the PHA's decision was wrong",
          "You can question the PHA's witnesses and challenge their evidence",
          "Ask for the decision in writing"
        ]
      },
      {
        order: 5,
        title: "Receive and Review the Decision",
        description: "The hearing officer must issue a written decision stating the reasons. If you win, the PHA must restore your voucher. If you lose, you may have further options including judicial review.",
        actionType: "respond",
        tips: [
          "The decision must be in writing and state the reasons",
          "If the decision is favorable, follow up to ensure the PHA implements it",
          "If unfavorable, consider filing a certiorari action in court for judicial review",
          "The PHA is not bound by a decision that is contrary to HUD regulations or law"
        ]
      }
    ]),
    escalationPaths: JSON.stringify([
      {
        condition: "The PHA refuses to grant a hearing or doesn't follow proper procedures",
        action: "File a complaint with HUD's Office of Public and Indian Housing (PIH)",
        agencyName: "HUD Office of Public and Indian Housing",
        contactInfo: "Contact your regional HUD office or call 1-800-955-2232",
        deadline: "File as soon as possible after the procedural violation"
      },
      {
        condition: "You lose the informal hearing and believe the decision was wrong",
        action: "File a certiorari action (judicial review) in state circuit court to challenge the PHA's decision",
        agencyName: "State Circuit Court",
        contactInfo: "Contact a legal aid attorney for help filing",
        deadline: "Varies by state — typically 30-90 days from the hearing decision"
      },
      {
        condition: "The denial or termination was based on discrimination",
        action: "File a separate Fair Housing complaint with HUD FHEO (see Housing Discrimination path)",
        agencyName: "HUD FHEO",
        contactInfo: "1-800-669-9777 or file online at HUD.gov",
        deadline: "Within 1 year of the discriminatory act"
      },
      {
        condition: "You face imminent homelessness due to voucher loss",
        action: "Contact 211 for emergency housing assistance and your local legal aid for emergency representation",
        agencyName: "211 / Local Legal Aid",
        contactInfo: "Dial 211 or visit 211.org",
        deadline: "Immediately"
      }
    ]),
    primaryStatuteCitation: "24 CFR § 982.555",
    primaryStatuteTitle: "Informal Hearing for Participant (Housing Choice Voucher Program)",
    relatedStatutes: JSON.stringify([
      { citation: "42 U.S.C. § 1437f", title: "Section 8 Housing Assistance", relevance: "Authorizing statute for the Housing Choice Voucher program" },
      { citation: "24 CFR § 982.552", title: "PHA Denial or Termination of Assistance", relevance: "Lists the grounds on which a PHA may deny or terminate voucher assistance" },
      { citation: "24 CFR § 982.554", title: "Informal Review for Applicant", relevance: "Separate process for applicants (not yet participants) who are denied — provides an informal review rather than hearing" },
      { citation: "24 CFR Part 5", title: "General HUD Program Requirements", relevance: "Includes noncitizen restrictions and hearing requirements" }
    ]),
    possibleOutcomes: JSON.stringify([
      { outcome: "Voucher Restored", description: "The hearing officer finds the PHA's decision was not supported by evidence or was contrary to law/regulations. Your voucher is reinstated.", likelihood: "possible" },
      { outcome: "PHA Decision Upheld", description: "The hearing officer finds the PHA's decision was proper. You may seek judicial review in court.", likelihood: "possible" },
      { outcome: "Negotiated Resolution", description: "Before or during the hearing, you and the PHA reach an agreement (e.g., compliance plan, probationary period).", likelihood: "common" },
      { outcome: "Procedural Victory", description: "The PHA failed to follow proper procedures (no written notice, missed deadlines), and the action is reversed on procedural grounds.", likelihood: "possible" }
    ]),
    documentsNeeded: JSON.stringify([
      "The denial or termination notice from your PHA (with the date and reason)",
      "Your PHA's Administrative Plan (request a copy — it contains their hearing procedures)",
      "Lease agreement and housing assistance payment records",
      "All correspondence with the PHA (letters, emails, notices)",
      "Income verification documents if the dispute involves income calculations",
      "Any evidence that contradicts the PHA's stated reason for the action",
      "Character references or letters of support if relevant",
      "Medical documentation if the issue involves disability accommodations"
    ]),
    commonMistakes: JSON.stringify([
      "Missing the hearing request deadline — this is the #1 mistake and it can waive your rights",
      "Not requesting the hearing in WRITING (verbal requests are not sufficient)",
      "Not keeping proof of when you submitted the hearing request",
      "Not reviewing the PHA's file before the hearing — you have the right to see their evidence",
      "Not bringing evidence or witnesses to the hearing",
      "Assuming you need a lawyer — you can represent yourself, but legal aid can help"
    ]),
    practicalTips: JSON.stringify([
      "ACT FAST — the hearing request deadline is often very short (10-30 days)",
      "Always put your hearing request in writing and keep proof of delivery",
      "Contact legal aid IMMEDIATELY — many offices prioritize Section 8 cases because of the short deadlines",
      "Request a copy of the PHA's Administrative Plan — it contains the specific hearing procedures for your area",
      "If the PHA claims you violated a rule, check whether they gave you proper notice of that rule",
      "If you have a disability, you may be entitled to reasonable accommodations in the hearing process",
      "The hearing officer cannot be the person who made the original decision — object if this happens",
      "If you're facing homelessness, also apply for emergency assistance through 211 while pursuing your appeal"
    ]),
    isActive: true,
    lastVerifiedAt: now,
    dataSource: "24 CFR § 982.555, HUD PIH guidance, Cornell Law Institute",
    createdAt: now,
    updatedAt: now,
  },

  // ═══════════════════════════════════════════════════════════
  // PATH 3: General Benefits Denial — Housing (catch-all)
  // For: benefits_denial when housing is the domain
  // ═══════════════════════════════════════════════════════════
  {
    pipelineType: "benefits_denial",
    claimLabel: "Housing Benefits Denial — General Appeal Path",
    jurisdiction: "federal",
    priority: 1,
    agencyName: "Local Public Housing Authority (PHA) or State Housing Finance Agency",
    agencyAcronym: "PHA / HFA",
    agencyDescription: "When housing benefits are denied, the responsible agency depends on the specific program. For public housing and Section 8, contact your local PHA. For state-funded programs, contact your State Housing Finance Agency. This path covers the general process for challenging a housing benefits denial.",
    agencyPhone: null,
    agencyWebsite: "https://www.hud.gov/program_offices/public_indian_housing/pha/contacts",
    agencyEmail: null,
    agencyAddress: null,
    formName: "Written Appeal / Hearing Request",
    formNumber: null,
    formUrl: null,
    formDescription: "Most housing benefit denials can be appealed through a written request. The specific form and process depends on the program. Check your denial notice for appeal instructions.",
    submissionMethods: JSON.stringify([
      { method: "mail", details: "Send a written appeal to the agency that denied your benefits by certified mail", url: null, preferred: true },
      { method: "in_person", details: "Deliver your written appeal in person and get a dated receipt", url: null, preferred: false },
      { method: "online", details: "Some agencies accept online appeals — check your denial notice", url: null, preferred: false }
    ]),
    filingDeadlineDays: null,
    filingDeadlineDescription: "CHECK YOUR DENIAL NOTICE for the specific deadline. Most housing programs require appeals within 10-30 days of the denial notice. Missing this deadline may waive your right to appeal.",
    expectedResponseDays: 30,
    expectedResponseDescription: "After filing an appeal, expect a response within 2-4 weeks. The agency must schedule a hearing or review in a reasonably expeditious manner.",
    investigationTimelineDays: null,
    investigationTimelineDescription: "The timeline varies by program and jurisdiction. Federal programs (Section 8, public housing) have specific procedural requirements. State programs follow state administrative procedures.",
    steps: JSON.stringify([
      {
        order: 1,
        title: "Identify the Program and Read Your Denial Notice",
        description: "Determine which specific housing program denied your benefits (Section 8, public housing, LIHTC, state rental assistance, etc.). Your denial notice must state the reason and your appeal rights.",
        actionType: "prepare",
        tips: [
          "The denial notice should identify the specific program and the reason for denial",
          "Note the appeal deadline — this is your most important date",
          "If you didn't receive a written denial, request one immediately in writing",
          "Different programs have different appeal processes — identify yours"
        ]
      },
      {
        order: 2,
        title: "File a Written Appeal Within the Deadline",
        description: "Submit a written request for appeal, hearing, or review to the agency that denied your benefits. State that you disagree with the decision and want to exercise your right to appeal.",
        actionType: "file",
        tips: [
          "File BEFORE the deadline even if you're still gathering evidence",
          "Send by certified mail with return receipt requested",
          "Reference the specific denial notice by date and any case/application number",
          "Keep copies of everything you send"
        ]
      },
      {
        order: 3,
        title: "Gather Evidence and Seek Legal Help",
        description: "Collect all documents supporting your eligibility: income records, identification, residency proof, and any evidence that contradicts the denial reason. Contact legal aid for free help.",
        actionType: "prepare",
        tips: [
          "Legal aid offices often handle housing benefits cases for free",
          "Find legal aid at lawhelp.org or call 211",
          "Request to review the agency's file on your case",
          "If the denial was based on incorrect information, gather proof of the correct information"
        ]
      },
      {
        order: 4,
        title: "Attend Your Hearing or Review",
        description: "Present your case at the scheduled hearing or review. Bring all evidence, witnesses, and a representative if possible.",
        actionType: "respond",
        tips: [
          "Be on time and prepared",
          "Present your evidence clearly and calmly",
          "You can bring a lawyer, advocate, or support person",
          "Ask questions about any evidence the agency presents against you"
        ]
      },
      {
        order: 5,
        title: "Follow Up on the Decision",
        description: "After the hearing, you should receive a written decision. If favorable, ensure the agency implements it. If unfavorable, explore further appeal options including judicial review.",
        actionType: "respond",
        tips: [
          "Get the decision in writing",
          "If you win, follow up to make sure benefits are actually restored",
          "If you lose, ask about further appeal options — many programs allow judicial review",
          "Consider whether the denial may have been discriminatory (see Fair Housing complaint path)"
        ]
      }
    ]),
    escalationPaths: JSON.stringify([
      {
        condition: "The denial may be based on discrimination (race, disability, familial status, etc.)",
        action: "File a Fair Housing complaint with HUD FHEO in addition to your program appeal",
        agencyName: "HUD FHEO",
        contactInfo: "1-800-669-9777 or file online at HUD.gov",
        deadline: "Within 1 year of the discriminatory act"
      },
      {
        condition: "The agency refuses to provide a hearing or follow proper procedures",
        action: "File a complaint with HUD or your state housing oversight agency",
        agencyName: "HUD / State Housing Agency",
        contactInfo: "Contact your regional HUD office",
        deadline: "As soon as possible"
      },
      {
        condition: "You lose the appeal and believe the decision was legally wrong",
        action: "Seek judicial review through state court",
        agencyName: "State Court",
        contactInfo: "Contact legal aid for help filing",
        deadline: "Varies by state — typically 30-90 days"
      },
      {
        condition: "You face imminent homelessness",
        action: "Contact 211 for emergency housing assistance immediately",
        agencyName: "211 / Emergency Services",
        contactInfo: "Dial 211 or visit 211.org",
        deadline: "Immediately"
      }
    ]),
    primaryStatuteCitation: "42 U.S.C. § 1437d(k)",
    primaryStatuteTitle: "Public Housing Grievance Procedures",
    relatedStatutes: JSON.stringify([
      { citation: "24 CFR § 982.555", title: "Informal Hearing for HCV Participant", relevance: "Hearing rights for Section 8 voucher holders" },
      { citation: "24 CFR § 982.554", title: "Informal Review for HCV Applicant", relevance: "Review rights for Section 8 applicants denied assistance" },
      { citation: "24 CFR Part 966", title: "Public Housing Lease and Grievance Procedures", relevance: "Grievance procedures for public housing residents" },
      { citation: "42 U.S.C. §§ 3601-3619", title: "Fair Housing Act", relevance: "If denial is based on discrimination" }
    ]),
    possibleOutcomes: JSON.stringify([
      { outcome: "Benefits Restored", description: "The appeal finds the denial was improper and your benefits are reinstated.", likelihood: "possible" },
      { outcome: "Denial Upheld", description: "The appeal finds the denial was proper. Further judicial review may be available.", likelihood: "possible" },
      { outcome: "Modified Decision", description: "The agency modifies its decision — for example, approving benefits with conditions or a compliance plan.", likelihood: "common" },
      { outcome: "Referral to Correct Program", description: "You may be directed to a different housing program that better fits your situation.", likelihood: "possible" }
    ]),
    documentsNeeded: JSON.stringify([
      "The denial notice (with date, reason, and appeal instructions)",
      "Your original application and all supporting documents",
      "Income verification (pay stubs, tax returns, benefit statements)",
      "Identification documents",
      "Proof of residency or housing need",
      "Any correspondence with the housing agency",
      "Medical documentation if disability-related",
      "Evidence contradicting the stated reason for denial"
    ]),
    commonMistakes: JSON.stringify([
      "Missing the appeal deadline — check your denial notice immediately",
      "Not putting the appeal in writing",
      "Not keeping proof of when you filed the appeal",
      "Assuming the denial is final without checking appeal rights",
      "Not seeking free legal help — legal aid handles these cases regularly"
    ]),
    practicalTips: JSON.stringify([
      "READ YOUR DENIAL NOTICE CAREFULLY — it contains your deadline and appeal instructions",
      "File your appeal IMMEDIATELY — don't wait until the deadline approaches",
      "Contact legal aid for free help — find your local office at lawhelp.org",
      "Call 211 for both housing assistance and legal referrals",
      "If you're denied by one program, ask about other housing programs you may qualify for",
      "Keep copies of EVERYTHING — every letter, every form, every receipt",
      "If the denial seems discriminatory, you may have TWO separate claims: the program appeal AND a Fair Housing complaint"
    ]),
    isActive: true,
    lastVerifiedAt: now,
    dataSource: "HUD.gov, 24 CFR Parts 966/982, state housing authority guidance",
    createdAt: now,
    updatedAt: now,
  },

  // ═══════════════════════════════════════════════════════════
  // PATH 4: Eviction Defense Path
  // For: eviction_defense pipeline
  // ═══════════════════════════════════════════════════════════
  {
    pipelineType: "eviction_defense",
    claimLabel: "Eviction Defense — Know Your Rights and Fight Back",
    jurisdiction: "federal",
    priority: 1,
    agencyName: "Local Court / Legal Aid Organization",
    agencyAcronym: null,
    agencyDescription: "Eviction is a court process. Your landlord cannot evict you without going through the courts. You have the right to respond to the eviction complaint, appear at the hearing, and present defenses. Legal aid organizations provide free representation in eviction cases.",
    agencyPhone: null,
    agencyWebsite: "https://www.lawhelp.org",
    agencyEmail: null,
    agencyAddress: null,
    formName: "Answer to Eviction Complaint",
    formNumber: null,
    formUrl: null,
    formDescription: "When served with an eviction complaint (also called unlawful detainer, forcible entry and detainer, or summary process depending on your state), you must file a written Answer with the court within the deadline stated in the summons.",
    submissionMethods: JSON.stringify([
      { method: "in_person", details: "File your Answer at the courthouse clerk's office", url: null, preferred: true },
      { method: "online", details: "Some courts accept electronic filing — check your local court's website", url: null, preferred: false },
      { method: "mail", details: "Some jurisdictions allow filing by mail — check your summons for instructions", url: null, preferred: false }
    ]),
    filingDeadlineDays: null,
    filingDeadlineDescription: "The deadline to respond to an eviction complaint varies by state — typically 5 to 30 days from when you are served. CHECK YOUR SUMMONS for the exact deadline. Missing it may result in a default judgment against you.",
    expectedResponseDays: null,
    expectedResponseDescription: "Eviction cases move fast. After filing your Answer, expect a court hearing within 1-4 weeks depending on your jurisdiction.",
    investigationTimelineDays: null,
    investigationTimelineDescription: "Eviction cases are typically resolved within 30-90 days from filing, though this varies significantly by jurisdiction and case complexity.",
    steps: JSON.stringify([
      {
        order: 1,
        title: "Don't Panic — Read the Eviction Notice",
        description: "Determine what type of notice you received: a notice to quit/vacate (pre-lawsuit warning) or an actual court summons and complaint (lawsuit filed). The response and timeline are different for each.",
        actionType: "prepare",
        tips: [
          "A notice to quit is NOT yet a court case — it's a warning that the landlord may file",
          "A court summons means a case has been filed — you MUST respond by the deadline",
          "Note every date on the documents",
          "Do NOT move out just because you received a notice — you have rights"
        ]
      },
      {
        order: 2,
        title: "Contact Legal Aid Immediately",
        description: "Many jurisdictions now provide free lawyers for tenants facing eviction. Contact legal aid as soon as possible — they can help you understand your rights and represent you in court.",
        actionType: "prepare",
        tips: [
          "Find legal aid at lawhelp.org or call 211",
          "Many cities have 'right to counsel' programs providing free eviction lawyers",
          "Legal aid can often negotiate with landlords to avoid eviction",
          "Even if you can't get a lawyer, legal aid can help you understand the process"
        ]
      },
      {
        order: 3,
        title: "File Your Answer with the Court",
        description: "If you've been served with a court complaint, file a written Answer before the deadline. Your Answer should deny the allegations you disagree with and raise any defenses (landlord retaliation, discrimination, failure to maintain the property, improper notice, etc.).",
        actionType: "file",
        tips: [
          "File your Answer even if you think the landlord is right — it preserves your rights and buys time",
          "Common defenses: improper notice, retaliation, discrimination, uninhabitable conditions, landlord's failure to make repairs",
          "Many courts have self-help centers that can help you fill out the Answer form",
          "Keep a copy of your filed Answer with the court stamp"
        ]
      },
      {
        order: 4,
        title: "Attend the Court Hearing",
        description: "Appear at your scheduled court hearing. Bring all evidence: lease, payment records, photos of conditions, correspondence with landlord, and witnesses.",
        actionType: "respond",
        tips: [
          "ALWAYS show up — a default judgment will be entered against you if you don't appear",
          "Dress appropriately and arrive early",
          "Bring organized evidence and copies for the judge and opposing party",
          "Be respectful to the judge and opposing counsel even if you're upset"
        ]
      },
      {
        order: 5,
        title: "Negotiate or Receive the Court's Decision",
        description: "Many eviction cases settle before or at the hearing. If you can't settle, the judge will decide. If you lose, you may have a period to move out or file an appeal.",
        actionType: "escalate",
        tips: [
          "Settlement options may include: payment plan, move-out agreement with more time, or case dismissal",
          "If you lose, ask about the appeal process and timeline",
          "If you need more time to move, ask the judge for a stay of execution",
          "An eviction on your record can make future housing harder — try to negotiate a dismissal or sealed record"
        ]
      }
    ]),
    escalationPaths: JSON.stringify([
      {
        condition: "The eviction is retaliatory (you complained about conditions or exercised legal rights)",
        action: "Raise retaliation as a defense in court and file a complaint with your state tenant protection agency",
        agencyName: "State Attorney General / Tenant Protection Office",
        contactInfo: "Contact your state AG's consumer protection division",
        deadline: "Raise in your Answer to the eviction complaint"
      },
      {
        condition: "The eviction is discriminatory",
        action: "File a Fair Housing complaint with HUD FHEO and raise discrimination as a defense in court",
        agencyName: "HUD FHEO",
        contactInfo: "1-800-669-9777",
        deadline: "Within 1 year of the discriminatory act"
      },
      {
        condition: "You lose in court",
        action: "File an appeal within the deadline set by your state's rules of appellate procedure",
        agencyName: "Appellate Court",
        contactInfo: "Contact legal aid for help with appeals",
        deadline: "Varies by state — typically 10-30 days from judgment"
      }
    ]),
    primaryStatuteCitation: "State landlord-tenant law (varies by state)",
    primaryStatuteTitle: "State Eviction / Unlawful Detainer Statute",
    relatedStatutes: JSON.stringify([
      { citation: "42 U.S.C. §§ 3601-3619", title: "Fair Housing Act", relevance: "If eviction is based on discrimination" },
      { citation: "Violence Against Women Act (VAWA)", title: "VAWA Housing Protections", relevance: "Protects domestic violence survivors from eviction based on the violence" },
      { citation: "CARES Act § 4024", title: "Eviction Notice Requirements for Covered Properties", relevance: "Additional notice requirements for federally-backed properties" }
    ]),
    possibleOutcomes: JSON.stringify([
      { outcome: "Case Dismissed", description: "The court finds the eviction was improper (bad notice, no grounds, procedural defect). You stay in your home.", likelihood: "possible" },
      { outcome: "Settlement / Stipulation", description: "You and the landlord agree to terms — payment plan, move-out date, or conditions. Most common outcome.", likelihood: "common" },
      { outcome: "Judgment for Landlord", description: "The court orders eviction. You typically have a period to move out or appeal.", likelihood: "possible" },
      { outcome: "Judgment for Tenant", description: "The court rules in your favor — you stay, and the landlord may owe you damages.", likelihood: "possible" }
    ]),
    documentsNeeded: JSON.stringify([
      "The eviction notice and/or court summons and complaint",
      "Your lease or rental agreement",
      "Rent payment records (receipts, bank statements, money order stubs)",
      "All correspondence with your landlord (texts, emails, letters)",
      "Photos/videos of property conditions if relevant",
      "Records of repair requests and landlord's responses",
      "Witness contact information",
      "Any evidence of retaliation or discrimination"
    ]),
    commonMistakes: JSON.stringify([
      "Not responding to the court summons — this results in automatic loss (default judgment)",
      "Moving out before the court orders it — you may lose your right to fight",
      "Not seeking legal help — free lawyers are often available for eviction cases",
      "Paying rent to the landlord during the case without getting a receipt",
      "Not raising defenses in your Answer — defenses not raised may be waived",
      "Ignoring the eviction because you think you'll lose — even if you can't win, you can negotiate"
    ]),
    practicalTips: JSON.stringify([
      "NEVER ignore an eviction notice or court summons — always respond",
      "Contact legal aid IMMEDIATELY — many areas provide free eviction lawyers",
      "If you owe rent, try to pay what you can and document the payment",
      "Look into emergency rental assistance programs — call 211",
      "If your home has serious problems (no heat, mold, pests), this may be a defense",
      "Keep paying rent during the case unless your lawyer advises otherwise",
      "Even if you have to move, negotiating can get you more time and a clean record"
    ]),
    isActive: true,
    lastVerifiedAt: now,
    dataSource: "State landlord-tenant statutes, HUD.gov, lawhelp.org",
    createdAt: now,
    updatedAt: now,
  },

  // ═══════════════════════════════════════════════════════════
  // PATH 5: Voucher Termination (maps to voucher_termination pipeline)
  // Alias to section8_disputes but with specific voucher termination framing
  // ═══════════════════════════════════════════════════════════
  {
    pipelineType: "voucher_termination",
    claimLabel: "Housing Voucher Termination Appeal",
    jurisdiction: "federal",
    priority: 1,
    agencyName: "Local Public Housing Authority (PHA)",
    agencyAcronym: "PHA",
    agencyDescription: "When your housing voucher is terminated, your PHA must provide written notice with the reason and your right to an informal hearing under 24 CFR § 982.555. This hearing is your opportunity to challenge the termination and keep your voucher.",
    agencyPhone: null,
    agencyWebsite: "https://www.hud.gov/program_offices/public_indian_housing/pha/contacts",
    agencyEmail: null,
    agencyAddress: null,
    formName: "Written Request for Informal Hearing",
    formNumber: null,
    formUrl: null,
    formDescription: "Submit a written request for an informal hearing to your PHA. Reference the termination notice, state that you disagree, and request a hearing under 24 CFR § 982.555.",
    submissionMethods: JSON.stringify([
      { method: "mail", details: "Send by certified mail with return receipt requested to your PHA", url: null, preferred: true },
      { method: "in_person", details: "Deliver in person to the PHA office and get a dated receipt", url: null, preferred: false }
    ]),
    filingDeadlineDays: null,
    filingDeadlineDescription: "Check your termination notice for the deadline — typically 10 to 30 days. The PHA must continue your assistance until the hearing decision if you request a hearing before the termination effective date.",
    expectedResponseDays: 14,
    expectedResponseDescription: "The PHA must schedule the hearing in a reasonably expeditious manner, typically within 2-4 weeks.",
    investigationTimelineDays: null,
    investigationTimelineDescription: "The hearing officer issues a written decision after the hearing. If you requested the hearing before the termination date, your assistance continues until the decision.",
    steps: JSON.stringify([
      {
        order: 1,
        title: "Read Your Termination Notice — Note the Deadline",
        description: "Your PHA must give you written notice stating the reason for termination and your right to request a hearing. The deadline to request a hearing is critical — mark it immediately.",
        actionType: "prepare",
        tips: ["The deadline is usually 10-30 days from the notice", "If you request a hearing BEFORE the termination date, your voucher continues until the decision", "Keep the original notice safe"]
      },
      {
        order: 2,
        title: "Request an Informal Hearing in Writing",
        description: "Send a written request to your PHA stating you disagree with the termination and request a hearing under 24 CFR § 982.555.",
        actionType: "file",
        tips: ["Send by certified mail for proof", "File BEFORE the termination effective date to keep your voucher active", "Contact legal aid for help"]
      },
      {
        order: 3,
        title: "Prepare Your Case",
        description: "Review the PHA's file, gather evidence, and prepare your arguments. Contact legal aid for free representation.",
        actionType: "prepare",
        tips: ["You have the right to examine PHA documents before the hearing", "Legal aid offices regularly handle these cases", "Organize evidence chronologically"]
      },
      {
        order: 4,
        title: "Attend the Hearing and Present Your Case",
        description: "Present evidence, question witnesses, and argue why the termination should be reversed.",
        actionType: "respond",
        tips: ["The hearing officer cannot be the person who made the termination decision", "Bring all evidence and witnesses", "The standard is preponderance of evidence"]
      },
      {
        order: 5,
        title: "Receive the Decision",
        description: "The hearing officer issues a written decision. If favorable, your voucher is restored. If unfavorable, consider judicial review.",
        actionType: "respond",
        tips: ["Get the decision in writing", "If unfavorable, you may file for judicial review in state court", "If favorable, follow up to ensure implementation"]
      }
    ]),
    escalationPaths: JSON.stringify([
      { condition: "PHA refuses to grant a hearing", action: "File complaint with HUD PIH", agencyName: "HUD PIH", contactInfo: "1-800-955-2232", deadline: "Immediately" },
      { condition: "Hearing decision is unfavorable", action: "File certiorari action in state court", agencyName: "State Court", contactInfo: "Contact legal aid", deadline: "Typically 30-90 days" },
      { condition: "Termination is discriminatory", action: "File Fair Housing complaint with HUD FHEO", agencyName: "HUD FHEO", contactInfo: "1-800-669-9777", deadline: "Within 1 year" }
    ]),
    primaryStatuteCitation: "24 CFR § 982.555",
    primaryStatuteTitle: "Informal Hearing for Participant (Housing Choice Voucher Program)",
    relatedStatutes: JSON.stringify([
      { citation: "24 CFR § 982.552", title: "PHA Denial or Termination of Assistance", relevance: "Grounds for termination" },
      { citation: "42 U.S.C. § 1437f", title: "Section 8 Housing Assistance", relevance: "Authorizing statute" }
    ]),
    possibleOutcomes: JSON.stringify([
      { outcome: "Voucher Restored", description: "Termination reversed — your voucher continues.", likelihood: "possible" },
      { outcome: "Termination Upheld", description: "Hearing officer agrees with PHA. Judicial review available.", likelihood: "possible" },
      { outcome: "Negotiated Resolution", description: "Agreement reached — compliance plan, probation, etc.", likelihood: "common" }
    ]),
    documentsNeeded: JSON.stringify([
      "Termination notice from PHA",
      "Lease and housing assistance records",
      "All PHA correspondence",
      "Evidence contradicting the termination reason",
      "Medical documentation if disability-related"
    ]),
    commonMistakes: JSON.stringify([
      "Missing the hearing request deadline",
      "Not requesting the hearing in writing",
      "Not requesting the hearing BEFORE the termination effective date (which would continue assistance)",
      "Not seeking legal aid"
    ]),
    practicalTips: JSON.stringify([
      "Request the hearing BEFORE the termination date to keep your voucher active during the process",
      "Contact legal aid immediately — they handle these cases regularly",
      "If you have a disability, request reasonable accommodations",
      "Also apply for emergency housing assistance through 211 as a backup"
    ]),
    isActive: true,
    lastVerifiedAt: now,
    dataSource: "24 CFR § 982.555, HUD PIH guidance",
    createdAt: now,
    updatedAt: now,
  },
];

async function seed() {
  const { createConnection } = await import('mysql2/promise');
  const conn = await createConnection(process.env.DATABASE_URL);
  
  for (const p of paths) {
    const cols = Object.keys(p);
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO enforcement_action_paths (${cols.join(', ')}) VALUES (${placeholders})`;
    await conn.execute(sql, Object.values(p));
    console.log(`Inserted: ${p.pipelineType} — ${p.claimLabel}`);
  }
  
  const [count] = await conn.execute('SELECT COUNT(*) as cnt FROM enforcement_action_paths');
  console.log(`\nTotal action paths: ${count[0].cnt}`);
  
  await conn.end();
}

seed().catch(e => { console.error(e); process.exit(1); });
