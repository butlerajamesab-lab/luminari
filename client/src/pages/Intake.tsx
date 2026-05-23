import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Scale, Send, Loader2, ArrowLeft, CheckCircle2,
  FileText, Upload, ArrowRight, Heart, Sparkles,
  Volume2, VolumeX,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

const SITUATION_LABELS: Record<string, string> = {
  // Personal Crisis
  insurance: "Insurance Claim Denial",
  custody: "Custody or Family Court",
  medical: "Medical Records Review",
  workplace: "Workplace Retaliation",
  housing: "Housing or Landlord Dispute",
  consumer: "Consumer Protection",
  // Government Benefits
  disability: "Disability Benefits (SSI/SSDI)",
  medicaid: "Medicaid / Medicare",
  snap: "Food Assistance (SNAP/WIC)",
  veterans: "Veterans Benefits (VA)",
  unemployment: "Unemployment Benefits",
  // Elder Care
  nursing: "Nursing Home / Assisted Living",
  guardianship: "Guardianship / Conservatorship",
  elderabuse: "Elder Abuse Investigation",
  // Vulnerable Populations
  immigration: "Immigration & Asylum",
  childwelfare: "Child Welfare / CPS",
  education: "Education & IEP/504",
  section8: "Tenant Rights / Section 8",
  juvenile: "Juvenile Justice",
  // Justice & Financial Defense
  workerscomp: "Workers' Compensation",
  wrongfulconviction: "Wrongful Conviction",
  debtcollection: "Debt Collection Defense",
  policemisconduct: "Police Misconduct",
  bankruptcy: "Bankruptcy",
  // Community & Institutional
  environmental: "Environmental Justice",
  hoa: "HOA Disputes",
  taxdispute: "Tax Disputes",
  fostercare: "Foster Care Records",
  medmalpractice: "Medical Malpractice",
  // Systemic Accountability
  predatorylending: "Predatory Lending",
  whistleblower: "Whistleblower Retaliation",
  nonprofitcompliance: "Nonprofit Compliance",
  // Market Concentration & Agriculture
  marketconcentration: "Market Concentration & Antitrust",
  agricultureexploitation: "Agricultural Exploitation",
  // Tribal Law / Indigenous Rights
  icwa: "ICWA / Tribal Child Welfare",
  mmiw: "Missing & Murdered Indigenous Persons",
  treatyrights: "Treaty Rights",
  triballand: "Land & Trust",
  tribalenrollment: "Tribal Enrollment",
  tribalhousing: "Tribal Housing & Benefits",
  tribalsovereignty: "Sovereignty & Jurisdiction",
  // General
  other: "General Advocacy",
};

