import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Brain, Shield, Heart, FileText, Users,
  AlertTriangle, Clock, Phone, ExternalLink, ChevronDown,
  ChevronUp, Scale, Lock, Search, Sparkles,
  ArrowRight, BookOpen, Volume2, VolumeX, Printer,
  CheckCircle2, XCircle, Info, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ─── Types ─── */

interface Pipeline {
  id: string;
  title: string;
  voice: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  whatWeExamine: string[];
  yourRights: string[];
  keyStatutes: { name: string; citation: string; summary: string }[];
  actionSteps: string[];
}

interface HoldLaw {
  state: string;
  name: string;
  statute: string;
  duration: string;
  standard: string;
}

/* ─── Pipeline Data ─── */

const PIPELINES: Pipeline[] = [
  {
    id: "involuntary_hold",
    title: "Involuntary Hold",
    voice: "I believe you. You were there. Let's look at what they actually did — starting with whether the hold was legal.",
    description: "For anyone who was placed on a psychiatric hold and never understood why, whether it was legal, or what their rights were during it.",
    icon: Lock,
    color: "text-sky-400",
    bgColor: "bg-sky-500/10 border-sky-500/20",
    whatWeExamine: [
      "Was the initial hold legally authorized? Who signed the order?",
      "Did the hold exceed the statutory time limit without a court hearing?",
      "Were you given written notice of your rights at admission?",
      "Was a physician certification completed within the required timeframe?",
      "Were you offered the opportunity to contact an attorney?",
      "Was a hearing held before the hold was extended? Were you present?",
      "Were you informed of your right to an independent psychiatric evaluation?",
    ],
    yourRights: [
      "Right to know why you are being held and under what legal authority",
      "Right to a hearing before the hold can be extended beyond the initial period",
      "Right to an attorney at the hearing — appointed if you cannot afford one",
      "Right to present evidence and call witnesses at the hearing",
      "Right to an independent psychiatric evaluation",
      "Right to communicate with persons outside the facility",
      "Right to receive and send mail without censorship",
      "Right to refuse treatment (with limited exceptions requiring court order)",
    ],
    keyStatutes: [
      { name: "Due Process Clause", citation: "U.S. Const. amend. XIV", summary: "No state shall deprive any person of liberty without due process of law. Involuntary psychiatric commitment is a massive deprivation of liberty." },
      { name: "O'Connor v. Donaldson", citation: "422 U.S. 563 (1975)", summary: "A state cannot constitutionally confine a non-dangerous individual who is capable of surviving safely in freedom." },
      { name: "Addington v. Texas", citation: "441 U.S. 418 (1979)", summary: "The standard of proof for involuntary commitment must be at least 'clear and convincing evidence' — not merely preponderance." },
      { name: "Zinermon v. Burch", citation: "494 U.S. 113 (1990)", summary: "A person who is mentally ill cannot give 'voluntary' consent to admission if they lack the capacity to understand what they are consenting to." },
    ],
    actionSteps: [
      "Request your complete admission records including the hold order",
      "Document the timeline: when were you brought in, when were you told why, when was a hearing held",
      "Contact your state's Protection & Advocacy organization — they have legal authority to investigate",
      "File a complaint with the facility's patient advocate",
      "If the hold exceeded the statutory limit without a hearing, consult an attorney about a civil rights claim",
    ],
  },
  {
    id: "polypharmacy_harm",
    title: "Polypharmacy Harm",
    voice: "I believe you. No one should have to track that many medications alone. Let's look at what was prescribed, when, and whether anyone checked the interactions.",
    description: "For anyone who was prescribed so many medications simultaneously that no human being could track the interactions — and was harmed by it.",
    icon: AlertTriangle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    whatWeExamine: [
      "How many psychotropic medications were prescribed simultaneously?",
      "Were drug interaction checks documented before each new prescription?",
      "Were you informed of the risks and side effects of each medication?",
      "Was informed consent obtained for each medication — especially antipsychotics?",
      "Were your medications reviewed regularly by a psychiatrist (not just renewed)?",
      "Were adverse effects documented and addressed when you reported them?",
      "Were black box warnings discussed with you before prescribing?",
    ],
    yourRights: [
      "Right to informed consent before any medication is administered",
      "Right to know the name, purpose, risks, and alternatives for each medication",
      "Right to refuse medication (except in documented emergencies with court order)",
      "Right to a second opinion on your medication regimen",
      "Right to have your medication reviewed by a pharmacist for interactions",
      "Right to report adverse effects and have them taken seriously",
      "Right to access your complete medication administration records",
    ],
    keyStatutes: [
      { name: "Washington v. Harper", citation: "494 U.S. 210 (1990)", summary: "Prisoners (and by extension, involuntary patients) have a significant liberty interest in avoiding unwanted administration of antipsychotic drugs." },
      { name: "Sell v. United States", citation: "539 U.S. 166 (2003)", summary: "Involuntary medication requires the government to show it is medically appropriate and substantially unlikely to have side effects that undermine the purpose." },
      { name: "CMS Conditions of Participation", citation: "42 CFR § 482.13", summary: "Hospitals must ensure patients are informed about and participate in their care, including medication decisions." },
      { name: "Joint Commission Standards", citation: "MM.04.01.01", summary: "Facilities must monitor patients for adverse drug reactions and medication errors." },
    ],
    actionSteps: [
      "Request your complete Medication Administration Record (MAR) for the entire stay",
      "Document every medication you were given, the dosage, and when it started/stopped",
      "Note any side effects you experienced and whether staff responded",
      "Contact a pharmacist to review the combination for dangerous interactions",
      "File a complaint with your state medical board if informed consent was not obtained",
    ],
  },
  {
    id: "discharge_failure",
    title: "Discharge Without Plan",
    voice: "I believe you. Being discharged without a plan isn't just a gap in care — it may be a violation. Let's document what happened and what didn't.",
    description: "For anyone who was released from a psychiatric facility with no plan, no follow-up, and no explanation of what comes next.",
    icon: XCircle,
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    whatWeExamine: [
      "Were you given a written discharge plan before leaving?",
      "Did the plan include follow-up appointments, medication instructions, and crisis contacts?",
      "Were you discharged during safe hours with transportation arranged?",
      "Was your family or support person notified of your discharge (with your consent)?",
      "Were you given at least a 7-day supply of medications?",
      "Were community mental health referrals provided?",
      "Were you informed of how to access your records after discharge?",
    ],
    yourRights: [
      "Right to a written discharge plan before leaving the facility",
      "Right to participate in discharge planning",
      "Right to have your family or support person involved in discharge planning (with your consent)",
      "Right to adequate medication supply upon discharge",
      "Right to referrals for follow-up care",
      "Right to be discharged during reasonable hours with safe transportation",
      "Right to appeal a premature discharge if you feel you are not ready",
    ],
    keyStatutes: [
      { name: "CMS Discharge Planning Requirements", citation: "42 CFR § 482.43", summary: "Hospitals must have a discharge planning process that applies to all patients. The plan must be developed with the patient." },
      { name: "EMTALA Stabilization Requirement", citation: "42 U.S.C. § 1395dd", summary: "A hospital cannot discharge a patient with an emergency medical condition (including psychiatric) until the condition is stabilized." },
      { name: "Mental Health Parity Act", citation: "29 U.S.C. § 1185a", summary: "Insurance cannot impose more restrictive limitations on mental health benefits than on medical/surgical benefits — including discharge criteria." },
    ],
    actionSteps: [
      "Document exactly what you were given (or not given) at discharge",
      "Request a copy of your discharge summary from the facility",
      "If you were discharged without medications, document the gap and any resulting crisis",
      "File a complaint with your state health department",
      "Contact CMS if the facility receives Medicare/Medicaid funding",
    ],
  },
  {
    id: "family_exclusion",
    title: "Family Shut Out",
    voice: "I believe you. Watching someone you love disappear into the system with no information is its own kind of harm. Let's look at what they were required to tell you.",
    description: "For families who watched someone they love disappear into psychosis and had no tools, no rights, and no roadmap.",
    icon: Users,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
    whatWeExamine: [
      "Did the facility inform you of your rights as a family member?",
      "Was a HIPAA authorization discussed and offered to the patient?",
      "Were you included in treatment planning (with patient consent)?",
      "Were you given information about the patient's diagnosis and treatment?",
      "Were you offered family psychoeducation or support resources?",
      "Were you informed of the discharge plan and follow-up needs?",
      "Were you told how to initiate commitment proceedings if the person was in danger?",
    ],
    yourRights: [
      "Right to receive general information about the facility and its policies",
      "Right to be informed of how to initiate emergency commitment proceedings",
      "Right to participate in treatment planning IF the patient consents or a court authorizes it",
      "Right to file a complaint about the facility's care",
      "Right to contact the Protection & Advocacy organization on behalf of your family member",
      "Right to information about NAMI Family-to-Family and other support programs",
      "Right to petition the court for guardianship if the person cannot make decisions",
    ],
    keyStatutes: [
      { name: "HIPAA Privacy Rule", citation: "45 CFR § 164.510(b)", summary: "A provider MAY share information with family members involved in care if the patient agrees, or if the provider determines it is in the patient's best interest and the patient does not object." },
      { name: "42 CFR Part 2", citation: "Substance Use Disorder Records", summary: "Substance use disorder treatment records have additional protections beyond HIPAA. Written consent is required for most disclosures." },
      { name: "State Commitment Statutes", citation: "Varies by state", summary: "Every state has a process for family members to petition for involuntary evaluation. The specific process, who can petition, and the standard of proof varies." },
    ],
    actionSteps: [
      "Ask the facility for their family information policy in writing",
      "Request that the patient sign a HIPAA authorization naming you as an authorized contact",
      "Contact NAMI (1-800-950-NAMI) for Family-to-Family support and education",
      "Learn your state's emergency petition process before a crisis occurs",
      "Document every interaction with the facility — dates, names, what was said",
    ],
  },
  {
    id: "restraint_seclusion",
    title: "Restraint & Seclusion",
    voice: "I believe you. What happened to you has strict legal limits. Let's look at whether those limits were followed.",
    description: "For anyone who experienced restraint, seclusion, or forced injection and has nowhere to put that story.",
    icon: Shield,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10 border-rose-500/20",
    whatWeExamine: [
      "Was a physician order obtained within 1 hour of the restraint/seclusion?",
      "Was a face-to-face evaluation conducted within 1 hour?",
      "Was continuous monitoring documented throughout the episode?",
      "Did the restraint exceed the maximum time limit (4 hours for adults)?",
      "Was the restraint used as punishment, convenience, or retaliation?",
      "Were you injured during the restraint? Was the injury documented?",
      "Were less restrictive alternatives attempted and documented first?",
      "Were you debriefed after the episode?",
    ],
    yourRights: [
      "Right to be free from restraint and seclusion except to protect you from immediate harm",
      "Right to have a physician order within 1 hour",
      "Right to a face-to-face evaluation within 1 hour",
      "Right to continuous monitoring during any restraint or seclusion",
      "Right to have the restraint removed as soon as the immediate danger passes",
      "Right to be free from restraint used as punishment, discipline, or staff convenience",
      "Right to have injuries documented and treated",
      "Right to a debriefing after the episode",
    ],
    keyStatutes: [
      { name: "Federal Restraint & Seclusion Rule", citation: "42 CFR § 482.13(e)-(f)", summary: "Restraint and seclusion may only be used when less restrictive interventions have been determined to be ineffective to protect the patient or others from harm. Never as punishment." },
      { name: "Children's Health Act of 2000", citation: "42 U.S.C. § 290jj", summary: "Prohibits the use of restraint or seclusion in residential facilities for children unless there is an imminent risk of physical harm. Staff must be trained." },
      { name: "CMS Interpretive Guidelines", citation: "State Operations Manual, Appendix A", summary: "Detailed federal guidance on restraint/seclusion requirements including time limits, monitoring, and documentation standards." },
      { name: "Youngberg v. Romeo", citation: "457 U.S. 307 (1982)", summary: "Involuntarily committed persons have constitutionally protected liberty interests in safety and freedom from unreasonable bodily restraints." },
    ],
    actionSteps: [
      "Request your complete restraint/seclusion logs for every episode",
      "Document the timeline: what happened before, during, and after",
      "Note whether you were injured and whether the injury was documented",
      "File a complaint with your state's Protection & Advocacy organization — they have authority to investigate",
      "If restraint was used as punishment, file a complaint with CMS and the state health department",
      "Preserve any photographs of injuries",
    ],
  },
  {
    id: "record_correction",
    title: "Record Correction",
    voice: "I believe you. Your records should reflect what actually happened, not what someone decided to write. Let's get them corrected.",
    description: "For anyone who is now out — and needs their record corrected, their voice restored, and their experience documented before it disappears.",
    icon: FileText,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    whatWeExamine: [
      "Are there inaccuracies in your diagnosis or treatment records?",
      "Were events described differently than how they actually occurred?",
      "Were restraint or seclusion episodes omitted or minimized?",
      "Were your complaints or grievances documented?",
      "Were medication side effects you reported included in the record?",
      "Does the record contain information that could harm you in future proceedings?",
      "Were records altered or backdated?",
    ],
    yourRights: [
      "Right to access your complete medical record (HIPAA § 164.524)",
      "Right to request amendments to inaccurate or incomplete records (HIPAA § 164.526)",
      "Right to receive a response to your amendment request within 60 days",
      "Right to have your amendment request and the facility's response included in your record even if denied",
      "Right to file a complaint with HHS Office for Civil Rights if access is denied",
      "Right to an accounting of disclosures — who has seen your records",
      "Right to restrict certain disclosures of your health information",
    ],
    keyStatutes: [
      { name: "HIPAA Right of Access", citation: "45 CFR § 164.524", summary: "You have the right to inspect and obtain a copy of your health information. The facility must respond within 30 days." },
      { name: "HIPAA Right to Amend", citation: "45 CFR § 164.526", summary: "You have the right to request amendments to your health information if you believe it is inaccurate or incomplete." },
      { name: "HIPAA Accounting of Disclosures", citation: "45 CFR § 164.528", summary: "You have the right to know who has accessed your health information and for what purpose." },
      { name: "Psychotherapy Notes Protection", citation: "45 CFR § 164.508(a)(2)", summary: "Psychotherapy notes have additional protections and generally cannot be disclosed without your specific authorization." },
    ],
    actionSteps: [
      "Request your complete medical record in writing (the facility has 30 days to respond)",
      "Review every page — note inaccuracies, omissions, and discrepancies",
      "Submit a written amendment request citing specific errors and providing correct information",
      "Keep copies of everything you submit",
      "If the facility denies your amendment, their denial and your request must still be included in your record",
      "File a complaint with HHS OCR at hhs.gov/ocr if your rights are violated",
    ],
  },
];

