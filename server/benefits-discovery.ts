/**
 * Luminari — "Did You Know?" Benefit Discovery Engine
 *
 * Most people don't know what programs exist. This engine surfaces
 * one program at a time, in plain language, with the kind of facts
 * that make people say "wait, really?"
 *
 * Each spotlight is designed to be:
 *   - Surprising: leads with a fact most people don't know
 *   - Actionable: tells you exactly what to do next
 *   - Shareable: formatted so you can send it to someone who needs it
 *   - Contextual: when a user has a case, spotlights match their situation
 */

import { BENEFIT_PROGRAMS, type BenefitCategory, type BenefitProgram } from "./benefits-navigator";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DiscoverySpotlight {
  /** Program ID this spotlight is about. */
  program_id: string;
  /** The "Did You Know?" headline — the surprising fact. */
  headline: string;
  /** A 1-2 sentence plain-language explanation. */
  explanation: string;
  /** What most people get wrong or don't know. */
  common_misconception?: string;
  /** The one thing to do right now. */
  action_step: string;
  /** Phone number or URL for immediate action. */
  action_contact?: string;
  /** Category for filtering. */
  category: BenefitCategory;
  /** Tags for contextual matching. */
  context_tags: string[];
  /** Emoji icon for visual distinction. */
  icon: string;
}