const SITUATION_OPENERS: Record<string, string> = {
  // Personal Crisis
  insurance: "I understand you're dealing with an insurance denial. That's frustrating, and you're right to look into it. Can you tell me a little about what happened? For example — what kind of insurance is it (health, auto, home, disability), and what did they say when they denied it?",
  custody: "I know family court situations are deeply personal and stressful. I'm here to help you organize what you have. Can you start by telling me what's happening? For instance — is this an ongoing custody case, a modification, or something new?",
  medical: "Medical records can be overwhelming, and when something doesn't add up, it's hard to know where to start. I'll help you make sense of it. Can you tell me what's concerning you? What happened, and what do you think the records should show?",
  workplace: "Workplace retaliation is serious, and documenting it properly matters. Let's get organized. Can you tell me what happened? When did things start to change, and what do you think triggered it?",
  housing: "Housing disputes can feel urgent and overwhelming. Let's get clear on what's happening. Can you tell me about the situation? Is this about a lease violation, an eviction, repairs, or something else?",
  consumer: "Dealing with unfair business practices or debt collectors can feel overwhelming and isolating. You're right to look into this. Can you tell me what's happening? Is this about a contract, a loan, debt collection, or something a company did that doesn't seem right?",
  // Government Benefits
  disability: "Navigating disability benefits is complicated, and the system doesn't always make it easy. I'm here to help you get organized. Can you tell me what's happening? Are you applying for the first time, dealing with a denial, or going through an appeal?",
  medicaid: "Healthcare coverage issues can be really stressful, especially when you need care now. Let's figure this out together. Can you tell me what happened? Was a treatment denied, was your coverage reduced, or is something else going on?",
  snap: "When your food assistance is affected, it's urgent and personal. Let's look at what happened. Were your benefits denied, reduced, or cut off? Do you know what reason they gave?",
  veterans: "Thank you for your service. You've earned these benefits, and you deserve to receive them. Can you tell me what's going on? Is this about a disability rating, healthcare access, or another VA benefit?",
  unemployment: "Losing income is stressful enough without having to fight for benefits you're owed. Let's get organized. Can you tell me what happened? Were you denied, is your employer contesting, or is there an overpayment issue?",
  // Elder Care
  nursing: "When someone you love isn't getting the care they deserve, it's deeply concerning. I'm here to help you document what's happening. Can you tell me about the situation? What's worrying you about their care?",
  guardianship: "Guardianship situations involve someone's fundamental rights, and that's serious. I want to help you understand what's happening. Can you tell me about the situation? Is this about someone being placed under guardianship, or concerns about how a guardian is acting?",
  elderabuse: "I'm so sorry you're dealing with this. Suspecting that someone you care about is being hurt or neglected is one of the hardest things. Let's take this one step at a time. Can you tell me what you've noticed that concerns you?",
  // Vulnerable Populations
  immigration: "I understand how stressful immigration matters can be. Everything you share here is private and stays in your account. Can you tell me about your situation? What's happening with your case, and are there any upcoming deadlines I should know about?",
  childwelfare: "I know this is an incredibly difficult time. Whether CPS is involved with your family or you're concerned about a child, we'll work through this together. Can you tell me what's happening right now?",
  education: "Your child deserves the education they were promised. When schools don't follow through on IEPs or 504 plans, it matters. Can you tell me what's happening? What is the school doing — or not doing — that concerns you?",
  section8: "Housing assistance is a lifeline, and when it's threatened, everything feels uncertain. Let's look at what's happening. Can you tell me about the situation? Is this about your voucher, your housing authority, or something else?",
  juvenile: "When a young person is caught up in the system, their whole future is at stake. I want to help make sure the process is fair. Can you tell me what's happening? What's the young person facing right now?",
  // Justice & Financial Defense
  workerscomp: "I'm sorry you're dealing with a workplace injury on top of everything else. Workers' comp systems can feel like they're working against you — and honestly, they often are. Let's figure out where things stand. Can you tell me what happened? Were you injured on the job, and has your claim been filed or denied?",
  wrongfulconviction: "I want you to know that what you're bringing to this matters deeply. Whether this is about you or someone you love, the stakes couldn't be higher. Let's start organizing the record. Can you tell me about the case? What was the conviction for, when did it happen, and what makes you believe it was wrong?",
  debtcollection: "Being hounded by debt collectors is exhausting and scary — but you have more rights than they want you to know. Let's look at what's happening. Can you tell me who's contacting you, what they say you owe, and whether you've received anything in writing?",
  policemisconduct: "What happened to you should not have happened. I understand you may not trust systems right now, and that's completely reasonable. Everything here stays in your account. Can you tell me what happened, when and where it occurred, and whether you were injured or charged?",
  bankruptcy: "Financial pressure can feel overwhelming, but you're taking a step to understand your options — that takes strength. Let's look at the situation clearly. Can you tell me what's driving this? What types of debt are you dealing with, and has any creditor taken action like a lawsuit or garnishment?",
  // Community & Institutional
  environmental: "Fighting for your community's health and safety is important work, and it often takes years of persistence. Let's organize what you have. Can you tell me what the environmental concern is — water, air, soil, or a facility — and how long it's been affecting your community?",
  hoa: "HOA disputes can feel like fighting an organization that makes the rules and enforces them too. Let's look at what's happening. Can you tell me what the dispute is about, and whether the HOA has been following its own bylaws?",
  taxdispute: "Tax issues create enormous anxiety, but they're almost always workable when you can see the full picture. Let's be calm and systematic about this. Can you tell me what the agency is claiming, which tax year is involved, and whether you've received any notices with deadlines?",
  fostercare: "For people who grew up in the system, these records are often the only documentation of their childhood. I want to help you find what you're looking for. Can you tell me which state you were in care, approximately when, and what information you're trying to access?",
  medmalpractice: "When you're harmed by the people you trusted with your health, it's deeply disorienting. You deserve answers. Can you tell me what happened, which provider was involved, and when the incident occurred?",
  // Systemic Accountability
  predatorylending: "Predatory lending is designed to be confusing — that's not your fault. Let's look at what happened clearly. Can you tell me what type of loan or financial product this involves, what the terms were, and how much you've paid compared to what you originally borrowed?",
  whistleblower: "Reporting wrongdoing takes real courage, especially when the system punishes you for it. You're not alone in this. Can you tell me what you reported, to whom, and what happened afterward?",
  // Market Concentration & Agriculture
  marketconcentration: "You're looking into something that affects millions of people but is designed to be invisible at the individual level \u2014 market concentration. When a handful of companies control an entire supply chain, everyone downstream pays the price. Let's organize what you're seeing. Can you tell me which industry or supply chain you're investigating, what consolidation pattern you've noticed, and what documents or data you have access to? Are we looking at pricing changes, merger activity, lobbying records, or something else?",
  agricultureexploitation: "I hear you. Farming families are caught in a system where five companies control the inputs, the margins keep shrinking, and the bailouts flow back to the same entities that created the problem. That's not an accident \u2014 it's a pattern, and it can be documented. Can you tell me about your operation? What do you farm or ranch, how long have you been at it, and what are your biggest cost pressures right now? We'll start organizing the financial picture so the pattern becomes visible.",
  nonprofitcompliance: "Concerns about how a nonprofit is being run deserve to be taken seriously — these organizations exist to serve a mission, not themselves. Can you tell me what your concern is, your relationship to the organization, and what evidence you have?",
  // Tribal Law / Indigenous Rights
  icwa: "I understand you're dealing with an ICWA case, and I want you to know — these are your sovereign rights, not just paperwork. Whether you're a parent, a tribal ICWA worker, or a family member seeking placement, we'll work through this together. Can you tell me what's happening? Has a child been removed or is there a risk of removal? Which tribal nation is involved, and has the tribe been properly notified?",
  mmiw: "I'm so deeply sorry for what you and your family are going through. I know that many families in this situation have been dismissed or ignored by the systems that should have helped. You deserve better than that. Everything you share here is private and stays in your account. Can you tell me about your loved one? Where were they last seen, and which law enforcement agencies have you been in contact with?",
  treatyrights: "Treaty rights are not requests — they are promises that were made and must be honored. I'm here to help you organize the documentary record so the truth is clear. Can you tell me what's happening? Which tribal nation and which treaty are involved, and what right is being restricted or threatened?",
  triballand: "Land and trust issues can feel like fighting a maze that was built to confuse you — and honestly, that's not far from the truth. The BIA's records are scattered across decades and offices. Let's start making sense of what you have. Can you tell me what's going on? Is this about land ownership, trust fund accounting, a lease, or something else?",
  tribalenrollment: "Enrollment is about who you are and where you belong — it's deeply personal. I understand these records can be incomplete or even deliberately obscured from the assimilation era. Let's work through what you have. Can you tell me which tribe this involves, and whether this is a new enrollment application or a challenge to a disenrollment decision?",
  tribalhousing: "Housing on tribal lands comes with challenges that most people never have to think about — environmental reviews, infrastructure gaps, compliance documentation that can delay things for years. Let's figure out where things stand. Can you tell me what's happening? Is this about a new housing application, a dispute with your current situation, or a benefits access issue?",
  tribalsovereignty: "Jurisdictional questions in Indian Country are some of the most complex in American law — and that complexity is often used against the people it should protect. I'm here to help you organize the documentary record so the jurisdictional picture is clear. Can you tell me what type of matter this involves — criminal, civil, or regulatory — and where the events occurred?",
  // General
  other: "I'm here to help. Can you tell me, in your own words, what you're going through? Don't worry about getting it perfect — just tell me what's happening, and we'll figure out the best way to help together.",
};