/* ─── State Hold Laws (key examples) ─── */

const HOLD_LAWS: HoldLaw[] = [
  { state: "CA", name: "5150 Hold", statute: "Cal. Welf. & Inst. Code § 5150", duration: "72 hours", standard: "Danger to self/others or gravely disabled" },
  { state: "FL", name: "Baker Act", statute: "Fla. Stat. § 394.463", duration: "72 hours", standard: "Danger to self/others or self-neglect" },
  { state: "NY", name: "Emergency Admission", statute: "NY Mental Hyg. Law § 9.39", duration: "48 hours", standard: "Danger to self/others" },
  { state: "TX", name: "Emergency Detention", statute: "Tex. Health & Safety Code § 573.001", duration: "48 hours", standard: "Danger to self/others" },
  { state: "PA", name: "Section 302", statute: "50 P.S. § 7302", duration: "120 hours", standard: "Clear and present danger" },
  { state: "MA", name: "Section 12", statute: "M.G.L. c. 123 § 12", duration: "72 hours", standard: "Likelihood of serious harm" },
  { state: "IL", name: "Emergency Admission", statute: "405 ILCS 5/3-600", duration: "24 hours", standard: "Danger to self/others" },
  { state: "MO", name: "96-Hour Hold", statute: "Mo. Rev. Stat. § 632.305", duration: "96 hours", standard: "Danger to self/others" },
  { state: "WA", name: "ITA 72-Hour Hold", statute: "RCW § 71.05.150", duration: "72 hours", standard: "Danger to self/others or gravely disabled" },
  { state: "MD", name: "Emergency Petition", statute: "Md. Code Health-Gen. § 10-622", duration: "30 hours", standard: "Danger to self/others" },
  { state: "OH", name: "Emergency Admission", statute: "ORC § 5122.10", duration: "72 hours", standard: "Danger to self/others" },
  { state: "CO", name: "72-Hour Hold", statute: "C.R.S. § 27-65-105", duration: "72 hours", standard: "Imminent danger to self/others" },
  { state: "VA", name: "Emergency Custody Order", statute: "Va. Code § 37.2-808", duration: "72 hours", standard: "Danger to self/others" },
  { state: "GA", name: "Emergency Evaluation", statute: "O.C.G.A. § 37-3-41", duration: "48 hours", standard: "Danger to self/others" },
  { state: "NC", name: "Involuntary Commitment", statute: "N.C.G.S. § 122C-261", duration: "24 hours", standard: "Danger to self/others" },
  { state: "MI", name: "Emergency Admission", statute: "MCL § 330.1427", duration: "24 hours", standard: "Danger to self/others" },
  { state: "NJ", name: "Screening Certificate", statute: "N.J.S.A. § 30:4-27.2", duration: "72 hours", standard: "Danger to self/others" },
  { state: "OR", name: "Emergency Hold", statute: "ORS § 426.232", duration: "48 hours", standard: "Danger to self/others" },
  { state: "MN", name: "72-Hour Hold", statute: "Minn. Stat. § 253B.05", duration: "72 hours", standard: "Danger to self/others or gravely disabled" },
  { state: "AZ", name: "Emergency Admission", statute: "A.R.S. § 36-524", duration: "72 hours", standard: "Danger to self/others" },
];