export interface DiscoveryFeed {
  /** The spotlight to show. */
  spotlight: DiscoverySpotlight;
  /** The full program details. */
  program: BenefitProgram;
  /** Why this was selected (for contextual feeds). */
  selection_reason?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPOTLIGHT CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

const SPOTLIGHTS: DiscoverySpotlight[] = [
  // ─── FOOD ───
  {
    program_id: "snap",
    headline: "You can get emergency food benefits in 7 days",
    explanation: "If you have less than $100 in the bank and your monthly income is below $150, you qualify for expedited SNAP benefits. Most people wait the full 30 days because they don't know to ask for emergency processing.",
    common_misconception: "Many people think SNAP is only for people who are unemployed. You can work full-time and still qualify if your income is low enough.",
    action_step: "Call your local SNAP office and specifically ask for 'expedited benefits' — they're required to process you within 7 days.",
    action_contact: "1-800-221-5689",
    category: "food",
    context_tags: ["hungry", "food", "groceries", "job_loss", "low_income", "children"],
    icon: "🍎"
  },
  {
    program_id: "wic",
    headline: "WIC covers food for pregnant women and kids under 5 — even if you have a job",
    explanation: "WIC provides free nutritious food, baby formula, and nutrition counseling. A family of 3 earning up to $42,000/year can qualify. Over half of all babies born in the U.S. are enrolled in WIC.",
    common_misconception: "WIC isn't just for unemployed mothers. If your household income is at or below 185% of the poverty level, you likely qualify — that's higher than most people think.",
    action_step: "Find your nearest WIC clinic and schedule an appointment. You can apply while pregnant — don't wait until after the baby is born.",
    action_contact: "https://www.fns.usda.gov/wic",
    category: "food",
    context_tags: ["pregnant", "baby", "infant", "children", "formula", "nutrition"],
    icon: "👶"
  },
  {
    program_id: "tefap",
    headline: "Food banks don't ask for proof of income",
    explanation: "The Emergency Food Assistance Program stocks local food banks and pantries with free food. You don't need to prove your income, show ID, or fill out paperwork at most food banks. Just show up.",
    common_misconception: "People think food banks are only for the homeless. They're for anyone who needs food — working families, seniors, students, anyone.",
    action_step: "Find your nearest food bank at FeedingAmerica.org or call 2-1-1. Most are open specific days of the week.",
    action_contact: "https://www.feedingamerica.org/find-your-local-foodbank",
    category: "food",
    context_tags: ["hungry", "food", "emergency", "no_income", "homeless"],
    icon: "🏪"
  },

  // ─── HEALTHCARE ───
  {
    program_id: "medicaid",
    headline: "Medicaid covers adults with no income — not just families with kids",
    explanation: "In 40 states, Medicaid now covers all adults earning up to 138% of the poverty level (~$20,000/year for one person). That includes single adults with no children. Coverage includes doctor visits, prescriptions, mental health, and substance abuse treatment.",
    common_misconception: "Before 2014, Medicaid was mostly for children, pregnant women, and people with disabilities. Many adults still don't know they now qualify.",
    action_step: "Apply at HealthCare.gov or your state Medicaid office. In most states, you can get approved within days.",
    action_contact: "https://www.healthcare.gov",
    category: "healthcare",
    context_tags: ["sick", "doctor", "health", "insurance", "uninsured", "prescription", "mental_health"],
    icon: "🏥"
  },
  {
    program_id: "chip",
    headline: "Children's health insurance costs $0 in most states",
    explanation: "CHIP covers doctor visits, dental, vision, prescriptions, and hospital stays for children in families that earn too much for Medicaid but can't afford private insurance. In most states, the premium is $0. A family of 4 earning up to $62,000/year may qualify.",
    common_misconception: "Parents often think their kids don't qualify because they have some income. CHIP income limits are much higher than Medicaid — check even if you think you earn too much.",
    action_step: "Call 1-877-KIDS-NOW (1-877-543-7669) or apply at InsureKidsNow.gov.",
    action_contact: "1-877-543-7669",
    category: "healthcare",
    context_tags: ["children", "kids", "health", "dental", "vision", "uninsured"],
    icon: "🧒"
  },
  {
    program_id: "medicare",
    headline: "Medicare Part D Extra Help can save you $5,000/year on prescriptions",
    explanation: "If you're on Medicare and have limited income, the Extra Help program pays most of your prescription drug costs. You could save an average of $5,000 per year. About 2 million people who qualify haven't signed up.",
    common_misconception: "Many seniors think Medicare covers all their prescriptions. It doesn't — Part D has premiums, deductibles, and copays that can add up fast. Extra Help eliminates most of these costs.",
    action_step: "Apply for Extra Help at ssa.gov/medicare/part-d-extra-help or call Social Security at 1-800-772-1213.",
    action_contact: "1-800-772-1213",
    category: "healthcare",
    context_tags: ["elderly", "senior", "prescriptions", "medication", "medicare", "drugs"],
    icon: "💊"
  },

  // ─── HOUSING ───
  {
    program_id: "section_8",
    headline: "Section 8 pays up to 70% of your rent",
    explanation: "The Housing Choice Voucher Program (Section 8) pays a portion of your rent directly to your landlord. You pay about 30% of your income toward rent, and the voucher covers the rest. It works with private landlords — you're not limited to public housing.",
    common_misconception: "People think Section 8 waitlists are always closed. While some areas have long waits, many housing authorities open their lists periodically. Some areas have shorter waits than you'd expect.",
    action_step: "Contact your local Public Housing Authority to check if the waitlist is open. Apply to multiple PHAs in your area to increase your chances.",
    action_contact: "https://www.hud.gov/program_offices/public_indian_housing/pha/contacts",
    category: "housing",
    context_tags: ["rent", "housing", "homeless", "eviction", "landlord", "apartment"],
    icon: "🏠"
  },
  {
    program_id: "emergency_shelter",
    headline: "Emergency shelters can't turn you away if they have space",
    explanation: "If you're homeless or about to be, emergency shelters provide immediate housing, meals, and connections to services. Many also help with job placement, mental health, and getting into permanent housing.",
    action_step: "Call 2-1-1 to find the nearest emergency shelter. If you have children, ask specifically about family shelters — they have separate facilities.",
    action_contact: "2-1-1",
    category: "housing",
    context_tags: ["homeless", "shelter", "emergency", "eviction", "domestic_violence", "children"],
    icon: "🛏️"
  },

  // ─── UTILITIES ───
  {
    program_id: "liheap",
    headline: "LIHEAP can pay your entire heating bill — and prevent shutoffs",
    explanation: "The Low Income Home Energy Assistance Program helps pay heating and cooling bills. In some states, a single payment can cover your entire winter heating bill. It can also prevent utility shutoffs and help with weatherization to lower future bills.",
    common_misconception: "Many people think LIHEAP is only for homeowners. Renters qualify too — even if utilities are included in your rent, you may still be eligible.",
    action_step: "Apply through your state or local LIHEAP office before winter. Funds run out, so apply early in the season.",
    action_contact: "https://www.acf.hhs.gov/ocs/liheap-state-and-territory-contact-listing",
    category: "utilities",
    context_tags: ["heating", "electric", "utility", "shutoff", "winter", "energy", "gas"],
    icon: "🔥"
  },
  {
    program_id: "lifeline",
    headline: "You can get a free phone and internet through Lifeline",
    explanation: "The Lifeline program provides a $9.25/month discount on phone or internet service. Many carriers offer completely free phones and plans to Lifeline-eligible customers. If you're on SNAP, Medicaid, SSI, or other programs, you automatically qualify.",
    common_misconception: "People think 'Obama phones' ended. They didn't — the Lifeline program is still active and has expanded to include internet service.",
    action_step: "Check your eligibility and apply at LifelineSupport.org or call 1-800-234-9473.",
    action_contact: "1-800-234-9473",
    category: "utilities",
    context_tags: ["phone", "internet", "cell", "mobile", "wifi", "broadband", "communication"],
    icon: "📱"
  },

  // ─── CASH ASSISTANCE ───
  {
    program_id: "tanf",
    headline: "TANF provides monthly cash — plus job training and child care",
    explanation: "Temporary Assistance for Needy Families provides monthly cash payments to help families meet basic needs. But it also funds job training, child care assistance, and transportation help that most people don't know about.",
    common_misconception: "Many people think 'welfare' was eliminated in the 1990s. It was reformed into TANF, which still provides cash assistance — the name just changed.",
    action_step: "Apply through your state's human services office. If you have children and limited income, you likely qualify.",
    action_contact: "https://www.acf.hhs.gov/ofa/map/about/help-families",
    category: "cash_assistance",
    context_tags: ["cash", "money", "bills", "children", "single_parent", "job_loss"],
    icon: "💵"
  },
  {
    program_id: "ssi",
    headline: "SSI pays up to $943/month if you're disabled or over 65 with limited income",
    explanation: "Supplemental Security Income provides monthly payments to people who are 65+, blind, or disabled and have very limited income and resources. Unlike SSDI, you don't need work history to qualify.",
    common_misconception: "People confuse SSI with Social Security retirement. SSI is a separate program — you don't need to have worked or paid into Social Security to get it.",
    action_step: "Apply at your local Social Security office or call 1-800-772-1213. The process can take months, so apply as soon as possible.",
    action_contact: "1-800-772-1213",
    category: "cash_assistance",
    context_tags: ["disabled", "disability", "elderly", "senior", "blind", "income", "ssi"],
    icon: "🤝"
  },
  {
    program_id: "ssdi",
    headline: "If you've worked and become disabled, SSDI can replace part of your income",
    explanation: "Social Security Disability Insurance pays monthly benefits to people who can't work due to a medical condition expected to last at least a year. The average payment is about $1,500/month. After 24 months on SSDI, you automatically get Medicare.",
    common_misconception: "Most initial SSDI applications are denied — but that doesn't mean you don't qualify. About 50% of people who appeal win their case. Don't give up after the first denial.",
    action_step: "Apply online at ssa.gov or call 1-800-772-1213. If denied, file an appeal within 60 days — don't start over.",
    action_contact: "1-800-772-1213",
    category: "cash_assistance",
    context_tags: ["disabled", "disability", "can't work", "injury", "chronic", "mental_health"],
    icon: "📋"
  },
  {
    program_id: "eitc",
    headline: "The EITC can put up to $7,430 back in your pocket at tax time",
    explanation: "The Earned Income Tax Credit is a refundable tax credit for low-to-moderate income workers. Even if you don't owe taxes, you get the money as a refund. A family with 3 kids earning $59,000 or less can qualify.",
    common_misconception: "About 1 in 5 eligible workers don't claim the EITC — that's billions of dollars left on the table every year. If you earned any income, even part-time, check if you qualify.",
    action_step: "Use the IRS EITC Assistant at irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc to check eligibility. File a tax return even if your income was very low.",
    action_contact: "https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc",
    category: "cash_assistance",
    context_tags: ["taxes", "income", "working", "low_income", "refund", "children"],
    icon: "💰"
  },

  // ─── BURIAL & BEREAVEMENT ───
  {
    program_id: "ssa_death_benefit",
    headline: "Social Security pays a $255 death benefit — but you have to apply within 2 years",
    explanation: "When someone who paid into Social Security dies, their surviving spouse or dependent children can receive a one-time $255 payment. It's not much, but most people don't know it exists and never claim it.",
    common_misconception: "This benefit isn't automatic — you have to apply for it. Many families miss it because no one tells them.",
    action_step: "Call Social Security at 1-800-772-1213 to apply. You'll need the deceased's Social Security number and a death certificate.",
    action_contact: "1-800-772-1213",
    category: "burial_bereavement",
    context_tags: ["death", "died", "passed_away", "funeral", "burial", "spouse", "parent"],
    icon: "🕊️"
  },
  {
    program_id: "ss_survivor_benefits",
    headline: "Surviving spouses can receive Social Security benefits as early as age 60",
    explanation: "If your spouse or ex-spouse (married 10+ years) dies, you may be eligible for monthly survivor benefits based on their earnings record. Widows/widowers can start receiving reduced benefits at age 60, or full benefits at full retirement age. If you're caring for a child under 16, you can receive benefits at any age.",
    common_misconception: "Many divorced spouses don't know they can collect survivor benefits on their ex's record — even if the ex remarried.",
    action_step: "Contact Social Security at 1-800-772-1213 to check your eligibility. Bring the death certificate and your marriage certificate.",
    action_contact: "1-800-772-1213",
    category: "burial_bereavement",
    context_tags: ["death", "spouse", "widow", "widower", "survivor", "monthly", "income"],
    icon: "💜"
  },
  {
    program_id: "va_burial",
    headline: "Veterans can be buried in a national cemetery at no cost to the family",
    explanation: "The VA provides burial in a national cemetery, a headstone or marker, a burial flag, and a Presidential Memorial Certificate — all at no cost. For service-connected deaths, the burial allowance is $2,000+. For non-service-connected deaths, it's $948.",
    common_misconception: "Many families don't realize that even veterans who served during peacetime qualify. If they received an honorable or general discharge, they're eligible.",
    action_step: "Call the VA at 1-800-827-1000 or visit va.gov/burials-memorials to apply. The funeral home can often help with the paperwork.",
    action_contact: "1-800-827-1000",
    category: "burial_bereavement",
    context_tags: ["veteran", "military", "burial", "funeral", "death", "cemetery", "flag"],
    icon: "🎖️"
  },
  {
    program_id: "fema_funeral",
    headline: "FEMA reimburses funeral costs for COVID-19 and disaster deaths",
    explanation: "FEMA's Funeral Assistance program reimburses up to $9,000 per funeral for deaths caused by COVID-19 or other federally declared disasters. This covers burial, cremation, transportation, and related costs.",
    common_misconception: "Many families don't know FEMA covers funeral costs — they think FEMA only helps with property damage from natural disasters.",
    action_step: "Call FEMA's dedicated funeral assistance line at 1-844-684-6333. You'll need a death certificate listing COVID-19 or the disaster as a cause.",
    action_contact: "1-844-684-6333",
    category: "burial_bereavement",
    context_tags: ["funeral", "burial", "covid", "disaster", "death", "cremation", "fema"],
    icon: "🏛️"
  },
  {
    program_id: "state_indigent_burial",
    headline: "Your county may cover burial costs if the family can't afford it",
    explanation: "Most states and counties have indigent burial programs that cover basic burial or cremation costs when a family can't afford it. These programs are rarely advertised, but they exist in nearly every county in America.",
    common_misconception: "People think if they can't afford a funeral, there are no options. County indigent burial programs exist specifically for this situation — but you usually have to ask.",
    action_step: "Call your county coroner's office or county social services department and ask about indigent burial assistance. The funeral home may also know about local programs.",
    action_contact: "Call your county coroner or social services",
    category: "burial_bereavement",
    context_tags: ["funeral", "burial", "can't afford", "cremation", "poor", "no money", "death"],
    icon: "🌿"
  },
  {
    program_id: "victims_funeral",
    headline: "If your loved one was a crime victim, the state may pay for the funeral",
    explanation: "Most states have victim compensation programs that cover funeral and burial expenses for victims of violent crime. Benefits can range from $5,000 to $25,000 depending on the state. This includes homicide, DUI deaths, and other violent crimes.",
    common_misconception: "Families often don't know these programs exist because they're not told about them during the criminal justice process. You don't have to wait for a conviction to apply.",
    action_step: "Contact your state's victim compensation program or call the Victims of Crime helpline. The district attorney's office can also help you apply.",
    action_contact: "1-855-4-VICTIM (1-855-484-2846)",
    category: "burial_bereavement",
    context_tags: ["crime", "victim", "homicide", "murder", "funeral", "burial", "violence"],
    icon: "⚖️"
  },

  // ─── ELDER CARE ───
  {
    program_id: "eldercare_locator",
    headline: "Every county in America has a free aging services office — most people don't know",
    explanation: "Area Agencies on Aging exist in every county and provide free services: meals, transportation, home modifications, caregiver support, legal help, and more. They're funded by the Older Americans Act and serve anyone 60+.",
    common_misconception: "People think elder care services are only for the very poor or very sick. Area Agencies on Aging serve all seniors regardless of income — many services have no eligibility requirements.",
    action_step: "Call the Eldercare Locator at 1-800-677-1116 to find your local Area Agency on Aging. They'll connect you with every service available in your area.",
    action_contact: "1-800-677-1116",
    category: "elder_care",
    context_tags: ["elderly", "senior", "aging", "grandparent", "caregiver", "home_care"],
    icon: "👴"
  },
  {
    program_id: "meals_on_wheels",
    headline: "Meals on Wheels delivers free meals to seniors — no income requirement",
    explanation: "Meals on Wheels delivers nutritious meals directly to the homes of seniors who have difficulty preparing food. In most areas, there's no income requirement — if you're homebound or have difficulty cooking, you qualify.",
    common_misconception: "Many people think Meals on Wheels is only for people who can't afford food. It's actually for anyone who has difficulty preparing meals — including people recovering from surgery or living alone.",
    action_step: "Find your local Meals on Wheels program at MealsOnWheelsAmerica.org or call 1-888-998-6325.",
    action_contact: "1-888-998-6325",
    category: "elder_care",
    context_tags: ["elderly", "senior", "meals", "food", "homebound", "alone", "cooking"],
    icon: "🍲"
  },
  {
    program_id: "adult_protective_services",
    headline: "Adult Protective Services investigates elder abuse — and it's confidential",
    explanation: "If you suspect an elderly or vulnerable adult is being abused, neglected, or financially exploited, APS will investigate. Reports are confidential — the person you're reporting won't know who called.",
    common_misconception: "People worry that calling APS will make things worse or that the person will be taken from their home. APS focuses on keeping people safe in their current living situation whenever possible.",
    action_step: "Call the Eldercare Locator at 1-800-677-1116 to reach your local APS office, or call 9-1-1 if someone is in immediate danger.",
    action_contact: "1-800-677-1116",
    category: "elder_care",
    context_tags: ["abuse", "neglect", "elderly", "senior", "exploitation", "financial", "caregiver"],
    icon: "🛡️"
  },
  {
    program_id: "medicaid_ltc",
    headline: "Medicaid can pay for a home health aide so your loved one can stay home",
    explanation: "Medicaid's long-term care programs don't just cover nursing homes. Many states have Home and Community-Based Services (HCBS) waivers that pay for home health aides, adult day care, and home modifications so people can stay in their own homes.",
    common_misconception: "Most people think Medicaid long-term care means a nursing home. In many states, you can use Medicaid to pay a family member to be your caregiver.",
    action_step: "Contact your state Medicaid office and ask about Home and Community-Based Services (HCBS) waivers. Your local Area Agency on Aging can also help navigate the options.",
    action_contact: "1-800-677-1116",
    category: "elder_care",
    context_tags: ["nursing_home", "home_care", "caregiver", "long_term", "elderly", "disabled", "aide"],
    icon: "🏡"
  },

  // ─── DOMESTIC VIOLENCE ───
  {
    program_id: "dv_hotline",
    headline: "The DV hotline can help you create a safety plan — even if you're not ready to leave",
    explanation: "The National Domestic Violence Hotline provides 24/7 confidential support. They don't just help people leave — they help with safety planning, legal options, housing, and emotional support. You can call, text, or chat online.",
    common_misconception: "People think they have to be ready to leave to call the hotline. You can call just to talk, ask questions, or make a plan — there's no pressure to do anything you're not ready for.",
    action_step: "Call 1-800-799-7233, text START to 88788, or chat at TheHotline.org. It's free, confidential, and available 24/7.",
    action_contact: "1-800-799-7233",
    category: "domestic_violence",
    context_tags: ["abuse", "domestic_violence", "safety", "partner", "spouse", "fear", "control"],
    icon: "💛"
  },
  {
    program_id: "vawa",
    headline: "VAWA protects abuse survivors regardless of immigration status",
    explanation: "The Violence Against Women Act provides legal protections for domestic violence survivors including restraining orders, housing protections, and immigration relief. Undocumented immigrants can self-petition for legal status under VAWA without their abuser's knowledge.",
    common_misconception: "Despite its name, VAWA protects all genders. And critically, it provides a path to legal status for undocumented abuse survivors — many people don't know this exists.",
    action_step: "Call the National DV Hotline at 1-800-799-7233 for confidential help. For immigration-specific VAWA questions, contact a legal aid organization that handles immigration cases.",
    action_contact: "1-800-799-7233",
    category: "domestic_violence",
    context_tags: ["abuse", "immigration", "undocumented", "legal_status", "restraining_order", "protection"],
    icon: "🔒"
  },
  {
    program_id: "crime_victims_comp",
    headline: "Crime victims can get money for medical bills, lost wages, and counseling",
    explanation: "Every state has a victim compensation program that pays for medical expenses, mental health counseling, lost wages, and other costs related to being a victim of violent crime. You don't need to press charges or have a conviction.",
    common_misconception: "Most crime victims never apply for compensation because they don't know it exists. You don't need a conviction — just a police report (and even that can sometimes be waived).",
    action_step: "Contact your state's victim compensation program. The district attorney's office or local victim advocacy center can help you apply.",
    action_contact: "1-855-4-VICTIM (1-855-484-2846)",
    category: "domestic_violence",
    context_tags: ["crime", "victim", "assault", "medical", "counseling", "lost_wages"],
    icon: "⚖️"
  },
  {
    program_id: "sexual_assault_hotline",
    headline: "RAINN provides free, confidential support 24/7 — and can connect you to local help",
    explanation: "The RAINN hotline connects you to a trained staff member from a local sexual assault service provider. They can help with crisis support, safety planning, medical advocacy, and navigating the legal system.",
    action_step: "Call 1-800-656-4673 or chat online at RAINN.org. Everything is confidential.",
    action_contact: "1-800-656-4673",
    category: "domestic_violence",
    context_tags: ["sexual_assault", "rape", "abuse", "trauma", "counseling"],
    icon: "🌸"
  },

  // ─── DISABILITY ───
  {
    program_id: "vocational_rehab",
    headline: "Vocational Rehab pays for job training, education, and assistive technology",
    explanation: "Every state has a Vocational Rehabilitation program that helps people with disabilities prepare for, find, and keep jobs. Services include job training, college tuition, assistive technology, job coaching, and workplace modifications — often at no cost.",
    common_misconception: "People think Vocational Rehab is only for people with physical disabilities. It covers all disabilities including mental health conditions, learning disabilities, and chronic illnesses.",
    action_step: "Find your state's VR agency at rsa.ed.gov or call 2-1-1. Apply even if you're not sure you qualify — eligibility is broader than most people think.",
    action_contact: "https://rsa.ed.gov/about/states",
    category: "disability",
    context_tags: ["disabled", "disability", "job", "work", "training", "education", "assistive"],
    icon: "🎓"
  },

  // ─── VETERANS ───
  {
    program_id: "va_healthcare",
    headline: "VA healthcare covers more veterans than most people realize",
    explanation: "If you served in the active military and were honorably discharged, you may qualify for VA healthcare — including doctor visits, prescriptions, mental health care, and substance abuse treatment. Many veterans with modest incomes qualify for free care.",
    common_misconception: "Veterans often think they need a service-connected disability to get VA healthcare. Many veterans qualify based on income alone, even without a disability rating.",
    action_step: "Apply online at va.gov/health-care/apply or call 1-877-222-8387. Enrollment is open year-round.",
    action_contact: "1-877-222-8387",
    category: "veterans",
    context_tags: ["veteran", "military", "healthcare", "va", "service", "discharge"],
    icon: "🎖️"
  },
  {
    program_id: "veterans_crisis_line",
    headline: "The Veterans Crisis Line is for any veteran in emotional distress — not just suicidal thoughts",
    explanation: "You don't have to be suicidal to call. The Veterans Crisis Line supports veterans experiencing anxiety, depression, grief, relationship problems, or any emotional distress. They also support family members and friends of veterans.",
    action_step: "Call 988 and press 1, text 838255, or chat at VeteransCrisisLine.net. Available 24/7.",
    action_contact: "988 (press 1)",
    category: "veterans",
    context_tags: ["veteran", "crisis", "suicide", "depression", "anxiety", "ptsd", "mental_health"],
    icon: "🫡"
  },

  // ─── CHILDREN & FAMILIES ───
  {
    program_id: "head_start",
    headline: "Head Start provides free preschool, meals, and health screenings",
    explanation: "Head Start is a free early childhood program for children from birth to age 5 in low-income families. It includes education, meals, health and dental screenings, mental health support, and parent involvement activities.",
    common_misconception: "Head Start isn't just daycare — it's a comprehensive program that includes health screenings, dental care, and family support services. Children experiencing homelessness or in foster care are automatically eligible.",
    action_step: "Find a Head Start program near you at eclkc.ohs.acf.hhs.gov/center-locator or call 1-866-763-6481.",
    action_contact: "1-866-763-6481",
    category: "children_families",
    context_tags: ["children", "preschool", "daycare", "education", "toddler", "low_income"],
    icon: "🧒"
  },
  {
    program_id: "child_care_assistance",
    headline: "Child care assistance can cover most or all of your daycare costs",
    explanation: "The Child Care and Development Fund helps low-income families pay for child care so parents can work or attend school. In many states, families pay little to nothing out of pocket. Coverage includes daycare centers, family child care homes, and after-school programs.",
    common_misconception: "Many working parents don't apply because they think they earn too much. Income limits vary by state but are often higher than people expect — a family of 3 earning $40,000+ may still qualify.",
    action_step: "Contact your state's child care assistance program through your local social services office or call 2-1-1.",
    action_contact: "2-1-1",
    category: "children_families",
    context_tags: ["child_care", "daycare", "working", "single_parent", "school", "children"],
    icon: "🏫"
  },

  // ─── TRIBAL & INDIGENOUS ───
  {
    program_id: "bia_assistance",
    headline: "BIA General Assistance provides cash aid for Native Americans not covered by other programs",
    explanation: "The Bureau of Indian Affairs General Assistance program provides cash to meet basic needs — food, clothing, shelter — for eligible Native Americans who don't qualify for or have exhausted other assistance programs.",
    common_misconception: "Many Native Americans don't know BIA General Assistance exists as a separate program from TANF. It's specifically designed to fill gaps that other programs don't cover.",
    action_step: "Contact your tribal social services office or the nearest BIA regional office. Your tribe's enrollment office can help direct you.",
    action_contact: "https://www.bia.gov/regional-offices",
    category: "tribal_indigenous",
    context_tags: ["native", "indigenous", "tribal", "reservation", "bia", "cash", "basic_needs"],
    icon: "🪶"
  },
  {
    program_id: "ihs",
    headline: "Indian Health Service provides free healthcare to tribal members — including dental and mental health",
    explanation: "IHS provides comprehensive healthcare at no cost to members of federally recognized tribes. Services include medical, dental, mental health, substance abuse treatment, and traditional healing practices. You can use IHS facilities even if you live off-reservation.",
    common_misconception: "Many tribal members think IHS is only available on reservations. Urban Indian Health Programs exist in many cities across the country.",
    action_step: "Find your nearest IHS facility at ihs.gov/findhealthcare or call your tribal health department.",
    action_contact: "https://www.ihs.gov/findhealthcare",
    category: "tribal_indigenous",
    context_tags: ["native", "indigenous", "tribal", "healthcare", "dental", "mental_health", "ihs"],
    icon: "🌿"
  },

  // ─── IMMIGRATION ───
  {
    program_id: "vawa_immigration",
    headline: "Abuse survivors can self-petition for immigration status without their abuser knowing",
    explanation: "Under VAWA, immigrants who are abused by a U.S. citizen or permanent resident spouse, parent, or adult child can self-petition for legal status. The abuser is never notified. This also applies to U-visa and T-visa applicants.",
    common_misconception: "Many immigrants stay in abusive situations because they think deportation is the only alternative. VAWA provides a confidential path to legal status that the abuser cannot control or interfere with.",
    action_step: "Call the National DV Hotline at 1-800-799-7233 for confidential help, or contact a legal aid organization that handles immigration-based VAWA cases.",
    action_contact: "1-800-799-7233",
    category: "immigration",
    context_tags: ["immigration", "abuse", "undocumented", "visa", "legal_status", "deportation"],
    icon: "🗽"
  },

  // ─── LEGAL AID ───
  {
    program_id: "legal_aid",
    headline: "Free lawyers exist — and they handle more than just criminal cases",
    explanation: "Legal Aid organizations provide free legal help to people who can't afford a lawyer. They handle housing, family law, immigration, benefits, consumer protection, and more. You don't have to be in a criminal case to get free legal help.",
    common_misconception: "People think free lawyers are only public defenders for criminal cases. Legal Aid handles civil cases — evictions, custody, benefits denials, immigration — that affect people's daily lives.",
    action_step: "Find your local Legal Aid at LawHelp.org or call your state bar association's lawyer referral service.",
    action_contact: "https://www.lawhelp.org",
    category: "legal_aid",
    context_tags: ["lawyer", "legal", "court", "eviction", "custody", "immigration", "benefits"],
    icon: "⚖️"
  },

  // ─── CRISIS HOTLINES ───
  {
    program_id: "suicide_lifeline",
    headline: "988 isn't just for suicide — it's for any mental health crisis",
    explanation: "The 988 Suicide and Crisis Lifeline provides free, confidential support for anyone in emotional distress. You don't have to be suicidal — anxiety attacks, grief, overwhelming stress, and substance use crises all count. They also have a Spanish-language line and options for deaf/hard of hearing.",
    common_misconception: "Many people think 988 is only for people about to attempt suicide. It's for anyone having a hard time — you can call just to talk.",
    action_step: "Call or text 988. Available 24/7, free, and confidential.",
    action_contact: "988",
    category: "crisis_hotline",
    context_tags: ["suicide", "crisis", "mental_health", "depression", "anxiety", "overwhelmed"],
    icon: "💚"
  },
  {
    program_id: "211_helpline",
    headline: "2-1-1 connects you to every local resource in your area — with one call",
    explanation: "Dial 2-1-1 to reach a trained specialist who knows every resource in your community: food banks, shelters, utility assistance, healthcare, child care, job training, and more. It's like a GPS for social services.",
    common_misconception: "Most people have never heard of 2-1-1. It covers 94% of the U.S. population and handles over 16 million calls per year. It's the single most underused resource in America.",
    action_step: "Dial 2-1-1 from any phone, or visit 211.org to search online. Available 24/7 in most areas.",
    action_contact: "2-1-1",
    category: "crisis_hotline",
    context_tags: ["help", "resources", "local", "food", "housing", "utilities", "anything"],
    icon: "📞"
  },

  // ─── LGBTQ+ COMMUNITY ───
  {
    program_id: "trevor_project",
    headline: "The Trevor Project provides 24/7 crisis support for LGBTQ+ youth",
    explanation: "If you're a young person who is LGBTQ+ and struggling — whether it's about identity, bullying, family rejection, or anything else — The Trevor Project is there 24/7. Trained counselors understand what you're going through because they specialize in LGBTQ+ youth.",
    common_misconception: "You don't have to be suicidal to reach out. The Trevor Project helps with any emotional distress — coming out anxiety, bullying, family conflict, depression, or just needing someone who gets it.",
    action_step: "Call 1-866-488-7386, text START to 678-678, or chat at TheTrevorProject.org. Available 24/7.",
    action_contact: "1-866-488-7386",
    category: "lgbtq",
    context_tags: ["lgbtq", "gay", "lesbian", "transgender", "bisexual", "queer", "youth", "coming_out", "bullying"],
    icon: "🏳️‍🌈"
  },
  {
    program_id: "trans_lifeline",
    headline: "Trans Lifeline is staffed entirely by trans people — they understand",
    explanation: "Trans Lifeline is the only crisis hotline in the U.S. staffed entirely by transgender people. They provide peer support for trans people in crisis, including help with name changes, ID updates, and navigating healthcare. They will never contact police without your consent.",
    common_misconception: "Many trans people avoid crisis lines because they've had bad experiences with counselors who don't understand. Trans Lifeline was created specifically to solve this problem.",
    action_step: "Call 877-565-8860 (English) or 877-330-6366 (Spanish). They also have a microgrants program for name and gender marker changes.",
    action_contact: "877-565-8860",
    category: "lgbtq",
    context_tags: ["transgender", "trans", "nonbinary", "gender", "transition", "name_change", "crisis"],
    icon: "🏳️‍⚧️"
  },
  {
    program_id: "lambda_legal",
    headline: "Lambda Legal fights discrimination against LGBTQ+ people — for free",
    explanation: "Lambda Legal is the oldest and largest national legal organization fighting for the civil rights of LGBTQ+ people and those living with HIV. They take cases involving discrimination in employment, housing, healthcare, education, and the military — at no cost to the client.",
    action_step: "Contact Lambda Legal's Help Desk at 1-866-542-8336 or submit your case at lambdalegal.org/helpdesk.",
    action_contact: "1-866-542-8336",
    category: "lgbtq",
    context_tags: ["lgbtq", "discrimination", "legal", "employment", "housing", "hiv", "rights"],
    icon: "⚖️"
  },

  // ─── COMMUNITY NAVIGATION ───
  {
    program_id: "call_211",
    headline: "2-1-1 connects you to every local resource in your area — with one call",
    explanation: "Dial 2-1-1 to reach a trained specialist who knows every resource in your community: food banks, shelters, utility assistance, healthcare, child care, job training, and more. It's like a GPS for social services.",
    common_misconception: "Most people have never heard of 2-1-1. It covers 94% of the U.S. population and handles over 16 million calls per year. It's the single most underused resource in America.",
    action_step: "Dial 2-1-1 from any phone, or visit 211.org to search online. Available 24/7 in most areas.",
    action_contact: "2-1-1",
    category: "community_navigation",
    context_tags: ["help", "resources", "local", "food", "housing", "utilities", "anything"],
    icon: "📞"
  },
  {
    program_id: "findhelp",
    headline: "FindHelp.org searches every social service program near you by ZIP code",
    explanation: "FindHelp.org (formerly Aunt Bertha) is a free search engine for social services. Enter your ZIP code and it shows every program available in your area — food, housing, healthcare, transportation, job training, and more. It's like Google Maps for government and nonprofit help.",
    action_step: "Visit FindHelp.org and enter your ZIP code. Filter by category to find exactly what you need.",
    action_contact: "https://www.findhelp.org",
    category: "community_navigation",
    context_tags: ["help", "resources", "local", "search", "zip_code", "programs", "services"],
    icon: "🧭"
  },
  {
    program_id: "benefits_gov",
    headline: "Benefits.gov tells you every federal benefit you qualify for in 10 minutes",
    explanation: "Benefits.gov is the official U.S. government site that screens you for over 1,000 federal benefit programs. Answer a few questions about your situation and it generates a personalized list of programs you may be eligible for — with direct links to apply.",
    action_step: "Visit Benefits.gov and use the Benefit Finder tool. It takes about 10 minutes and covers every federal program.",
    action_contact: "https://www.benefits.gov",
    category: "community_navigation",
    context_tags: ["benefits", "government", "federal", "eligibility", "screening", "programs"],
    icon: "🏛️"
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOVERY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get all spotlights.
 */
export function getAllSpotlights(): DiscoverySpotlight[] {
  return SPOTLIGHTS;
}

/**
 * Get spotlights by category.
 */
export function getSpotlightsByCategory(category: BenefitCategory): DiscoverySpotlight[] {
  return SPOTLIGHTS.filter(s => s.category === category);
}

/**
 * Get a single random spotlight — the "Did You Know?" of the day.
 * Uses a date-based seed so everyone sees the same one on the same day,
 * but it changes daily.
 */
export function getDailySpotlight(dateStr?: string): DiscoveryFeed {
  const date = dateStr || new Date().toISOString().split("T")[0];
  const seed = hashString(date);
  const index = seed % SPOTLIGHTS.length;
  const spotlight = SPOTLIGHTS[index];
  const program = BENEFIT_PROGRAMS.find(p => p.id === spotlight.program_id);

  return {
    spotlight,
    program: program || createFallbackProgram(spotlight),
    selection_reason: "Daily spotlight",
  };
}

/**
 * Get a random spotlight from a specific category.
 */
export function getCategorySpotlight(category: BenefitCategory, dateStr?: string): DiscoveryFeed | null {
  const categorySpotlights = getSpotlightsByCategory(category);
  if (categorySpotlights.length === 0) return null;

  const date = dateStr || new Date().toISOString().split("T")[0];
  const seed = hashString(date + category);
  const index = seed % categorySpotlights.length;
  const spotlight = categorySpotlights[index];
  const program = BENEFIT_PROGRAMS.find(p => p.id === spotlight.program_id);

  return {
    spotlight,
    program: program || createFallbackProgram(spotlight),
    selection_reason: `Daily ${category} spotlight`,
  };
}

/**
 * Get contextual spotlights based on the user's situation.
 * Matches spotlight context_tags against the user's text and pipeline info.
 */
export function getContextualSpotlights(input: {
  situation_text?: string;
  pipeline_id?: string;
  pipeline_category?: string;
  limit?: number;
}): DiscoveryFeed[] {
  const limit = input.limit || 3;
  const text = (input.situation_text || "").toLowerCase();
  const words = text.split(/\s+/);

  // Score each spotlight by how many context_tags match the user's text
  const scored = SPOTLIGHTS.map(spotlight => {
    let score = 0;
    const matchReasons: string[] = [];

    // Tag matching against text
    for (const tag of spotlight.context_tags) {
      const tagWords = tag.split("_");
      if (tagWords.some(tw => words.some(w => w.includes(tw)))) {
        score += 2;
        matchReasons.push(`Matches "${tag}"`);
      }
    }

    // Pipeline category matching
    if (input.pipeline_category) {
      const program = BENEFIT_PROGRAMS.find(p => p.id === spotlight.program_id);
      if (program && program.pipeline_categories.includes(input.pipeline_category)) {
        score += 3;
        matchReasons.push("Relevant to your case type");
      }
    }

    // Pipeline ID matching
    if (input.pipeline_id) {
      const program = BENEFIT_PROGRAMS.find(p => p.id === spotlight.program_id);
      if (program && program.pipeline_ids.includes(input.pipeline_id)) {
        score += 5;
        matchReasons.push("Directly related to your case");
      }
    }

    return { spotlight, score, matchReasons };
  })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(s => {
    const program = BENEFIT_PROGRAMS.find(p => p.id === s.spotlight.program_id);
    return {
      spotlight: s.spotlight,
      program: program || createFallbackProgram(s.spotlight),
      selection_reason: s.matchReasons.join("; "),
    };
  });
}

/**
 * Generate a shareable text for a spotlight.
 */
export function generateShareText(spotlight: DiscoverySpotlight): string {
  const program = BENEFIT_PROGRAMS.find(p => p.id === spotlight.program_id);
  let text = `Did you know? ${spotlight.headline}\n\n${spotlight.explanation}`;
  if (spotlight.action_step) {
    text += `\n\n${spotlight.action_step}`;
  }
  if (spotlight.action_contact) {
    text += `\n\nContact: ${spotlight.action_contact}`;
  }
  text += `\n\n— Shared via Luminari Benefits Navigator`;
  return text;
}

/**
 * Get all available categories with their spotlight counts.
 */
export function getDiscoveryCategories(): Array<{ category: BenefitCategory; label: string; count: number; icon: string }> {
  const categoryLabels: Record<BenefitCategory, string> = {
    food: "Food Assistance",
    healthcare: "Healthcare",
    housing: "Housing",
    utilities: "Utilities & Communications",
    cash_assistance: "Cash Assistance & Income",
    burial_bereavement: "Burial & Bereavement",
    elder_care: "Elder Care",
    domestic_violence: "Domestic Violence & Safety",
    disability: "Disability Services",
    veterans: "Veterans Services",
    children_families: "Children & Families",
    tribal_indigenous: "Tribal & Indigenous",
    immigration: "Immigration",
    legal_aid: "Legal Aid",
    lgbtq: "LGBTQ+ Community",
    community_navigation: "Community Navigation",
    crisis_hotline: "Crisis Hotlines",
  };

  const categoryIcons: Record<BenefitCategory, string> = {
    food: "🍎",
    healthcare: "🏥",
    housing: "🏠",
    utilities: "🔥",
    cash_assistance: "💵",
    burial_bereavement: "🕊️",
    elder_care: "👴",
    domestic_violence: "💛",
    disability: "🎓",
    veterans: "🎖️",
    children_families: "🧒",
    tribal_indigenous: "🪶",
    immigration: "🗽",
    legal_aid: "⚖️",
    lgbtq: "🏳️‍🌈",
    community_navigation: "🧭",
    crisis_hotline: "📞",
  };

  const categories = Object.keys(categoryLabels) as BenefitCategory[];
  return categories
    .map(cat => ({
      category: cat,
      label: categoryLabels[cat],
      count: SPOTLIGHTS.filter(s => s.category === cat).length,
      icon: categoryIcons[cat],
    }))
    .filter(c => c.count > 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function createFallbackProgram(spotlight: DiscoverySpotlight): BenefitProgram {
  return {
    id: spotlight.program_id,
    name: spotlight.program_id,
    short_name: spotlight.program_id,
    category: spotlight.category,
    description: spotlight.explanation,
    what_it_does: spotlight.explanation,
    who_qualifies: "Check eligibility requirements",
    how_to_apply: [spotlight.action_step],
    documents_needed: [],
    urgency: "when_ready",
    situation_signals: spotlight.context_tags,
    pipeline_categories: [],
    pipeline_ids: [],
    life_events: [],
    availability: "nationwide",
  };
}