type IntakeMessage = {
  role: "assistant" | "user";
  content: string;
};

type IntakePlan = {
  caseName: string;
  caseDescription: string;
  domain: string;
  documentChecklist: { label: string; description: string; priority: "essential" | "helpful" | "optional" }[];
  nextSteps: string[];
  ready: boolean;
};

export default function Intake() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const situationId = params.get("situation") || "other";
  const { user } = useAuth();

  const [messages, setMessages] = useState<IntakeMessage[]>([
    { role: "assistant", content: SITUATION_OPENERS[situationId] || SITUATION_OPENERS.other },
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [plan, setPlan] = useState<IntakePlan | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoReadEnabled, setAutoReadEnabled] = useState(false);
  const lastAutoReadIndexRef = useRef<number>(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const intakeConverse = trpc.intake.converse.useMutation();
  const createCase = trpc.cases.create.useMutation();
  const logEvent = trpc.analytics.logEvent.useMutation();
  const jurisdictionsQuery = trpc.luminari.jurisdictions.useQuery();
  const processIntake = trpc.luminari.processIntake.useMutation();

  const [selectedJurisdiction, setSelectedJurisdiction] = useState<number | null>(null);
  const [showJurisdictionStep, setShowJurisdictionStep] = useState(false);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Auto-read new advocate messages when accessibility mode is enabled
  useEffect(() => {
    if (!autoReadEnabled) return;
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const latestIndex = assistantMessages.length - 1;
    if (latestIndex < 0 || latestIndex <= lastAutoReadIndexRef.current) return;
    lastAutoReadIndexRef.current = latestIndex;
    const latestMsg = assistantMessages[latestIndex];
    if (!latestMsg?.content?.trim()) return;
    // Small delay to let the message render
    const timer = setTimeout(() => {
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(latestMsg.content);
      utterance.rate = 0.88;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Samantha") || v.name.includes("Google"))
      );
      if (preferred) utterance.voice = preferred;
      utterance.onend = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }, 400);
    return () => clearTimeout(timer);
  }, [messages, autoReadEnabled]);

  // Focus textarea on load
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 300);
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    const userMsg: IntakeMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    try {
      const result = await intakeConverse.mutateAsync({
        situationType: situationId,
        messages: [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);

      if (result.plan) {
        setPlan(result.plan);
      }
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreateCase = async () => {
    if (!plan || isCreating) return;
    // Show jurisdiction selector if not already shown
    if (!showJurisdictionStep) {
      setShowJurisdictionStep(true);
      return;
    }
    // Validate jurisdiction selected
    if (!selectedJurisdiction) {
      toast.error("Please select your jurisdiction.");
      return;
    }
    setIsCreating(true);
    try {
      // Map situation to category
      const categoryMap: Record<string, string> = {
        housing: "housing",
        employment: "employment",
        benefits: "benefits",
        healthcare: "healthcare",
        disability: "disability",
      };
      const category = categoryMap[situationId] || "other";
      
      // Call luminari processIntake
      const result = await processIntake.mutateAsync({
        jurisdiction_id: selectedJurisdiction,
        category,
        intake_answers: {
          situation: situationId,
          plan,
          messages: messages.filter((m) => m.role === "user").map((m) => m.content),
        },
      });
      
      logEvent.mutate({ pipelineType: situationId, eventType: "intake_complete" });
      toast.success("Your case has been created. Let's look at your options.");
      setLocation(`/case/${result.case.id}`);
    } catch (err: any) {
      toast.error(err.message || "Could not create the case. Please try again.");
      setIsCreating(false);
    }
  };

  const toggleSpeech = (text: string) => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  const conversationProgress = Math.min(
    ((messages.filter((m) => m.role === "user").length) / 4) * 100,
    plan ? 100 : 90
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border/50 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setLocation("/welcome")}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="h-4 w-px bg-border" />
          <Badge variant="outline" className="text-xs font-normal">
            {SITUATION_LABELS[situationId] || "General"}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Understanding your situation
          </div>
          {/* Accessibility: Auto-read toggle */}
          <button
            onClick={() => {
              const next = !autoReadEnabled;
              setAutoReadEnabled(next);
              if (!next && window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                setIsSpeaking(false);
              }
            }}
            title={autoReadEnabled ? "Turn off auto-read (accessibility mode)" : "Turn on auto-read (accessibility mode — reads each message aloud automatically)"}
            aria-label={autoReadEnabled ? "Auto-read on. Click to turn off." : "Auto-read off. Click to enable accessibility mode."}
            aria-pressed={autoReadEnabled}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border transition-colors ${
              autoReadEnabled
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-transparent border-border/40 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            {autoReadEnabled ? (
              <><Volume2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Auto-read on</span></>
            ) : (
              <><VolumeX className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Auto-read</span></>
            )}
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="px-4 sm:px-6 pt-3">
        <Progress value={conversationProgress} className="h-1" />
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {plan ? "Ready to set up your case" : "Tell me more so I can help you best"}
        </p>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card border border-border rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="space-y-2">
                  <div className="text-sm leading-relaxed">
                    <Streamdown>{msg.content}</Streamdown>
                  </div>
                  <button
                    onClick={() => toggleSpeech(msg.content)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mt-1"
                  >
                    {isSpeaking ? (
                      <><VolumeX className="h-3 w-3" /> Stop reading</>
                    ) : (
                      <><Volume2 className="h-3 w-3" /> Read aloud</>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-sm leading-relaxed">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking about how to help...
              </div>
            </div>
          </div>
        )}

        {/* Case plan card — appears when the LLM has gathered enough info */}
        {plan && (
          <div className="flex justify-start">
            <Card className="max-w-[85%] sm:max-w-[75%] border-primary/30 bg-primary/5">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    Here's what I've put together for you
                  </h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Case Name</p>
                    <p className="text-sm font-medium text-foreground">{plan.caseName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">What We'll Look For</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{plan.caseDescription}</p>
                  </div>
                </div>

                {/* Document checklist */}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                    Documents We'll Need
                  </p>
                  <div className="space-y-2">
                    {plan.documentChecklist.map((doc, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 p-2 rounded-md bg-background/50"
                      >
                        <FileText className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                          doc.priority === "essential" ? "text-primary" :
                          doc.priority === "helpful" ? "text-amber-400" : "text-muted-foreground"
                        }`} />
                        <div>
                          <p className="text-xs font-medium text-foreground">{doc.label}</p>
                          <p className="text-[10px] text-muted-foreground">{doc.description}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[9px] shrink-0 ml-auto ${
                            doc.priority === "essential" ? "border-primary/40 text-primary" :
                            doc.priority === "helpful" ? "border-amber-400/40 text-amber-400" :
                            "border-border text-muted-foreground"
                          }`}
                        >
                          {doc.priority}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Next steps */}
                {plan.nextSteps.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                      What Happens Next
                    </p>
                    <div className="space-y-1.5">
                      {plan.nextSteps.map((step, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <span className="text-primary font-mono text-[10px] mt-0.5">{i + 1}.</span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleCreateCase}
                  disabled={isCreating}
                  className="w-full gap-2 mt-2"
                  size="lg"
                >
                  {isCreating ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {showJurisdictionStep ? "Creating your case..." : "Setting things up..."}</>
                  ) : (
                    <><ArrowRight className="h-4 w-4" /> {showJurisdictionStep ? "Create my case" : "Let's get started"}</>
                  )}
                </Button>

                {/* Jurisdiction selector step */}
                {showJurisdictionStep && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <div>
                      <label className="text-sm font-medium block mb-2">Where are you located?</label>
                      <select
                        value={selectedJurisdiction || ""}
                        onChange={(e) => setSelectedJurisdiction(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground text-sm"
                      >
                        <option value="">Select your state or territory...</option>
                        {jurisdictionsQuery.data?.map((j: any) => (
                          <option key={j.id} value={j.id}>
                            {j.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      We'll match you with programs, workflows, and resources specific to your location.
                    </p>
                  </div>
                )}

                <p className="text-[10px] text-center text-muted-foreground/60">
                  You can always come back and add more details later
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border/50 px-4 sm:px-6 py-3 bg-background shrink-0">
        <div className="max-w-2xl mx-auto flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={plan ? "Ask me anything else, or click 'Let's get started' above..." : "Tell me what's happening..."}
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
            rows={1}
            disabled={isThinking}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            size="icon"
            className="shrink-0 h-[44px] w-[44px]"
          >
            {isThinking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-center text-muted-foreground/50 mt-2">
          Press Enter to send, Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}