/* ─── Crisis Resources ─── */

const CRISIS_RESOURCES = [
  { name: "988 Suicide & Crisis Lifeline", contact: "Call or text 988", description: "24/7 free, confidential crisis support", url: "https://988lifeline.org" },
  { name: "Crisis Text Line", contact: "Text HOME to 741741", description: "24/7 text-based crisis support", url: "https://www.crisistextline.org" },
  { name: "NAMI HelpLine", contact: "1-800-950-NAMI (6264)", description: "Peer support, education, and advocacy", url: "https://nami.org" },
  { name: "SAMHSA National Helpline", contact: "1-800-662-HELP (4357)", description: "Treatment referrals and information", url: "https://findtreatment.gov" },
  { name: "National Domestic Violence Hotline", contact: "1-800-799-7233", description: "For those experiencing abuse in care settings", url: "https://www.thehotline.org" },
];

/* ─── Pipeline Detail Card ─── */

function PipelineDetail({ pipeline, isExpanded, onToggle }: {
  pipeline: Pipeline;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [, setLocation] = useLocation();
  const Icon = pipeline.icon;

  return (
    <Card className={cn("transition-all duration-300 border", pipeline.bgColor, isExpanded && "ring-1 ring-primary/20")}>
      <button onClick={onToggle} className="w-full text-left">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-4">
            <div className={cn("p-3 rounded-xl border", pipeline.bgColor)}>
              <Icon className={cn("h-6 w-6", pipeline.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg flex items-center gap-2">
                {pipeline.title}
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1 italic">
                "{pipeline.voice}"
              </p>
            </div>
          </div>
        </CardHeader>
      </button>

      {isExpanded && (
        <CardContent className="pt-0 space-y-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {pipeline.description}
          </p>

          {/* What We Examine */}
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Search className="h-4 w-4 text-primary" />
              What We Examine
            </h4>
            <ul className="space-y-2">
              {pipeline.whatWeExamine.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-0.5 shrink-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Your Rights */}
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Scale className="h-4 w-4 text-emerald-400" />
              Your Rights
            </h4>
            <ul className="space-y-2">
              {pipeline.yourRights.map((right, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  {right}
                </li>
              ))}
            </ul>
          </div>

          {/* Key Statutes */}
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-amber-400" />
              Key Legal Authority
            </h4>
            <div className="space-y-3">
              {pipeline.keyStatutes.map((statute, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{statute.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{statute.citation}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{statute.summary}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Action Steps */}
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <ArrowRight className="h-4 w-4 text-primary" />
              What You Can Do Right Now
            </h4>
            <ol className="space-y-2">
              {pipeline.actionSteps.map((step, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-3">
                  <span className="text-xs font-bold text-primary bg-primary/10 rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Start a Case */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => setLocation(`/intake?situation=${encodeURIComponent(pipeline.voice)}&pipeline=${encodeURIComponent(pipeline.id)}`)}
              className="flex-1"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Start a Case for This
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                window.print();
                toast.success("Print dialog opened");
              }}
            >
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Main Component ─── */

export default function MentalHealth() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [expandedPipeline, setExpandedPipeline] = useState<string | null>(null);
  const [holdSearch, setHoldSearch] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Filter hold laws by search
  const filteredHoldLaws = useMemo(() => {
    if (!holdSearch) return HOLD_LAWS;
    const q = holdSearch.toLowerCase();
    return HOLD_LAWS.filter(h =>
      h.state.toLowerCase().includes(q) ||
      h.name.toLowerCase().includes(q) ||
      h.statute.toLowerCase().includes(q)
    );
  }, [holdSearch]);

  // Read-aloud
  const speakText = (text: string) => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.onend = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const overviewText = `This is the Mental Health System module. It exists for people who went into the system seeking help and came out without justice, without answers, and without anyone who documented what really happened to them. The voice of this module is not clinical. It does not lead with law. It leads with: I believe you. You were there. Let's look at what they actually did.`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-gradient-to-b from-sky-500/5 to-transparent">
        <div className="container max-w-5xl py-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/legal-library")}
            className="mb-4 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Legal Library
          </Button>

          <div className="flex items-start gap-4">
            <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20">
              <Brain className="h-8 w-8 text-sky-400" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Mental Health System
              </h1>
              <p className="text-muted-foreground mt-2 text-lg leading-relaxed max-w-2xl">
                For people who went into the system seeking help and came out without justice, without answers, and without anyone who documented what really happened to them.
              </p>
              <div className="flex items-center gap-3 mt-4">
                <Badge variant="outline" className="text-sky-400 border-sky-500/30">
                  <Brain className="h-3 w-3 mr-1" />
                  6 Pipelines
                </Badge>
                <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                  <Scale className="h-3 w-3 mr-1" />
                  56 Jurisdictions
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => speakText(overviewText)}
                  className="text-muted-foreground"
                >
                  {isSpeaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-5xl py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-8 w-full justify-start">
            <TabsTrigger value="overview">The Voice</TabsTrigger>
            <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
            <TabsTrigger value="hold-laws">Hold Laws by State</TabsTrigger>
            <TabsTrigger value="crisis">Crisis Resources</TabsTrigger>
          </TabsList>

          {/* ─── Overview / The Voice ─── */}
          <TabsContent value="overview" className="space-y-8">
            {/* The Voice */}
            <Card className="border-sky-500/20 bg-sky-500/5">
              <CardContent className="pt-6">
                <div className="max-w-3xl mx-auto text-center space-y-6">
                  <p className="text-lg text-muted-foreground leading-relaxed italic">
                    "The voice of this pipeline is not clinical. It does not lead with law."
                  </p>
                  <p className="text-lg text-muted-foreground leading-relaxed italic">
                    "It leads with —"
                  </p>
                  <p className="text-2xl font-semibold text-sky-400 leading-relaxed">
                    I believe you. You were there. Let's look at what they actually did.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Who This Is For */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">This module holds space for:</h2>
              <div className="grid gap-3">
                {[
                  "A person who was placed on an involuntary psychiatric hold and never understood why or whether it was legal.",
                  "A person who was prescribed so many medications simultaneously that no human being could track the interactions — and was harmed by it.",
                  "A person who was discharged with no plan, no follow-up, and no explanation.",
                  "A person whose family watched them disappear into psychosis and had no tools, no rights, and no roadmap.",
                  "A person who experienced restraint, seclusion, or forced injection and has nowhere to put that story.",
                  "A person who is now out — and needs their record corrected, their voice restored, and their experience documented before it disappears.",
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-3 p-4 rounded-lg bg-muted/30 border border-border/50">
                    <Heart className="h-4 w-4 text-sky-400 mt-1 shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Dedication */}
            <Card className="border-border/50 bg-muted/20">
              <CardContent className="pt-6">
                <div className="max-w-2xl mx-auto text-center space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    This category exists because of <strong className="text-foreground">Donald Hendrickson</strong>. Because of <strong className="text-foreground">Cole</strong> and <strong className="text-foreground">Allison</strong> — two beautiful souls who shot through our lives like shooting stars, burning so bright, always in our hearts and in every soul they touched along the way.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                    And because of a man named <strong className="text-foreground">Alexander</strong> who walked into a locked ward, introduced himself to every single person, and made thirteen years of screaming go quiet.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-3">
                    To all those who supported, loved, and cared for those who walked this thorny road — who stood tall and true, weathering the storm, holding space for those who could not hold their own, through no fault of their own but by the mere weight of what they carried. We simply would not be here without you.
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-4">
                    Built worthy of them.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto py-4 justify-start"
                onClick={() => setActiveTab("pipelines")}
              >
                <div className="flex items-center gap-3">
                  <Brain className="h-5 w-5 text-sky-400" />
                  <div className="text-left">
                    <div className="font-medium">Explore the 6 Pipelines</div>
                    <div className="text-xs text-muted-foreground">What we examine, your rights, and what you can do</div>
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 justify-start"
                onClick={() => setActiveTab("hold-laws")}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-amber-400" />
                  <div className="text-left">
                    <div className="font-medium">Look Up Your State's Hold Law</div>
                    <div className="text-xs text-muted-foreground">Duration limits, legal standards, and statutes</div>
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 justify-start"
                onClick={() => setLocation("/intake?situation=I%20was%20held%20in%20a%20psychiatric%20facility")}
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <div className="text-left">
                    <div className="font-medium">Start a Case</div>
                    <div className="text-xs text-muted-foreground">Begin documenting what happened to you</div>
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 justify-start"
                onClick={() => setActiveTab("crisis")}
              >
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-red-400" />
                  <div className="text-left">
                    <div className="font-medium">Crisis Resources</div>
                    <div className="text-xs text-muted-foreground">988, NAMI, SAMHSA, and more</div>
                  </div>
                </div>
              </Button>
            </div>
          </TabsContent>

          {/* ─── Pipelines ─── */}
          <TabsContent value="pipelines" className="space-y-4">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">The 6 Pipelines</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Each pipeline is designed to hold a specific kind of experience. Click to expand and see what we examine, your rights, the legal authority, and what you can do right now.
              </p>
            </div>
            {PIPELINES.map((pipeline) => (
              <PipelineDetail
                key={pipeline.id}
                pipeline={pipeline}
                isExpanded={expandedPipeline === pipeline.id}
                onToggle={() => setExpandedPipeline(expandedPipeline === pipeline.id ? null : pipeline.id)}
              />
            ))}
          </TabsContent>

          {/* ─── Hold Laws by State ─── */}
          <TabsContent value="hold-laws" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Involuntary Hold Laws by State</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Every state has its own involuntary commitment statute with different names, time limits, and legal standards. Here are the key states.
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by state, law name, or statute..."
                value={holdSearch}
                onChange={(e) => setHoldSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="grid gap-3">
              {filteredHoldLaws.map((law) => (
                <Card key={law.state} className="border-border/50">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      <div className="text-center">
                        <div className="text-lg font-bold text-foreground">{law.state}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{law.name}</span>
                          <Badge variant="outline" className="text-[10px]">{law.statute}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Max hold: <strong className="text-foreground">{law.duration}</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <Scale className="h-3 w-3" />
                            Standard: {law.standard}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredHoldLaws.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No matching hold laws found.</p>
              </div>
            )}

            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Important Note</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      These are the <strong>initial</strong> hold durations. After this period, a court hearing is required to extend the hold. You have the right to an attorney at this hearing. If the hold exceeded the listed duration without a hearing, that is a potential due process violation.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Crisis Resources ─── */}
          <TabsContent value="crisis" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-foreground">Crisis Resources</h2>
              <p className="text-sm text-muted-foreground mt-1">
                If you or someone you know is in crisis right now, these resources are available 24/7.
              </p>
            </div>

            {/* Emergency Banner */}
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="py-6">
                <div className="text-center space-y-3">
                  <Phone className="h-8 w-8 text-red-400 mx-auto" />
                  <div>
                    <p className="text-2xl font-bold text-foreground">988</p>
                    <p className="text-sm text-muted-foreground">Suicide & Crisis Lifeline — Call or Text</p>
                    <p className="text-xs text-muted-foreground mt-1">Free. Confidential. 24/7.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              {CRISIS_RESOURCES.map((resource) => (
                <Card key={resource.name} className="border-border/50 hover:border-border transition-colors">
                  <CardContent className="py-4">
                    <h3 className="font-medium text-sm text-foreground">{resource.name}</h3>
                    <p className="text-primary font-mono text-sm mt-1">{resource.contact}</p>
                    <p className="text-xs text-muted-foreground mt-2">{resource.description}</p>
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 mt-2"
                    >
                      Visit website <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* P&A Organizations */}
            <Card className="border-sky-500/20 bg-sky-500/5">
              <CardContent className="py-6">
                <div className="flex items-start gap-4">
                  <Shield className="h-6 w-6 text-sky-400 mt-1 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-foreground">Protection & Advocacy Organizations</h3>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      Every state has a federally mandated Protection & Advocacy (P&A) organization with <strong className="text-foreground">legal authority to investigate abuse and neglect</strong> in psychiatric facilities. P&A organizations can enter any facility, access records, and file lawsuits. This is often the most powerful tool available for people harmed in the mental health system.
                    </p>
                    <a
                      href="https://www.ndrn.org/about/ndrn-member-agencies/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3"
                    >
                      Find your state's P&A organization <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
