import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Heart, Shield, FileText, Scale, ArrowRight,
  Headphones, MessageCircle, Sparkles, ChevronRight,
  Upload, Lightbulb, CheckCircle2, Briefcase,
  Search, BarChart3, Network, FileDown,
  Gavel, Home, Building2, Stethoscope, AlertTriangle,
  Users, Loader2, Baby, Landmark, HandHeart,
  ShieldAlert, Globe, GraduationCap, CreditCard,
  Wallet, HeartHandshake, ChevronDown,
  Feather, MapPin, ScrollText, Trees, BookOpen, Tent, Flag,
  HardHat, Unlock, PhoneOff, ShieldOff, Banknote,
  Factory, Building, Receipt, FolderHeart, HeartPulse,
  CircleDollarSign, Megaphone, ClipboardCheck,
  Wheat, TrendingDown,
  Lamp, Eye,
} from "lucide-react";
import { OnboardingTour } from "@/components/OnboardingTour";

/* ─── Pipeline definitions ─── */

interface PipelineConfig {
  id: string;
  icon: any;
  title: string;
  intakeDescription: string;
  pipelineDescription: string;
  capabilities: string[];
  domain: string;
  caseNameTemplate: string;
  color: string;
  bgColor: string;
  borderColor: string;
  pipelineBg: string;
}

interface PipelineCategory {
  id: string;
  title: string;
  description: string;
  pipelines: PipelineConfig[];
}

const CATEGORIES: PipelineCategory[] = [
  {
    id: "personal",
    title: "Personal Crisis",
    description: "When life throws something at you and the paperwork doesn't add up",
    pipelines: [
      {
        id: "insurance_claim_denial",
        icon: Shield,
        title: "Insurance Claim Denial",
        intakeDescription: "They said no. Let's find out if they had the right to.",
        pipelineDescription: "Analyze policy language against denial rationale. Extract contradictions, timeline gaps, and regulatory violations.",
        capabilities: ["Claim Denial Analysis", "Policy vs. Denial Cross-Reference", "Timeline Reconstruction", "Regulatory Compliance Check"],
        domain: "Insurance",
        caseNameTemplate: "Insurance Claim Denial",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "tenant_rights",
        icon: Home,
        title: "Tenant Rights & Housing",
        intakeDescription: "Your home should be safe. Let's make sure the landlord knows that too.",
        pipelineDescription: "Analyze lease agreements, maintenance records, and communications for violations, illegal practices, and tenant rights issues.",
        capabilities: ["Lease Analysis", "Violation Detection", "Communication Pattern Review", "Rights Assessment"],
        domain: "Housing",
        caseNameTemplate: "Tenant Rights & Housing",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "medical_malpractice",
        icon: Stethoscope,
        title: "Medical Malpractice",
        intakeDescription: "Something feels wrong. Let's look at what the records actually say.",
        pipelineDescription: "Analyze medical records for inconsistencies, omissions, billing discrepancies, and standard-of-care deviations.",
        capabilities: ["Medical Record Extraction", "Billing vs. Treatment Cross-Check", "Provider Communication Analysis", "Standard of Care Comparison"],
        domain: "Medical",
        caseNameTemplate: "Medical Malpractice",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "workplace_discrimination",
        icon: HardHat,
        title: "Workplace Discrimination",
        intakeDescription: "You deserve a fair workplace. Let's document what happened.",
        pipelineDescription: "Analyze employment records, communications, and HR documentation for patterns of discrimination or retaliation.",
        capabilities: ["Employment Record Analysis", "Communication Pattern Detection", "HR Documentation Review", "Timeline Reconstruction"],
        domain: "Employment",
        caseNameTemplate: "Workplace Discrimination",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "consumer_fraud",
        icon: CreditCard,
        title: "Consumer Fraud",
        intakeDescription: "When a company takes advantage of you, the evidence tells the story.",
        pipelineDescription: "Analyze contracts, marketing materials, and transaction records for deceptive practices and consumer protection violations.",
        capabilities: ["Contract Analysis", "Marketing vs. Reality Comparison", "Transaction Pattern Detection", "Regulatory Violation Check"],
        domain: "Consumer",
        caseNameTemplate: "Consumer Fraud",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "auto_insurance_dispute",
        icon: Shield,
        title: "Auto Insurance Dispute",
        intakeDescription: "Your claim shouldn't be a battle. Let's review what they owe.",
        pipelineDescription: "Analyze auto insurance claims, repair estimates, and policy coverage for underpayment or wrongful denial.",
        capabilities: ["Claim Analysis", "Coverage Review", "Estimate Comparison", "Bad Faith Detection"],
        domain: "Insurance",
        caseNameTemplate: "Auto Insurance Dispute",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "homeowner_insurance",
        icon: Home,
        title: "Homeowner Insurance",
        intakeDescription: "Your home was damaged. Let's make sure the insurer keeps their promise.",
        pipelineDescription: "Analyze homeowner insurance claims, damage assessments, and policy terms for coverage disputes.",
        capabilities: ["Damage Assessment Review", "Policy Coverage Analysis", "Claim Timeline", "Adjuster Report Comparison"],
        domain: "Insurance",
        caseNameTemplate: "Homeowner Insurance",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "life_insurance_dispute",
        icon: Shield,
        title: "Life Insurance Dispute",
        intakeDescription: "When a family needs support most, the insurer shouldn't stand in the way.",
        pipelineDescription: "Analyze life insurance policy terms, beneficiary disputes, and denial rationale.",
        capabilities: ["Policy Term Analysis", "Beneficiary Verification", "Denial Rationale Review", "Contestability Period Check"],
        domain: "Insurance",
        caseNameTemplate: "Life Insurance Dispute",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "product_liability",
        icon: AlertTriangle,
        title: "Product Liability",
        intakeDescription: "A product hurt you. Let's trace the evidence.",
        pipelineDescription: "Analyze product documentation, injury records, and manufacturer communications for liability evidence.",
        capabilities: ["Product Documentation Review", "Injury Record Analysis", "Manufacturer Communication Trace", "Safety Standard Comparison"],
        domain: "Consumer",
        caseNameTemplate: "Product Liability",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "identity_theft",
        icon: ShieldOff,
        title: "Identity Theft",
        intakeDescription: "Someone stole your identity. Let's build the paper trail to get it back.",
        pipelineDescription: "Analyze financial records, credit reports, and communications to document identity theft and support recovery.",
        capabilities: ["Credit Report Analysis", "Fraudulent Transaction Mapping", "Communication Trail", "Recovery Documentation"],
        domain: "Consumer",
        caseNameTemplate: "Identity Theft",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "debt_collection_harassment",
        icon: PhoneOff,
        title: "Debt Collection Harassment",
        intakeDescription: "Collectors have rules too. Let's see if they broke them.",
        pipelineDescription: "Analyze collection communications, account records, and practices for FDCPA and state law violations.",
        capabilities: ["Communication Frequency Analysis", "FDCPA Compliance Check", "Account Verification Review", "Harassment Pattern Detection"],
        domain: "Consumer",
        caseNameTemplate: "Debt Collection Harassment",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "lemon_law",
        icon: CreditCard,
        title: "Lemon Law",
        intakeDescription: "Your car keeps breaking. The manufacturer may owe you a fix or a refund.",
        pipelineDescription: "Analyze repair records, warranty claims, and dealer communications for lemon law qualification.",
        capabilities: ["Repair History Analysis", "Warranty Claim Review", "Dealer Communication Trail", "Qualification Assessment"],
        domain: "Consumer",
        caseNameTemplate: "Lemon Law",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "personal_injury",
        icon: AlertTriangle,
        title: "Personal Injury",
        intakeDescription: "You were hurt. Let's make sure every detail is documented.",
        pipelineDescription: "Analyze medical records, incident reports, and liability evidence for personal injury claims.",
        capabilities: ["Medical Record Extraction", "Incident Reconstruction", "Liability Evidence Mapping", "Damages Documentation"],
        domain: "Legal",
        caseNameTemplate: "Personal Injury",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "property_damage",
        icon: Home,
        title: "Property Damage",
        intakeDescription: "Your property was damaged. Let's document the full extent.",
        pipelineDescription: "Analyze damage assessments, repair estimates, and insurance communications for property damage claims.",
        capabilities: ["Damage Assessment", "Estimate Comparison", "Insurance Communication Review", "Liability Determination"],
        domain: "Property",
        caseNameTemplate: "Property Damage",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "contract_dispute",
        icon: FileText,
        title: "Contract Dispute",
        intakeDescription: "The agreement was clear. Let's prove it.",
        pipelineDescription: "Analyze contract terms, communications, and performance records for breach of contract evidence.",
        capabilities: ["Contract Term Analysis", "Performance Review", "Communication Trail", "Breach Documentation"],
        domain: "Legal",
        caseNameTemplate: "Contract Dispute",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "small_claims",
        icon: Scale,
        title: "Small Claims",
        intakeDescription: "Small dollar amount, big principle. Let's organize your evidence.",
        pipelineDescription: "Organize and analyze evidence for small claims court presentation.",
        capabilities: ["Evidence Organization", "Timeline Construction", "Claim Documentation", "Court Preparation"],
        domain: "Legal",
        caseNameTemplate: "Small Claims",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "warranty_dispute",
        icon: ClipboardCheck,
        title: "Warranty Dispute",
        intakeDescription: "They promised it would work. Let's hold them to it.",
        pipelineDescription: "Analyze warranty terms, repair records, and manufacturer communications for warranty enforcement.",
        capabilities: ["Warranty Term Analysis", "Repair Record Review", "Manufacturer Communication Trail", "Coverage Determination"],
        domain: "Consumer",
        caseNameTemplate: "Warranty Dispute",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
      {
        id: "utility_dispute",
        icon: Building,
        title: "Utility Dispute",
        intakeDescription: "Your utility bill doesn't add up. Let's find out why.",
        pipelineDescription: "Analyze utility billing records, usage data, and communications for billing errors or service violations.",
        capabilities: ["Billing Analysis", "Usage Pattern Review", "Rate Comparison", "Service Violation Check"],
        domain: "Consumer",
        caseNameTemplate: "Utility Dispute",
        color: "text-blue-400",
        bgColor: "bg-blue-500/10 hover:bg-blue-500/20",
        borderColor: "border-blue-500/20",
        pipelineBg: "bg-blue-500/5 hover:bg-blue-500/10 border-blue-500/15",
      },
    ],
  },
  {
    id: "family",
    title: "Family & Children",
    description: "For families navigating court systems, custody battles, and child welfare",
    pipelines: [
      {
        id: "custody_dispute",
        icon: Gavel,
        title: "Custody & Family Court",
        intakeDescription: "When the paperwork doesn't match what really happened.",
        pipelineDescription: "Cross-reference court filings, communication records, and testimony for contradictions and timeline inconsistencies.",
        capabilities: ["Document Cross-Reference", "Communication Pattern Analysis", "Timeline Contradiction Detection", "Court Filing Review"],
        domain: "Family Court",
        caseNameTemplate: "Custody & Family Court",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "domestic_violence",
        icon: ShieldAlert,
        title: "Domestic Violence Documentation",
        intakeDescription: "Building a record of what happened — safely and thoroughly.",
        pipelineDescription: "Analyze incident reports, communications, medical records, and protective orders for comprehensive DV documentation.",
        capabilities: ["Incident Documentation", "Communication Pattern Analysis", "Medical Record Correlation", "Protective Order Tracking"],
        domain: "Family Safety",
        caseNameTemplate: "Domestic Violence Documentation",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "child_welfare_investigation",
        icon: Baby,
        title: "Child Welfare Investigation",
        intakeDescription: "When CPS is involved, every detail matters.",
        pipelineDescription: "Analyze CPS reports, home study documents, and case records for procedural compliance and factual accuracy.",
        capabilities: ["CPS Report Analysis", "Home Study Review", "Procedural Compliance Check", "Timeline Reconstruction"],
        domain: "Child Welfare",
        caseNameTemplate: "Child Welfare Investigation",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "foster_care_records",
        icon: FolderHeart,
        title: "Foster Care Records",
        intakeDescription: "Every child deserves their story told accurately.",
        pipelineDescription: "Analyze foster care placement records, case plans, and agency communications for compliance and child welfare.",
        capabilities: ["Placement Record Review", "Case Plan Analysis", "Agency Communication Trail", "Compliance Verification"],
        domain: "Child Welfare",
        caseNameTemplate: "Foster Care Records",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "child_support_enforcement",
        icon: Scale,
        title: "Child Support Enforcement",
        intakeDescription: "Support orders exist for a reason. Let's enforce them.",
        pipelineDescription: "Analyze income records, payment history, and court orders for child support enforcement.",
        capabilities: ["Income Verification", "Payment History Analysis", "Order Compliance Check", "Enforcement Documentation"],
        domain: "Family Court",
        caseNameTemplate: "Child Support Enforcement",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "adoption_records",
        icon: HeartHandshake,
        title: "Adoption Records",
        intakeDescription: "Understanding your story starts with the records.",
        pipelineDescription: "Analyze adoption records, agency documentation, and legal filings for completeness and compliance.",
        capabilities: ["Record Completeness Review", "Agency Documentation Analysis", "Legal Filing Review", "Timeline Reconstruction"],
        domain: "Family Court",
        caseNameTemplate: "Adoption Records",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "parental_rights_termination",
        icon: Gavel,
        title: "Parental Rights Termination",
        intakeDescription: "The most serious family court action. Every fact must be verified.",
        pipelineDescription: "Analyze termination petitions, case records, and evidence for procedural compliance and factual accuracy.",
        capabilities: ["Petition Analysis", "Evidence Verification", "Procedural Compliance", "Timeline Documentation"],
        domain: "Family Court",
        caseNameTemplate: "Parental Rights Termination",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "juvenile_justice",
        icon: Scale,
        title: "Juvenile Justice",
        intakeDescription: "Young people deserve fair treatment in the justice system.",
        pipelineDescription: "Analyze juvenile court records, detention conditions, and case outcomes for rights violations.",
        capabilities: ["Court Record Analysis", "Detention Condition Review", "Rights Compliance Check", "Outcome Assessment"],
        domain: "Justice",
        caseNameTemplate: "Juvenile Justice",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "family_court_general",
        icon: Gavel,
        title: "Family Court General",
        intakeDescription: "Family court matters that don't fit a specific category.",
        pipelineDescription: "Analyze family court filings, orders, and communications for general family law matters.",
        capabilities: ["Filing Analysis", "Order Review", "Communication Trail", "Timeline Reconstruction"],
        domain: "Family Court",
        caseNameTemplate: "Family Court General",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "guardianship_dispute",
        icon: Users,
        title: "Guardianship Dispute",
        intakeDescription: "Protecting someone's autonomy when others make decisions for them.",
        pipelineDescription: "Analyze guardianship petitions, capacity evaluations, and guardian conduct for rights protection.",
        capabilities: ["Petition Review", "Capacity Evaluation Analysis", "Guardian Conduct Assessment", "Rights Protection Check"],
        domain: "Family Court",
        caseNameTemplate: "Guardianship Dispute",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "paternity_dispute",
        icon: Scale,
        title: "Paternity Dispute",
        intakeDescription: "Establishing the truth about parentage.",
        pipelineDescription: "Analyze genetic testing, court filings, and evidence for paternity determination.",
        capabilities: ["Testing Record Review", "Filing Analysis", "Evidence Assessment", "Legal Determination Support"],
        domain: "Family Court",
        caseNameTemplate: "Paternity Dispute",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "child_abuse_investigation",
        icon: ShieldAlert,
        title: "Child Abuse Investigation",
        intakeDescription: "Protecting children by documenting the evidence carefully.",
        pipelineDescription: "Analyze medical records, witness statements, and investigation reports for child abuse cases.",
        capabilities: ["Medical Evidence Review", "Witness Statement Analysis", "Investigation Report Assessment", "Timeline Documentation"],
        domain: "Child Welfare",
        caseNameTemplate: "Child Abuse Investigation",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "family_preservation",
        icon: Heart,
        title: "Family Preservation",
        intakeDescription: "Keeping families together when it's safe to do so.",
        pipelineDescription: "Analyze family preservation service records, assessments, and outcomes.",
        capabilities: ["Service Record Review", "Assessment Analysis", "Outcome Tracking", "Safety Evaluation"],
        domain: "Child Welfare",
        caseNameTemplate: "Family Preservation",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
      {
        id: "kinship_care",
        icon: Users,
        title: "Kinship Care",
        intakeDescription: "When family steps up to care for their own.",
        pipelineDescription: "Analyze kinship care placements, background checks, and support service records.",
        capabilities: ["Placement Review", "Background Check Analysis", "Support Service Assessment", "Compliance Verification"],
        domain: "Child Welfare",
        caseNameTemplate: "Kinship Care",
        color: "text-rose-400",
        bgColor: "bg-rose-500/10 hover:bg-rose-500/20",
        borderColor: "border-rose-500/20",
        pipelineBg: "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/15",
      },
    ],
  },
  {
    id: "benefits",
    title: "Government Benefits",
    description: "When the system says no but the rules say otherwise",
    pipelines: [
      {
        id: "ssdi_denial",
        icon: Landmark,
        title: "SSDI Denial",
        intakeDescription: "You paid into the system. Let's make sure it pays you back.",
        pipelineDescription: "Analyze medical evidence, work history, and SSA decision rationale for SSDI appeal preparation.",
        capabilities: ["Medical Evidence Review", "Work History Analysis", "SSA Decision Deconstruction", "Appeal Strategy Support"],
        domain: "Benefits",
        caseNameTemplate: "SSDI Denial",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "ssi_denial",
        icon: Landmark,
        title: "SSI Denial",
        intakeDescription: "When disability meets poverty, the system should help — not block.",
        pipelineDescription: "Analyze financial records, medical evidence, and SSA determinations for SSI eligibility.",
        capabilities: ["Financial Eligibility Review", "Medical Evidence Analysis", "SSA Determination Review", "Resource Assessment"],
        domain: "Benefits",
        caseNameTemplate: "SSI Denial",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "medicaid_denial",
        icon: Landmark,
        title: "Medicaid/Medicare Denial",
        intakeDescription: "Healthcare shouldn't depend on paperwork tricks.",
        pipelineDescription: "Analyze eligibility determinations, medical necessity documentation, and appeal records.",
        capabilities: ["Eligibility Analysis", "Medical Necessity Review", "Appeal Record Assessment", "Coverage Determination"],
        domain: "Benefits",
        caseNameTemplate: "Medicaid/Medicare Denial",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "snap_denial",
        icon: Landmark,
        title: "SNAP Benefits Denial",
        intakeDescription: "Food assistance denied? Let's check their math.",
        pipelineDescription: "Analyze income calculations, household determinations, and eligibility criteria for SNAP appeals.",
        capabilities: ["Income Calculation Review", "Household Determination Analysis", "Eligibility Criteria Check", "Appeal Documentation"],
        domain: "Benefits",
        caseNameTemplate: "SNAP Benefits Denial",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "va_benefits_denial",
        icon: Flag,
        title: "VA Benefits Denial",
        intakeDescription: "You served. The VA should serve you back.",
        pipelineDescription: "Analyze service records, medical evidence, and VA rating decisions for benefits appeals.",
        capabilities: ["Service Record Review", "Medical Evidence Analysis", "Rating Decision Deconstruction", "Nexus Letter Assessment"],
        domain: "Veterans",
        caseNameTemplate: "VA Benefits Denial",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "unemployment_denial",
        icon: Landmark,
        title: "Unemployment Denial",
        intakeDescription: "You lost your job through no fault of your own. Let's prove it.",
        pipelineDescription: "Analyze employment records, termination documentation, and state determinations for unemployment appeals.",
        capabilities: ["Employment Record Review", "Termination Analysis", "State Determination Review", "Appeal Preparation"],
        domain: "Benefits",
        caseNameTemplate: "Unemployment Denial",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "tanf_denial",
        icon: Landmark,
        title: "TANF Denial",
        intakeDescription: "Temporary assistance shouldn't be permanently denied.",
        pipelineDescription: "Analyze income records, work participation, and eligibility determinations for TANF appeals.",
        capabilities: ["Income Review", "Work Participation Analysis", "Eligibility Determination Check", "Appeal Documentation"],
        domain: "Benefits",
        caseNameTemplate: "TANF Denial",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "section_8_denial",
        icon: Home,
        title: "Section 8 / Housing Voucher",
        intakeDescription: "Affordable housing is a right. Let's fight for yours.",
        pipelineDescription: "Analyze housing authority decisions, eligibility criteria, and waiting list documentation.",
        capabilities: ["Decision Analysis", "Eligibility Review", "Waiting List Documentation", "Appeal Preparation"],
        domain: "Housing",
        caseNameTemplate: "Section 8 / Housing Voucher",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
    ],
  },
  {
    id: "elder",
    title: "Elder Care & Protection",
    description: "Protecting those who cared for us when we couldn't care for ourselves",
    pipelines: [
      {
        id: "nursing_home_abuse",
        icon: HandHeart,
        title: "Nursing Home Abuse",
        intakeDescription: "They trusted the facility. Let's find out if that trust was betrayed.",
        pipelineDescription: "Analyze care records, staffing logs, incident reports, and regulatory filings for abuse indicators.",
        capabilities: ["Care Record Analysis", "Staffing Pattern Review", "Incident Report Cross-Reference", "Regulatory Compliance Check"],
        domain: "Elder Care",
        caseNameTemplate: "Nursing Home Abuse",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "elder_financial_exploitation",
        icon: Wallet,
        title: "Elder Financial Exploitation",
        intakeDescription: "Someone is taking advantage. The money trail will show it.",
        pipelineDescription: "Analyze financial transactions, account changes, and power of attorney usage for exploitation patterns.",
        capabilities: ["Transaction Pattern Analysis", "Account Change Tracking", "POA Usage Review", "Exploitation Pattern Detection"],
        domain: "Elder Care",
        caseNameTemplate: "Elder Financial Exploitation",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "guardianship_abuse",
        icon: HandHeart,
        title: "Guardianship Abuse",
        intakeDescription: "A guardian should protect, not exploit.",
        pipelineDescription: "Analyze guardianship records, financial accounting, and care decisions for guardian misconduct.",
        capabilities: ["Financial Accounting Review", "Care Decision Analysis", "Court Report Assessment", "Misconduct Pattern Detection"],
        domain: "Elder Care",
        caseNameTemplate: "Guardianship Abuse",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "medicare_fraud",
        icon: Receipt,
        title: "Medicare Fraud",
        intakeDescription: "When healthcare providers bill for care that was never given.",
        pipelineDescription: "Analyze Medicare billing records, treatment documentation, and provider patterns for fraud indicators.",
        capabilities: ["Billing Analysis", "Treatment Verification", "Provider Pattern Detection", "Fraud Indicator Assessment"],
        domain: "Healthcare",
        caseNameTemplate: "Medicare Fraud",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "assisted_living_complaint",
        icon: HandHeart,
        title: "Assisted Living Complaint",
        intakeDescription: "Assisted living should mean assisted, not abandoned.",
        pipelineDescription: "Analyze facility records, care plans, and complaint histories for quality of care issues.",
        capabilities: ["Care Plan Review", "Complaint History Analysis", "Staffing Assessment", "Quality of Care Evaluation"],
        domain: "Elder Care",
        caseNameTemplate: "Assisted Living Complaint",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "elder_neglect",
        icon: HandHeart,
        title: "Elder Neglect",
        intakeDescription: "Neglect is abuse. Let's document it.",
        pipelineDescription: "Analyze care records, medical documentation, and facility reports for neglect indicators.",
        capabilities: ["Care Record Analysis", "Medical Documentation Review", "Facility Report Assessment", "Neglect Pattern Detection"],
        domain: "Elder Care",
        caseNameTemplate: "Elder Neglect",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "long_term_care_insurance",
        icon: Shield,
        title: "Long-Term Care Insurance",
        intakeDescription: "You paid premiums for decades. Let's make sure they pay the claim.",
        pipelineDescription: "Analyze LTC insurance policies, claim denials, and benefit calculations for coverage disputes.",
        capabilities: ["Policy Analysis", "Claim Denial Review", "Benefit Calculation Check", "Coverage Determination"],
        domain: "Insurance",
        caseNameTemplate: "Long-Term Care Insurance",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "elder_self_neglect",
        icon: HandHeart,
        title: "Elder Self-Neglect",
        intakeDescription: "When someone can't care for themselves, the system should step in.",
        pipelineDescription: "Analyze welfare check records, medical documentation, and service referrals for self-neglect cases.",
        capabilities: ["Welfare Check Review", "Medical Documentation Analysis", "Service Referral Assessment", "Capacity Evaluation"],
        domain: "Elder Care",
        caseNameTemplate: "Elder Self-Neglect",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "power_of_attorney_abuse",
        icon: Unlock,
        title: "Power of Attorney Abuse",
        intakeDescription: "Authority was given to help, not to steal.",
        pipelineDescription: "Analyze POA documents, financial transactions, and decision records for abuse of authority.",
        capabilities: ["POA Document Review", "Transaction Analysis", "Decision Record Assessment", "Abuse Pattern Detection"],
        domain: "Elder Care",
        caseNameTemplate: "Power of Attorney Abuse",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "elder_scam_recovery",
        icon: ShieldAlert,
        title: "Elder Scam Recovery",
        intakeDescription: "They were targeted because of their age. Let's trace the scam.",
        pipelineDescription: "Analyze scam communications, financial transactions, and recovery options for elder fraud victims.",
        capabilities: ["Scam Communication Analysis", "Transaction Tracing", "Recovery Option Assessment", "Fraud Pattern Documentation"],
        domain: "Elder Care",
        caseNameTemplate: "Elder Scam Recovery",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
      {
        id: "hospice_care_complaint",
        icon: HeartPulse,
        title: "Hospice Care Complaint",
        intakeDescription: "End-of-life care should be dignified. Let's make sure it was.",
        pipelineDescription: "Analyze hospice care records, medication logs, and family communications for care quality issues.",
        capabilities: ["Care Record Review", "Medication Log Analysis", "Communication Assessment", "Quality Evaluation"],
        domain: "Elder Care",
        caseNameTemplate: "Hospice Care Complaint",
        color: "text-purple-400",
        bgColor: "bg-purple-500/10 hover:bg-purple-500/20",
        borderColor: "border-purple-500/20",
        pipelineBg: "bg-purple-500/5 hover:bg-purple-500/10 border-purple-500/15",
      },
    ],
  },
  {
    id: "vulnerable",
    title: "Vulnerable Populations",
    description: "For those facing systems with less power, less voice, and less time",
    pipelines: [
      {
        id: "immigration_detention",
        icon: Globe,
        title: "Immigration Detention",
        intakeDescription: "Detention shouldn't mean disappearing. Let's track what happened.",
        pipelineDescription: "Analyze detention records, conditions reports, and legal proceedings for rights violations.",
        capabilities: ["Detention Record Analysis", "Conditions Assessment", "Legal Proceeding Review", "Rights Violation Detection"],
        domain: "Immigration",
        caseNameTemplate: "Immigration Detention",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "education_discrimination",
        icon: GraduationCap,
        title: "Education Discrimination",
        intakeDescription: "Every student deserves a fair chance. Let's prove they didn't get one.",
        pipelineDescription: "Analyze school records, disciplinary actions, and communications for discriminatory patterns.",
        capabilities: ["School Record Analysis", "Disciplinary Pattern Review", "Communication Assessment", "Discrimination Pattern Detection"],
        domain: "Education",
        caseNameTemplate: "Education Discrimination",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "disability_rights",
        icon: HeartHandshake,
        title: "Disability Rights",
        intakeDescription: "Accommodation isn't optional. Let's document the failures.",
        pipelineDescription: "Analyze accommodation requests, denial records, and compliance documentation for ADA violations.",
        capabilities: ["Accommodation Request Review", "Denial Analysis", "Compliance Documentation Check", "ADA Violation Assessment"],
        domain: "Civil Rights",
        caseNameTemplate: "Disability Rights",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "language_access_violation",
        icon: Globe,
        title: "Language Access Violation",
        intakeDescription: "Everyone deserves to understand what's happening to them.",
        pipelineDescription: "Analyze service records, interpreter availability, and communication practices for language access compliance.",
        capabilities: ["Service Record Review", "Interpreter Availability Check", "Communication Practice Assessment", "Compliance Evaluation"],
        domain: "Civil Rights",
        caseNameTemplate: "Language Access Violation",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "refugee_asylum",
        icon: Globe,
        title: "Refugee & Asylum",
        intakeDescription: "Fleeing danger shouldn't mean facing more of it.",
        pipelineDescription: "Analyze country condition reports, persecution evidence, and legal filings for asylum cases.",
        capabilities: ["Country Condition Analysis", "Persecution Evidence Review", "Legal Filing Assessment", "Credibility Documentation"],
        domain: "Immigration",
        caseNameTemplate: "Refugee & Asylum",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "immigration_fraud",
        icon: Globe,
        title: "Immigration Fraud",
        intakeDescription: "When someone exploits the immigration system to hurt people.",
        pipelineDescription: "Analyze immigration documents, notario fraud evidence, and visa scam patterns.",
        capabilities: ["Document Fraud Detection", "Notario Fraud Analysis", "Visa Scam Pattern Review", "Victim Documentation"],
        domain: "Immigration",
        caseNameTemplate: "Immigration Fraud",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "visa_denial",
        icon: Globe,
        title: "Visa Denial",
        intakeDescription: "Understanding why they said no — and whether they were right.",
        pipelineDescription: "Analyze visa applications, denial notices, and supporting documentation for appeal preparation.",
        capabilities: ["Application Review", "Denial Analysis", "Documentation Assessment", "Appeal Preparation"],
        domain: "Immigration",
        caseNameTemplate: "Visa Denial",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "deportation_defense",
        icon: Globe,
        title: "Deportation Defense",
        intakeDescription: "Fighting to stay in the only home you know.",
        pipelineDescription: "Analyze immigration history, relief eligibility, and case documentation for deportation defense.",
        capabilities: ["Immigration History Review", "Relief Eligibility Assessment", "Case Documentation Analysis", "Defense Strategy Support"],
        domain: "Immigration",
        caseNameTemplate: "Deportation Defense",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "daca_renewal",
        icon: Globe,
        title: "DACA Renewal",
        intakeDescription: "Your future shouldn't depend on paperwork delays.",
        pipelineDescription: "Analyze DACA renewal applications, supporting documentation, and timeline compliance.",
        capabilities: ["Application Review", "Documentation Verification", "Timeline Compliance Check", "Renewal Support"],
        domain: "Immigration",
        caseNameTemplate: "DACA Renewal",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "unaccompanied_minor",
        icon: Baby,
        title: "Unaccompanied Minor",
        intakeDescription: "Children who crossed alone deserve protection, not punishment.",
        pipelineDescription: "Analyze minor's records, placement documentation, and legal proceedings for child welfare compliance.",
        capabilities: ["Record Analysis", "Placement Review", "Legal Proceeding Assessment", "Welfare Compliance Check"],
        domain: "Immigration",
        caseNameTemplate: "Unaccompanied Minor",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "human_trafficking_victim",
        icon: ShieldAlert,
        title: "Human Trafficking Victim",
        intakeDescription: "Survivors deserve justice. Let's build the evidence.",
        pipelineDescription: "Analyze trafficking indicators, victim documentation, and case evidence for prosecution support.",
        capabilities: ["Trafficking Indicator Analysis", "Victim Documentation", "Evidence Assessment", "Prosecution Support"],
        domain: "Safety",
        caseNameTemplate: "Human Trafficking Victim",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
      {
        id: "migrant_worker_exploitation",
        icon: HardHat,
        title: "Migrant Worker Exploitation",
        intakeDescription: "Workers deserve fair treatment regardless of where they're from.",
        pipelineDescription: "Analyze employment records, wage documentation, and working conditions for exploitation evidence.",
        capabilities: ["Employment Record Review", "Wage Documentation Analysis", "Working Condition Assessment", "Exploitation Pattern Detection"],
        domain: "Employment",
        caseNameTemplate: "Migrant Worker Exploitation",
        color: "text-teal-400",
        bgColor: "bg-teal-500/10 hover:bg-teal-500/20",
        borderColor: "border-teal-500/20",
        pipelineBg: "bg-teal-500/5 hover:bg-teal-500/10 border-teal-500/15",
      },
    ],
  },
  {
    id: "justice",
    title: "Justice & Financial Defense",
    description: "For people fighting systems that profit from denying, delaying, or punishing them",
    pipelines: [
      {
        id: "workers_compensation",
        icon: HardHat,
        title: "Workers' Compensation",
        intakeDescription: "You got hurt on the job. They should cover it.",
        pipelineDescription: "Analyze injury documentation, employer records, and claim history for workers' comp disputes.",
        capabilities: ["Injury Documentation Review", "Employer Record Analysis", "Claim History Assessment", "Benefit Calculation Check"],
        domain: "Employment",
        caseNameTemplate: "Workers' Compensation",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "wrongful_conviction",
        icon: Scale,
        title: "Wrongful Conviction",
        intakeDescription: "The system got it wrong. Let's find the proof.",
        pipelineDescription: "Analyze trial records, evidence handling, and witness testimony for wrongful conviction indicators.",
        capabilities: ["Trial Record Analysis", "Evidence Chain Review", "Witness Testimony Assessment", "Procedural Violation Detection"],
        domain: "Criminal Justice",
        caseNameTemplate: "Wrongful Conviction",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "police_misconduct",
        icon: ShieldAlert,
        title: "Police Misconduct",
        intakeDescription: "Those who enforce the law must also follow it.",
        pipelineDescription: "Analyze body cam footage, incident reports, and complaint records for misconduct patterns.",
        capabilities: ["Incident Report Analysis", "Complaint Record Review", "Use of Force Assessment", "Pattern Detection"],
        domain: "Civil Rights",
        caseNameTemplate: "Police Misconduct",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "bankruptcy_fraud",
        icon: CircleDollarSign,
        title: "Bankruptcy & Debt Defense",
        intakeDescription: "When debt becomes a weapon, the law is your shield.",
        pipelineDescription: "Analyze financial records, creditor communications, and court filings for bankruptcy and debt defense.",
        capabilities: ["Financial Record Analysis", "Creditor Communication Review", "Court Filing Assessment", "Asset Protection Review"],
        domain: "Financial",
        caseNameTemplate: "Bankruptcy & Debt Defense",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "wage_theft",
        icon: Banknote,
        title: "Wage Theft",
        intakeDescription: "You worked the hours. Let's make sure you get paid.",
        pipelineDescription: "Analyze pay records, time sheets, and employment agreements for wage theft evidence.",
        capabilities: ["Pay Record Analysis", "Time Sheet Review", "Employment Agreement Check", "Wage Calculation Verification"],
        domain: "Employment",
        caseNameTemplate: "Wage Theft",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "wrongful_termination",
        icon: Briefcase,
        title: "Wrongful Termination",
        intakeDescription: "Fired without cause? The records will tell the real story.",
        pipelineDescription: "Analyze employment records, termination documentation, and communications for wrongful termination evidence.",
        capabilities: ["Employment Record Review", "Termination Documentation Analysis", "Communication Trail", "Policy Compliance Check"],
        domain: "Employment",
        caseNameTemplate: "Wrongful Termination",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "sexual_harassment_workplace",
        icon: ShieldAlert,
        title: "Sexual Harassment",
        intakeDescription: "No one should endure harassment at work. Let's document it.",
        pipelineDescription: "Analyze workplace communications, HR records, and incident reports for harassment patterns.",
        capabilities: ["Communication Analysis", "HR Record Review", "Incident Documentation", "Pattern Detection"],
        domain: "Employment",
        caseNameTemplate: "Sexual Harassment",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "retaliation_claim",
        icon: Megaphone,
        title: "Retaliation Claim",
        intakeDescription: "Speaking up shouldn't cost you your job.",
        pipelineDescription: "Analyze employment records, timeline of events, and communications for retaliation evidence.",
        capabilities: ["Timeline Analysis", "Employment Record Review", "Communication Assessment", "Retaliation Pattern Detection"],
        domain: "Employment",
        caseNameTemplate: "Retaliation Claim",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "union_grievance",
        icon: Users,
        title: "Union Grievance",
        intakeDescription: "Collective bargaining rights matter. Let's enforce them.",
        pipelineDescription: "Analyze union contracts, grievance records, and employer communications for labor rights violations.",
        capabilities: ["Contract Analysis", "Grievance Record Review", "Communication Assessment", "Rights Violation Detection"],
        domain: "Employment",
        caseNameTemplate: "Union Grievance",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "osha_violation",
        icon: AlertTriangle,
        title: "OSHA Violation",
        intakeDescription: "Unsafe workplaces hurt workers. Let's document the danger.",
        pipelineDescription: "Analyze workplace safety records, inspection reports, and incident documentation for OSHA violations.",
        capabilities: ["Safety Record Review", "Inspection Report Analysis", "Incident Documentation", "Violation Assessment"],
        domain: "Employment",
        caseNameTemplate: "OSHA Violation",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "prison_conditions",
        icon: Building,
        title: "Prison Conditions",
        intakeDescription: "Incarceration shouldn't mean inhumane treatment.",
        pipelineDescription: "Analyze prison records, medical documentation, and grievance filings for conditions violations.",
        capabilities: ["Record Analysis", "Medical Documentation Review", "Grievance Assessment", "Conditions Evaluation"],
        domain: "Criminal Justice",
        caseNameTemplate: "Prison Conditions",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "parole_violation",
        icon: Scale,
        title: "Parole Violation Defense",
        intakeDescription: "Parole violations deserve fair hearings too.",
        pipelineDescription: "Analyze parole records, violation allegations, and hearing documentation for defense preparation.",
        capabilities: ["Parole Record Review", "Violation Analysis", "Hearing Documentation", "Defense Preparation"],
        domain: "Criminal Justice",
        caseNameTemplate: "Parole Violation Defense",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "civil_rights_violation",
        icon: Scale,
        title: "Civil Rights Violation",
        intakeDescription: "Your rights are non-negotiable. Let's prove they were violated.",
        pipelineDescription: "Analyze incident documentation, government records, and communications for civil rights violations.",
        capabilities: ["Incident Documentation", "Government Record Review", "Communication Analysis", "Rights Violation Assessment"],
        domain: "Civil Rights",
        caseNameTemplate: "Civil Rights Violation",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "excessive_force",
        icon: ShieldAlert,
        title: "Excessive Force",
        intakeDescription: "Force should be proportional. Let's measure what happened.",
        pipelineDescription: "Analyze use of force reports, medical records, and witness accounts for excessive force claims.",
        capabilities: ["Force Report Analysis", "Medical Record Review", "Witness Account Assessment", "Proportionality Evaluation"],
        domain: "Civil Rights",
        caseNameTemplate: "Excessive Force",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
      {
        id: "false_arrest",
        icon: Scale,
        title: "False Arrest",
        intakeDescription: "Arrested without cause? The evidence will show it.",
        pipelineDescription: "Analyze arrest records, probable cause documentation, and witness statements for false arrest claims.",
        capabilities: ["Arrest Record Review", "Probable Cause Analysis", "Witness Statement Assessment", "Rights Violation Documentation"],
        domain: "Civil Rights",
        caseNameTemplate: "False Arrest",
        color: "text-orange-400",
        bgColor: "bg-orange-500/10 hover:bg-orange-500/20",
        borderColor: "border-orange-500/20",
        pipelineBg: "bg-orange-500/5 hover:bg-orange-500/10 border-orange-500/15",
      },
    ],
  },
  {
    id: "community",
    title: "Community & Institutional",
    description: "For people and communities fighting institutional failures, from toxic exposure to tax disputes",
    pipelines: [
      {
        id: "environmental_contamination",
        icon: Trees,
        title: "Environmental Contamination",
        intakeDescription: "Your community's health shouldn't be someone else's profit.",
        pipelineDescription: "Analyze environmental reports, health data, and regulatory filings for contamination evidence.",
        capabilities: ["Environmental Report Analysis", "Health Data Correlation", "Regulatory Filing Review", "Contamination Source Mapping"],
        domain: "Environment",
        caseNameTemplate: "Environmental Contamination",
        color: "text-green-400",
        bgColor: "bg-green-500/10 hover:bg-green-500/20",
        borderColor: "border-green-500/20",
        pipelineBg: "bg-green-500/5 hover:bg-green-500/10 border-green-500/15",
      },
      {
        id: "hoa_dispute",
        icon: Building2,
        title: "HOA Dispute",
        intakeDescription: "Your home, your rules — within reason.",
        pipelineDescription: "Analyze HOA bylaws, meeting minutes, and enforcement actions for procedural violations.",
        capabilities: ["Bylaw Analysis", "Meeting Record Review", "Enforcement Action Assessment", "Procedural Compliance Check"],
        domain: "Housing",
        caseNameTemplate: "HOA Dispute",
        color: "text-green-400",
        bgColor: "bg-green-500/10 hover:bg-green-500/20",
        borderColor: "border-green-500/20",
        pipelineBg: "bg-green-500/5 hover:bg-green-500/10 border-green-500/15",
      },
      {
        id: "tax_dispute",
        icon: Receipt,
        title: "Tax Dispute",
        intakeDescription: "The IRS has rules too. Let's make sure they followed them.",
        pipelineDescription: "Analyze tax records, IRS communications, and assessment calculations for dispute resolution.",
        capabilities: ["Tax Record Analysis", "IRS Communication Review", "Assessment Calculation Check", "Dispute Documentation"],
        domain: "Financial",
        caseNameTemplate: "Tax Dispute",
        color: "text-green-400",
        bgColor: "bg-green-500/10 hover:bg-green-500/20",
        borderColor: "border-green-500/20",
        pipelineBg: "bg-green-500/5 hover:bg-green-500/10 border-green-500/15",
      },
      {
        id: "medical_billing_dispute",
        icon: Receipt,
        title: "Medical Billing Dispute",
        intakeDescription: "Healthcare billing shouldn't require a forensic accountant. But here we are.",
        pipelineDescription: "Analyze medical bills, insurance EOBs, and provider records for billing errors and overcharges.",
        capabilities: ["Bill Analysis", "EOB Comparison", "Provider Record Review", "Overcharge Detection"],
        domain: "Healthcare",
        caseNameTemplate: "Medical Billing Dispute",
        color: "text-green-400",
        bgColor: "bg-green-500/10 hover:bg-green-500/20",
        borderColor: "border-green-500/20",
        pipelineBg: "bg-green-500/5 hover:bg-green-500/10 border-green-500/15",
      },
      {
        id: "school_district_complaint",
        icon: GraduationCap,
        title: "School District Complaint",
        intakeDescription: "Schools should educate, not discriminate.",
        pipelineDescription: "Analyze school policies, student records, and communications for institutional failures.",
        capabilities: ["Policy Analysis", "Student Record Review", "Communication Assessment", "Compliance Evaluation"],
        domain: "Education",
        caseNameTemplate: "School District Complaint",
        color: "text-green-400",
        bgColor: "bg-green-500/10 hover:bg-green-500/20",
        borderColor: "border-green-500/20",
        pipelineBg: "bg-green-500/5 hover:bg-green-500/10 border-green-500/15",
      },
      {
        id: "zoning_dispute",
        icon: MapPin,
        title: "Zoning Dispute",
        intakeDescription: "Land use decisions affect entire communities.",
        pipelineDescription: "Analyze zoning regulations, permit records, and hearing documentation for dispute resolution.",
        capabilities: ["Regulation Analysis", "Permit Record Review", "Hearing Documentation", "Impact Assessment"],
        domain: "Government",
        caseNameTemplate: "Zoning Dispute",
        color: "text-green-400",
        bgColor: "bg-green-500/10 hover:bg-green-500/20",
        borderColor: "border-green-500/20",
        pipelineBg: "bg-green-500/5 hover:bg-green-500/10 border-green-500/15",
      },
      {
        id: "eminent_domain",
        icon: MapPin,
        title: "Eminent Domain",
        intakeDescription: "Your property rights matter, even when the government wants your land.",
        pipelineDescription: "Analyze appraisals, government filings, and compensation offers for eminent domain challenges.",
        capabilities: ["Appraisal Review", "Government Filing Analysis", "Compensation Assessment", "Rights Protection"],
        domain: "Government",
        caseNameTemplate: "Eminent Domain",
        color: "text-green-400",
        bgColor: "bg-green-500/10 hover:bg-green-500/20",
        borderColor: "border-green-500/20",
        pipelineBg: "bg-green-500/5 hover:bg-green-500/10 border-green-500/15",
      },
      {
        id: "public_records_denial",
        icon: FileText,
        title: "Public Records Denial",
        intakeDescription: "Public records should be public. Let's enforce that.",
        pipelineDescription: "Analyze FOIA/public records requests, denial rationale, and exemption claims for appeal preparation.",
        capabilities: ["Request Analysis", "Denial Rationale Review", "Exemption Claim Assessment", "Appeal Preparation"],
        domain: "Government",
        caseNameTemplate: "Public Records Denial",
        color: "text-green-400",
        bgColor: "bg-green-500/10 hover:bg-green-500/20",
        borderColor: "border-green-500/20",
        pipelineBg: "bg-green-500/5 hover:bg-green-500/10 border-green-500/15",
      },
      {
        id: "government_contract_fraud",
        icon: Building,
        title: "Government Contract Fraud",
        intakeDescription: "Taxpayer money shouldn't fund fraud.",
        pipelineDescription: "Analyze contract documentation, billing records, and performance reports for fraud indicators.",
        capabilities: ["Contract Analysis", "Billing Review", "Performance Assessment", "Fraud Indicator Detection"],
        domain: "Government",
        caseNameTemplate: "Government Contract Fraud",
        color: "text-green-400",
        bgColor: "bg-green-500/10 hover:bg-green-500/20",
        borderColor: "border-green-500/20",
        pipelineBg: "bg-green-500/5 hover:bg-green-500/10 border-green-500/15",
      },
    ],
  },
  {
    id: "systemic",
    title: "Systemic Accountability",
    description: "For people exposing wrongdoing, fighting exploitative practices, or holding organizations accountable",
    pipelines: [
      {
        id: "predatory_lending",
        icon: CircleDollarSign,
        title: "Predatory Lending",
        intakeDescription: "When loans are designed to trap, not help.",
        pipelineDescription: "Analyze loan documents, interest calculations, and lending patterns for predatory practices.",
        capabilities: ["Loan Document Analysis", "Interest Calculation Review", "Lending Pattern Detection", "Regulatory Violation Check"],
        domain: "Financial",
        caseNameTemplate: "Predatory Lending",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "whistleblower_retaliation",
        icon: Megaphone,
        title: "Whistleblower Retaliation",
        intakeDescription: "Doing the right thing shouldn't cost you everything.",
        pipelineDescription: "Analyze employment records, disclosure documentation, and retaliation timeline for whistleblower protection.",
        capabilities: ["Disclosure Documentation", "Retaliation Timeline Analysis", "Employment Record Review", "Protection Assessment"],
        domain: "Employment",
        caseNameTemplate: "Whistleblower Retaliation",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "nonprofit_fraud",
        icon: Building2,
        title: "Nonprofit Fraud",
        intakeDescription: "Charitable donations should go to charitable work.",
        pipelineDescription: "Analyze nonprofit financial records, IRS filings, and governance documents for fraud indicators.",
        capabilities: ["Financial Record Analysis", "IRS Filing Review", "Governance Assessment", "Fund Diversion Detection"],
        domain: "Financial",
        caseNameTemplate: "Nonprofit Fraud",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "securities_fraud",
        icon: TrendingDown,
        title: "Securities Fraud",
        intakeDescription: "Investors deserve honest markets.",
        pipelineDescription: "Analyze trading records, financial statements, and communications for securities fraud indicators.",
        capabilities: ["Trading Record Analysis", "Financial Statement Review", "Communication Assessment", "Fraud Pattern Detection"],
        domain: "Financial",
        caseNameTemplate: "Securities Fraud",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "antitrust_violation",
        icon: Scale,
        title: "Antitrust Violation",
        intakeDescription: "Competition keeps markets fair. Let's prove it was suppressed.",
        pipelineDescription: "Analyze market data, communications, and business practices for antitrust violations.",
        capabilities: ["Market Data Analysis", "Communication Review", "Business Practice Assessment", "Competition Impact Evaluation"],
        domain: "Financial",
        caseNameTemplate: "Antitrust Violation",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "corporate_fraud",
        icon: Building,
        title: "Corporate Fraud",
        intakeDescription: "When corporations cook the books, the evidence is in the details.",
        pipelineDescription: "Analyze financial statements, internal communications, and audit records for corporate fraud.",
        capabilities: ["Financial Statement Analysis", "Communication Review", "Audit Record Assessment", "Fraud Pattern Detection"],
        domain: "Financial",
        caseNameTemplate: "Corporate Fraud",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "insurance_fraud_investigation",
        icon: Shield,
        title: "Insurance Fraud Investigation",
        intakeDescription: "Fraud hurts everyone. Let's find the evidence.",
        pipelineDescription: "Analyze insurance claims, billing patterns, and provider records for fraud indicators.",
        capabilities: ["Claim Analysis", "Billing Pattern Review", "Provider Record Assessment", "Fraud Indicator Detection"],
        domain: "Insurance",
        caseNameTemplate: "Insurance Fraud Investigation",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "money_laundering",
        icon: CircleDollarSign,
        title: "Money Laundering",
        intakeDescription: "Following the money to find the truth.",
        pipelineDescription: "Analyze financial transactions, account structures, and business records for money laundering indicators.",
        capabilities: ["Transaction Analysis", "Account Structure Review", "Business Record Assessment", "Laundering Pattern Detection"],
        domain: "Financial",
        caseNameTemplate: "Money Laundering",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "price_fixing",
        icon: TrendingDown,
        title: "Price Fixing",
        intakeDescription: "When competitors collude, consumers pay.",
        pipelineDescription: "Analyze pricing data, communications, and market patterns for price fixing evidence.",
        capabilities: ["Pricing Data Analysis", "Communication Review", "Market Pattern Assessment", "Collusion Evidence Detection"],
        domain: "Financial",
        caseNameTemplate: "Price Fixing",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "market_manipulation",
        icon: TrendingDown,
        title: "Market Manipulation",
        intakeDescription: "Markets should be fair. Let's prove they weren't.",
        pipelineDescription: "Analyze trading data, communications, and market activity for manipulation indicators.",
        capabilities: ["Trading Data Analysis", "Communication Review", "Market Activity Assessment", "Manipulation Pattern Detection"],
        domain: "Financial",
        caseNameTemplate: "Market Manipulation",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "agricultural_exploitation",
        icon: Wheat,
        title: "Agricultural Exploitation",
        intakeDescription: "Farm workers feed the nation. They deserve protection.",
        pipelineDescription: "Analyze employment records, working conditions, and wage documentation for agricultural worker exploitation.",
        capabilities: ["Employment Record Review", "Working Condition Assessment", "Wage Documentation Analysis", "Exploitation Pattern Detection"],
        domain: "Employment",
        caseNameTemplate: "Agricultural Exploitation",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
    ],
  },
  {
    id: "tribal",
    title: "Tribal Law / Indigenous Rights",
    description: "For tribal members, families, and advocates navigating the intersection of tribal, state, and federal systems",
    pipelines: [
      {
        id: "icwa_compliance",
        icon: Feather,
        title: "ICWA Compliance",
        intakeDescription: "The Indian Child Welfare Act exists for a reason. Let's make sure it's followed.",
        pipelineDescription: "Analyze child welfare proceedings for ICWA compliance, including notice requirements, placement preferences, and active efforts.",
        capabilities: ["ICWA Notice Verification", "Placement Preference Analysis", "Active Efforts Assessment", "Tribal Notification Tracking"],
        domain: "Tribal Law",
        caseNameTemplate: "ICWA Compliance",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "tribal_sovereignty",
        icon: Feather,
        title: "Tribal Sovereignty",
        intakeDescription: "Sovereignty isn't granted — it's inherent. Let's defend it.",
        pipelineDescription: "Analyze jurisdictional disputes, federal recognition issues, and sovereignty challenges.",
        capabilities: ["Jurisdictional Analysis", "Federal Recognition Review", "Sovereignty Challenge Assessment", "Treaty Interpretation"],
        domain: "Tribal Law",
        caseNameTemplate: "Tribal Sovereignty",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "mmiw_investigation",
        icon: ShieldAlert,
        title: "MMIW Investigation",
        intakeDescription: "Missing and murdered Indigenous women deserve answers.",
        pipelineDescription: "Analyze law enforcement records, jurisdictional gaps, and investigation timelines for MMIW cases.",
        capabilities: ["Law Enforcement Record Review", "Jurisdictional Gap Analysis", "Investigation Timeline Assessment", "Cross-Agency Coordination Check"],
        domain: "Tribal Law",
        caseNameTemplate: "MMIW Investigation",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "treaty_rights",
        icon: ScrollText,
        title: "Treaty Rights",
        intakeDescription: "Treaties are the supreme law of the land. Let's enforce them.",
        pipelineDescription: "Analyze treaty language, federal actions, and historical records for treaty rights enforcement.",
        capabilities: ["Treaty Language Analysis", "Federal Action Review", "Historical Record Assessment", "Rights Enforcement Support"],
        domain: "Tribal Law",
        caseNameTemplate: "Treaty Rights",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "tribal_land_dispute",
        icon: MapPin,
        title: "Tribal Land Dispute",
        intakeDescription: "Land is more than property — it's identity.",
        pipelineDescription: "Analyze land records, allotment history, and federal trust responsibilities for tribal land disputes.",
        capabilities: ["Land Record Analysis", "Allotment History Review", "Trust Responsibility Assessment", "Boundary Determination"],
        domain: "Tribal Law",
        caseNameTemplate: "Tribal Land Dispute",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "tribal_enrollment",
        icon: BookOpen,
        title: "Tribal Enrollment",
        intakeDescription: "Belonging to a nation is a right, not a privilege.",
        pipelineDescription: "Analyze enrollment criteria, membership records, and tribal constitution provisions for enrollment disputes.",
        capabilities: ["Enrollment Criteria Review", "Membership Record Analysis", "Constitutional Provision Assessment", "Eligibility Determination"],
        domain: "Tribal Law",
        caseNameTemplate: "Tribal Enrollment",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "tribal_housing",
        icon: Tent,
        title: "Tribal Housing",
        intakeDescription: "Safe housing on tribal lands is a federal obligation.",
        pipelineDescription: "Analyze HUD-NAHASDA compliance, housing conditions, and federal funding allocation for tribal housing issues.",
        capabilities: ["HUD Compliance Check", "Housing Condition Assessment", "Funding Allocation Review", "Maintenance Record Analysis"],
        domain: "Tribal Law",
        caseNameTemplate: "Tribal Housing",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "indian_health_service",
        icon: HeartPulse,
        title: "Indian Health Service",
        intakeDescription: "Healthcare is a treaty right. Let's make sure IHS delivers.",
        pipelineDescription: "Analyze IHS records, service delivery, and funding compliance for healthcare access issues.",
        capabilities: ["IHS Record Review", "Service Delivery Assessment", "Funding Compliance Check", "Access Gap Analysis"],
        domain: "Tribal Law",
        caseNameTemplate: "Indian Health Service",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "tribal_water_rights",
        icon: Trees,
        title: "Tribal Water Rights",
        intakeDescription: "Water is life. Tribal water rights must be protected.",
        pipelineDescription: "Analyze water rights settlements, usage data, and federal obligations for tribal water disputes.",
        capabilities: ["Settlement Analysis", "Usage Data Review", "Federal Obligation Assessment", "Rights Protection Support"],
        domain: "Tribal Law",
        caseNameTemplate: "Tribal Water Rights",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
      {
        id: "sacred_site_protection",
        icon: Trees,
        title: "Sacred Site Protection",
        intakeDescription: "Sacred places deserve legal protection.",
        pipelineDescription: "Analyze NHPA compliance, environmental assessments, and federal consultation requirements for sacred site cases.",
        capabilities: ["NHPA Compliance Review", "Environmental Assessment Analysis", "Consultation Requirement Check", "Protection Strategy Support"],
        domain: "Tribal Law",
        caseNameTemplate: "Sacred Site Protection",
        color: "text-amber-400",
        bgColor: "bg-amber-500/10 hover:bg-amber-500/20",
        borderColor: "border-amber-500/20",
        pipelineBg: "bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/15",
      },
    ],
  },
  {
    id: "safety",
    title: "Public Safety",
    description: "For people in danger who need immediate documentation and protection",
    pipelines: [
      {
        id: "missing_persons",
        icon: Search,
        title: "Missing Persons",
        intakeDescription: "Every missing person deserves a thorough search.",
        pipelineDescription: "Analyze missing person reports, investigation records, and communication trails for case advancement.",
        capabilities: ["Report Analysis", "Investigation Record Review", "Communication Trail Assessment", "Lead Documentation"],
        domain: "Safety",
        caseNameTemplate: "Missing Persons",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "domestic_violence_shelter",
        icon: ShieldAlert,
        title: "DV Shelter & Safety Planning",
        intakeDescription: "Safety first. Let's build a protection plan.",
        pipelineDescription: "Analyze safety needs, shelter availability, and protective order options for DV survivors.",
        capabilities: ["Safety Assessment", "Shelter Resource Mapping", "Protective Order Review", "Safety Plan Documentation"],
        domain: "Safety",
        caseNameTemplate: "DV Shelter & Safety Planning",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "stalking_harassment",
        icon: ShieldAlert,
        title: "Stalking & Harassment",
        intakeDescription: "Persistent harassment is a crime. Let's document the pattern.",
        pipelineDescription: "Analyze communication records, incident reports, and surveillance evidence for stalking documentation.",
        capabilities: ["Communication Pattern Analysis", "Incident Documentation", "Surveillance Evidence Review", "Pattern Documentation"],
        domain: "Safety",
        caseNameTemplate: "Stalking & Harassment",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "emergency_protective_order",
        icon: Shield,
        title: "Emergency Protective Order",
        intakeDescription: "When you need protection now, not later.",
        pipelineDescription: "Analyze threat evidence, incident documentation, and legal requirements for emergency protective orders.",
        capabilities: ["Threat Assessment", "Incident Documentation", "Legal Requirement Review", "Order Preparation"],
        domain: "Safety",
        caseNameTemplate: "Emergency Protective Order",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "victim_compensation",
        icon: HeartHandshake,
        title: "Victim Compensation",
        intakeDescription: "Crime victims deserve financial support for their recovery.",
        pipelineDescription: "Analyze victim compensation applications, expense documentation, and eligibility requirements.",
        capabilities: ["Application Review", "Expense Documentation", "Eligibility Assessment", "Compensation Calculation"],
        domain: "Safety",
        caseNameTemplate: "Victim Compensation",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "witness_protection",
        icon: ShieldAlert,
        title: "Witness Protection",
        intakeDescription: "Witnesses who come forward deserve to be safe.",
        pipelineDescription: "Analyze threat assessments, protection needs, and program eligibility for witness safety.",
        capabilities: ["Threat Assessment", "Protection Need Analysis", "Program Eligibility Review", "Safety Plan Documentation"],
        domain: "Safety",
        caseNameTemplate: "Witness Protection",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "hate_crime",
        icon: ShieldAlert,
        title: "Hate Crime",
        intakeDescription: "Hate-motivated violence demands thorough documentation.",
        pipelineDescription: "Analyze incident evidence, bias indicators, and law enforcement response for hate crime cases.",
        capabilities: ["Incident Evidence Review", "Bias Indicator Analysis", "Law Enforcement Response Assessment", "Documentation Support"],
        domain: "Safety",
        caseNameTemplate: "Hate Crime",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "gun_violence_prevention",
        icon: ShieldAlert,
        title: "Gun Violence Prevention",
        intakeDescription: "Communities deserve safety from gun violence.",
        pipelineDescription: "Analyze incident data, policy compliance, and prevention program effectiveness.",
        capabilities: ["Incident Data Analysis", "Policy Compliance Review", "Prevention Program Assessment", "Community Impact Evaluation"],
        domain: "Safety",
        caseNameTemplate: "Gun Violence Prevention",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "campus_safety",
        icon: GraduationCap,
        title: "Campus Safety",
        intakeDescription: "Students deserve safe learning environments.",
        pipelineDescription: "Analyze campus incident reports, Title IX compliance, and safety policy implementation.",
        capabilities: ["Incident Report Review", "Title IX Compliance Check", "Safety Policy Assessment", "Response Evaluation"],
        domain: "Education",
        caseNameTemplate: "Campus Safety",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "workplace_violence",
        icon: AlertTriangle,
        title: "Workplace Violence",
        intakeDescription: "No one should fear for their safety at work.",
        pipelineDescription: "Analyze workplace incident reports, threat assessments, and employer response documentation.",
        capabilities: ["Incident Report Review", "Threat Assessment", "Employer Response Analysis", "Safety Protocol Evaluation"],
        domain: "Employment",
        caseNameTemplate: "Workplace Violence",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
      {
        id: "cyberstalking",
        icon: Globe,
        title: "Cyberstalking",
        intakeDescription: "Online harassment is real harassment. Let's preserve the evidence.",
        pipelineDescription: "Analyze digital communications, social media activity, and online harassment patterns.",
        capabilities: ["Digital Communication Analysis", "Social Media Activity Review", "Harassment Pattern Detection", "Evidence Preservation"],
        domain: "Safety",
        caseNameTemplate: "Cyberstalking",
        color: "text-red-400",
        bgColor: "bg-red-500/10 hover:bg-red-500/20",
        borderColor: "border-red-500/20",
        pipelineBg: "bg-red-500/5 hover:bg-red-500/10 border-red-500/15",
      },
    ],
  },
  {
    id: "healthcare",
    title: "Healthcare & Insurance",
    description: "When the system that's supposed to heal you becomes the problem",
    pipelines: [
      {
        id: "health_insurance_denial",
        icon: Shield,
        title: "Health Insurance Denial",
        intakeDescription: "Your health plan said no. Let's find out if they were wrong.",
        pipelineDescription: "Analyze health insurance denials, policy terms, and medical necessity documentation.",
        capabilities: ["Denial Analysis", "Policy Term Review", "Medical Necessity Assessment", "Appeal Preparation"],
        domain: "Healthcare",
        caseNameTemplate: "Health Insurance Denial",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "hospital_billing_fraud",
        icon: Receipt,
        title: "Hospital Billing Fraud",
        intakeDescription: "When hospitals charge for care they didn't provide.",
        pipelineDescription: "Analyze hospital billing records, treatment documentation, and coding practices for fraud indicators.",
        capabilities: ["Billing Record Analysis", "Treatment Verification", "Coding Practice Review", "Fraud Indicator Detection"],
        domain: "Healthcare",
        caseNameTemplate: "Hospital Billing Fraud",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "pharmacy_error",
        icon: AlertTriangle,
        title: "Pharmacy Error",
        intakeDescription: "Medication errors can be life-threatening. Let's document what happened.",
        pipelineDescription: "Analyze prescription records, dispensing logs, and adverse event documentation for pharmacy errors.",
        capabilities: ["Prescription Record Review", "Dispensing Log Analysis", "Adverse Event Documentation", "Error Pattern Detection"],
        domain: "Healthcare",
        caseNameTemplate: "Pharmacy Error",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "medical_device_failure",
        icon: AlertTriangle,
        title: "Medical Device Failure",
        intakeDescription: "When a medical device fails, the manufacturer must answer.",
        pipelineDescription: "Analyze device records, adverse event reports, and manufacturer communications for device failure cases.",
        capabilities: ["Device Record Review", "Adverse Event Analysis", "Manufacturer Communication Trail", "Failure Pattern Detection"],
        domain: "Healthcare",
        caseNameTemplate: "Medical Device Failure",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "mental_health_parity",
        icon: HeartPulse,
        title: "Mental Health Parity",
        intakeDescription: "Mental health coverage should equal physical health coverage.",
        pipelineDescription: "Analyze insurance coverage, denial patterns, and parity compliance for mental health claims.",
        capabilities: ["Coverage Analysis", "Denial Pattern Review", "Parity Compliance Check", "Appeal Preparation"],
        domain: "Healthcare",
        caseNameTemplate: "Mental Health Parity",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "substance_abuse_treatment",
        icon: HeartPulse,
        title: "Substance Abuse Treatment",
        intakeDescription: "Treatment access shouldn't be blocked by insurance barriers.",
        pipelineDescription: "Analyze treatment records, insurance denials, and coverage requirements for substance abuse care.",
        capabilities: ["Treatment Record Review", "Insurance Denial Analysis", "Coverage Requirement Check", "Access Assessment"],
        domain: "Healthcare",
        caseNameTemplate: "Substance Abuse Treatment",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "clinical_trial_harm",
        icon: Stethoscope,
        title: "Clinical Trial Harm",
        intakeDescription: "Research participants deserve protection and accountability.",
        pipelineDescription: "Analyze informed consent, trial protocols, and adverse event documentation for clinical trial harm.",
        capabilities: ["Consent Review", "Protocol Analysis", "Adverse Event Documentation", "Accountability Assessment"],
        domain: "Healthcare",
        caseNameTemplate: "Clinical Trial Harm",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "telemedicine_malpractice",
        icon: Stethoscope,
        title: "Telemedicine Malpractice",
        intakeDescription: "Virtual care still requires real standards.",
        pipelineDescription: "Analyze telemedicine records, standard of care compliance, and patient outcomes for malpractice cases.",
        capabilities: ["Record Review", "Standard of Care Assessment", "Patient Outcome Analysis", "Malpractice Documentation"],
        domain: "Healthcare",
        caseNameTemplate: "Telemedicine Malpractice",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "dental_malpractice",
        icon: Stethoscope,
        title: "Dental Malpractice",
        intakeDescription: "Dental care gone wrong deserves accountability.",
        pipelineDescription: "Analyze dental records, treatment plans, and outcomes for malpractice evidence.",
        capabilities: ["Record Review", "Treatment Plan Analysis", "Outcome Assessment", "Malpractice Documentation"],
        domain: "Healthcare",
        caseNameTemplate: "Dental Malpractice",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "nursing_malpractice",
        icon: Stethoscope,
        title: "Nursing Malpractice",
        intakeDescription: "Nursing care failures can cause serious harm.",
        pipelineDescription: "Analyze nursing records, care plans, and incident reports for malpractice evidence.",
        capabilities: ["Nursing Record Review", "Care Plan Analysis", "Incident Report Assessment", "Malpractice Documentation"],
        domain: "Healthcare",
        caseNameTemplate: "Nursing Malpractice",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "ambulance_billing",
        icon: Receipt,
        title: "Ambulance Billing",
        intakeDescription: "Emergency transport shouldn't bankrupt you.",
        pipelineDescription: "Analyze ambulance billing records, insurance coverage, and balance billing practices.",
        capabilities: ["Billing Record Analysis", "Coverage Review", "Balance Billing Assessment", "Overcharge Detection"],
        domain: "Healthcare",
        caseNameTemplate: "Ambulance Billing",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
      {
        id: "prior_authorization_denial",
        icon: Shield,
        title: "Prior Authorization Denial",
        intakeDescription: "When insurance delays care with paperwork.",
        pipelineDescription: "Analyze prior authorization requests, denial rationale, and medical necessity documentation.",
        capabilities: ["Request Analysis", "Denial Rationale Review", "Medical Necessity Assessment", "Appeal Preparation"],
        domain: "Healthcare",
        caseNameTemplate: "Prior Authorization Denial",
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/10 hover:bg-emerald-500/20",
        borderColor: "border-emerald-500/20",
        pipelineBg: "bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/15",
      },
    ],
  },
  {
    id: "lgbtq",
    title: "LGBTQ+ Rights",
    description: "For people facing discrimination, barriers, or harm because of who they are or who they love",
    pipelines: [
      {
        id: "lgbtq_discrimination",
        icon: HeartHandshake,
        title: "LGBTQ+ Discrimination",
        intakeDescription: "Discrimination based on who you are is never acceptable.",
        pipelineDescription: "Analyze employment, housing, and service records for discrimination based on sexual orientation or gender identity.",
        capabilities: ["Record Analysis", "Discrimination Pattern Detection", "Communication Review", "Rights Violation Assessment"],
        domain: "Civil Rights",
        caseNameTemplate: "LGBTQ+ Discrimination",
        color: "text-violet-400",
        bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
        borderColor: "border-violet-500/20",
        pipelineBg: "bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/15",
      },
      {
        id: "conversion_therapy_harm",
        icon: ShieldAlert,
        title: "Conversion Therapy Harm",
        intakeDescription: "Survivors of conversion therapy deserve justice.",
        pipelineDescription: "Analyze therapy records, provider documentation, and harm evidence for conversion therapy cases.",
        capabilities: ["Therapy Record Review", "Provider Documentation Analysis", "Harm Evidence Assessment", "Accountability Documentation"],
        domain: "Healthcare",
        caseNameTemplate: "Conversion Therapy Harm",
        color: "text-violet-400",
        bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
        borderColor: "border-violet-500/20",
        pipelineBg: "bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/15",
      },
      {
        id: "gender_marker_change",
        icon: FileText,
        title: "Gender Marker Change",
        intakeDescription: "Your identity documents should reflect who you are.",
        pipelineDescription: "Analyze legal requirements, court filings, and agency documentation for name and gender marker changes.",
        capabilities: ["Legal Requirement Review", "Court Filing Preparation", "Agency Documentation Assessment", "Process Guidance"],
        domain: "Legal",
        caseNameTemplate: "Gender Marker Change",
        color: "text-violet-400",
        bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
        borderColor: "border-violet-500/20",
        pipelineBg: "bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/15",
      },
      {
        id: "lgbtq_healthcare_denial",
        icon: HeartPulse,
        title: "LGBTQ+ Healthcare Denial",
        intakeDescription: "Gender-affirming care is healthcare. Period.",
        pipelineDescription: "Analyze insurance denials, medical necessity documentation, and provider records for healthcare access.",
        capabilities: ["Denial Analysis", "Medical Necessity Review", "Provider Record Assessment", "Appeal Preparation"],
        domain: "Healthcare",
        caseNameTemplate: "LGBTQ+ Healthcare Denial",
        color: "text-violet-400",
        bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
        borderColor: "border-violet-500/20",
        pipelineBg: "bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/15",
      },
      {
        id: "lgbtq_family_recognition",
        icon: Heart,
        title: "LGBTQ+ Family Recognition",
        intakeDescription: "Love makes a family. The law should recognize that.",
        pipelineDescription: "Analyze marriage recognition, adoption records, and parental rights documentation for family law matters.",
        capabilities: ["Marriage Recognition Review", "Adoption Record Analysis", "Parental Rights Assessment", "Legal Documentation"],
        domain: "Family Court",
        caseNameTemplate: "LGBTQ+ Family Recognition",
        color: "text-violet-400",
        bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
        borderColor: "border-violet-500/20",
        pipelineBg: "bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/15",
      },
      {
        id: "lgbtq_housing_discrimination",
        icon: Home,
        title: "LGBTQ+ Housing Discrimination",
        intakeDescription: "Home is where you should feel safe, not discriminated against.",
        pipelineDescription: "Analyze housing applications, landlord communications, and rental records for SOGI-based discrimination.",
        capabilities: ["Application Review", "Communication Analysis", "Rental Record Assessment", "Discrimination Pattern Detection"],
        domain: "Housing",
        caseNameTemplate: "LGBTQ+ Housing Discrimination",
        color: "text-violet-400",
        bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
        borderColor: "border-violet-500/20",
        pipelineBg: "bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/15",
      },
      {
        id: "lgbtq_workplace_harassment",
        icon: HardHat,
        title: "LGBTQ+ Workplace Harassment",
        intakeDescription: "The workplace should be safe for everyone.",
        pipelineDescription: "Analyze workplace communications, HR records, and incident reports for SOGI-based harassment.",
        capabilities: ["Communication Analysis", "HR Record Review", "Incident Documentation", "Harassment Pattern Detection"],
        domain: "Employment",
        caseNameTemplate: "LGBTQ+ Workplace Harassment",
        color: "text-violet-400",
        bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
        borderColor: "border-violet-500/20",
        pipelineBg: "bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/15",
      },
      {
        id: "lgbtq_youth_protection",
        icon: Baby,
        title: "LGBTQ+ Youth Protection",
        intakeDescription: "Every young person deserves to be safe and supported.",
        pipelineDescription: "Analyze school records, foster care documentation, and family court filings for LGBTQ+ youth protection.",
        capabilities: ["School Record Review", "Foster Care Documentation", "Court Filing Analysis", "Protection Assessment"],
        domain: "Youth Services",
        caseNameTemplate: "LGBTQ+ Youth Protection",
        color: "text-violet-400",
        bgColor: "bg-violet-500/10 hover:bg-violet-500/20",
        borderColor: "border-violet-500/20",
        pipelineBg: "bg-violet-500/5 hover:bg-violet-500/10 border-violet-500/15",
      },
    ],
  },
  {
    id: "general",
    title: "General Investigation",
    description: "When your situation doesn't fit a category — the engine adapts to you",
    pipelines: [
      {
        id: "other",
        icon: Search,
        title: "General Investigation",
        intakeDescription: "Your situation is unique. The engine adapts to you.",
        pipelineDescription: "Flexible analysis pipeline that adapts to your specific evidence and situation.",
        capabilities: ["Adaptive Document Analysis", "Cross-Reference Detection", "Timeline Reconstruction", "Pattern Recognition"],
        domain: "General",
        caseNameTemplate: "General Investigation",
        color: "text-slate-400",
        bgColor: "bg-slate-500/10 hover:bg-slate-500/20",
        borderColor: "border-slate-500/20",
        pipelineBg: "bg-slate-500/5 hover:bg-slate-500/10 border-slate-500/15",
      },
      {
        id: "cross_border_dispute",
        icon: Globe,
        title: "Cross-Border Dispute",
        intakeDescription: "When your case crosses state or national lines.",
        pipelineDescription: "Analyze multi-jurisdictional evidence, conflict of laws, and cross-border documentation.",
        capabilities: ["Jurisdictional Analysis", "Conflict of Laws Review", "Cross-Border Documentation", "Multi-System Coordination"],
        domain: "Legal",
        caseNameTemplate: "Cross-Border Dispute",
        color: "text-slate-400",
        bgColor: "bg-slate-500/10 hover:bg-slate-500/20",
        borderColor: "border-slate-500/20",
        pipelineBg: "bg-slate-500/5 hover:bg-slate-500/10 border-slate-500/15",
      },
      {
        id: "multi_party_litigation",
        icon: Users,
        title: "Multi-Party Litigation",
        intakeDescription: "Complex cases with many parties need organized evidence.",
        pipelineDescription: "Analyze evidence across multiple parties, claims, and counterclaims for litigation support.",
        capabilities: ["Multi-Party Evidence Organization", "Claim Cross-Reference", "Counterclaim Analysis", "Party Relationship Mapping"],
        domain: "Legal",
        caseNameTemplate: "Multi-Party Litigation",
        color: "text-slate-400",
        bgColor: "bg-slate-500/10 hover:bg-slate-500/20",
        borderColor: "border-slate-500/20",
        pipelineBg: "bg-slate-500/5 hover:bg-slate-500/10 border-slate-500/15",
      },
      {
        id: "class_action_research",
        icon: Scale,
        title: "Class Action Research",
        intakeDescription: "When many people share the same harm.",
        pipelineDescription: "Analyze class certification requirements, common issues, and representative claims for class action support.",
        capabilities: ["Certification Analysis", "Common Issue Identification", "Representative Claim Assessment", "Class Definition Support"],
        domain: "Legal",
        caseNameTemplate: "Class Action Research",
        color: "text-slate-400",
        bgColor: "bg-slate-500/10 hover:bg-slate-500/20",
        borderColor: "border-slate-500/20",
        pipelineBg: "bg-slate-500/5 hover:bg-slate-500/10 border-slate-500/15",
      },
      {
        id: "regulatory_investigation",
        icon: ClipboardCheck,
        title: "Regulatory Investigation",
        intakeDescription: "When regulators need to be held accountable too.",
        pipelineDescription: "Analyze regulatory actions, compliance records, and enforcement patterns for investigation support.",
        capabilities: ["Regulatory Action Review", "Compliance Record Analysis", "Enforcement Pattern Assessment", "Investigation Support"],
        domain: "Government",
        caseNameTemplate: "Regulatory Investigation",
        color: "text-slate-400",
        bgColor: "bg-slate-500/10 hover:bg-slate-500/20",
        borderColor: "border-slate-500/20",
        pipelineBg: "bg-slate-500/5 hover:bg-slate-500/10 border-slate-500/15",
      },
      {
        id: "compliance_audit",
        icon: ClipboardCheck,
        title: "Compliance Audit",
        intakeDescription: "Making sure organizations follow the rules.",
        pipelineDescription: "Analyze organizational records, policies, and practices for regulatory compliance assessment.",
        capabilities: ["Record Review", "Policy Analysis", "Practice Assessment", "Compliance Evaluation"],
        domain: "Government",
        caseNameTemplate: "Compliance Audit",
        color: "text-slate-400",
        bgColor: "bg-slate-500/10 hover:bg-slate-500/20",
        borderColor: "border-slate-500/20",
        pipelineBg: "bg-slate-500/5 hover:bg-slate-500/10 border-slate-500/15",
      },
    ],
  },
];

/* Flat list for quick lookup */
const ALL_PIPELINES = CATEGORIES.flatMap((c) => c.pipelines);

/* ─── Resume Card ─── */

function ResumeCard({
  caseData,
  onNavigate,
}: {
  caseData: { id: number; name: string; description: string | null; status: string; updatedAt: number };
  onNavigate: (path: string) => void;
}) {
  const { data: stats } = trpc.cases.stats.useQuery({ caseId: caseData.id });
  const { data: intakeStatus } = trpc.analyze.getIntakeSpineStatus.useQuery(
    { caseId: caseData.id },
    { retry: false },
  );

  const docCount = stats?.documents ?? 0;
  const findingCount = stats?.findings ?? 0;
  const hasIntakeExecution = (intakeStatus ?? []).some(
    (session) => session.session_type === "live" && session.execution_complete,
  );

  let step = 0;
  let stepLabel = "Upload Documents";
  let stepIcon = <Upload className="h-3.5 w-3.5 text-muted-foreground" />;

  if (docCount > 0 && findingCount === 0) {
    step = 1;
    stepLabel = "Open Intake Spine";
    stepIcon = <Shield className="h-3.5 w-3.5 text-primary" />;
  }
  if (hasIntakeExecution && findingCount === 0) {
    step = 2;
    stepLabel = "Review Spine Receipts";
    stepIcon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  } else if (findingCount > 0 && !hasIntakeExecution) {
    step = 2;
    stepLabel = "Review Findings";
    stepIcon = <Lightbulb className="h-3.5 w-3.5 text-primary" />;
  } else if (findingCount > 0 && hasIntakeExecution) {
    step = 3;
    stepLabel = "Export & Act";
    stepIcon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  }

  const steps = ["Upload", "Intake", "Review", "Act"];
  const timeAgo = getTimeAgo(caseData.updatedAt);

  return (
    <button
      onClick={() => onNavigate(`/guide/${caseData.id}`)}
      className="w-full text-left p-4 rounded-lg border border-border/50 bg-card/50 hover:bg-card hover:border-primary/20 transition-all group"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground truncate">{caseData.name}</h3>
            <span className="text-[10px] text-muted-foreground/60 shrink-0">{timeAgo}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex items-center gap-0.5">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className={`h-1 rounded-full ${
                    i < step ? "w-3 bg-primary" :
                    i === step ? "w-4 bg-primary/60" : "w-2 bg-muted-foreground/20"
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {stepIcon}
              <span>{stepLabel}</span>
            </div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      </div>
    </button>
  );
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/* ─── Category Section ─── */

function CategorySection({
  category,
  mode,
  hoveredId,
  setHoveredId,
  onIntakeClick,
  onDirectPipeline,
  creatingPipeline,
  defaultExpanded,
}: {
  category: PipelineCategory;
  mode: "guided" | "direct";
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  onIntakeClick: (id: string) => void;
  onDirectPipeline: (p: PipelineConfig) => void;
  creatingPipeline: string | null;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 group text-left"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{category.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{category.description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px]">{category.pipelines.length}</Badge>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className={mode === "guided" ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "space-y-3"}>
          {category.pipelines.map((pipeline) =>
            mode === "guided" ? (
              <button
                key={pipeline.id}
                onClick={() => onIntakeClick(pipeline.id)}
                onMouseEnter={() => setHoveredId(pipeline.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`
                  group relative text-left p-5 rounded-lg border transition-all duration-200
                  ${pipeline.borderColor} ${pipeline.bgColor}
                  focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
                `}
              >
                <div className="flex items-start gap-3.5">
                  <pipeline.icon className={`h-5 w-5 mt-0.5 ${pipeline.color} shrink-0`} />
                  <div className="space-y-1.5 min-w-0">
                    <h3 className="text-sm font-medium text-foreground leading-snug">
                      {pipeline.title}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {pipeline.intakeDescription}
                    </p>
                  </div>
                  <ArrowRight
                    className={`h-4 w-4 shrink-0 mt-0.5 transition-all duration-200 ${
                      hoveredId === pipeline.id
                        ? "opacity-100 translate-x-0 text-foreground"
                        : "opacity-0 -translate-x-1 text-muted-foreground"
                    }`}
                  />
                </div>
              </button>
            ) : (
              <button
                key={pipeline.id}
                onClick={() => onDirectPipeline(pipeline)}
                disabled={!!creatingPipeline}
                className={`
                  w-full text-left p-4 sm:p-5 rounded-lg border transition-all duration-200 group
                  ${pipeline.pipelineBg}
                  focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
                  disabled:opacity-60 disabled:cursor-not-allowed
                `}
              >
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-background/50 flex items-center justify-center shrink-0 border border-border/30">
                    <pipeline.icon className={`h-5 w-5 ${pipeline.color}`} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">{pipeline.title}</h3>
                      <Badge variant="outline" className="text-[9px] shrink-0">{pipeline.domain}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {pipeline.pipelineDescription}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {pipeline.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background/50 border border-border/30 text-[10px] text-muted-foreground"
                        >
                          <CheckCircle2 className="h-2.5 w-2.5 text-primary/60" />
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 self-center">
                    {creatingPipeline === pipeline.id ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </div>
                </div>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Welcome Page ─── */

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { cases } = useCase();
  const [activeTab, setActiveTab] = useState<"guided" | "direct">("guided");
  const [showPipelineCatalog, setShowPipelineCatalog] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [creatingPipeline, setCreatingPipeline] = useState<string | null>(null);

  const recentCases = cases && cases.length > 0 ? cases.slice(0, 3) : [];

  const createCase = trpc.cases.create.useMutation({
    onSuccess: (result) => {
      setCreatingPipeline(null);
      setLocation(`/${result.id}`);
    },
    onError: () => {
      setCreatingPipeline(null);
      toast.error("Failed to create case. Please try again.");
    },
  });

  const logEvent = trpc.analytics.logEvent.useMutation();

  const handleIntakeClick = (situationId: string) => {
    logEvent.mutate({ pipelineType: situationId, eventType: "intake_start" });
    setLocation(`/intake?situation=${situationId}`);
  };

  const handleDirectPipeline = (pipeline: PipelineConfig) => {
    if (creatingPipeline) return;
    setCreatingPipeline(pipeline.id);
    logEvent.mutate({ pipelineType: pipeline.id, eventType: "direct_create" });
    createCase.mutate({
      name: pipeline.caseNameTemplate,
      description: `Direct pipeline: ${pipeline.pipelineDescription}`,
      domain: pipeline.domain,
      pipelineType: pipeline.id,
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Onboarding tour for first-time users */}
      <OnboardingTour />

      {/* Top bar */}
      <header className="border-b border-border/50 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Scale className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold tracking-tight">Luminari</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-amber-400/80 hover:text-amber-300 gap-1.5"
            onClick={() => setLocation("/lighthouse")}
          >
            <Lamp className="h-3.5 w-3.5" />
            Lighthouse
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1.5"
            onClick={() => setLocation("/civic-map")}
          >
            <MapPin className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Civic Map</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1.5"
            onClick={() => setLocation("/viewfinder")}
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Viewfinder</span>
          </Button>
          {user && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setLocation("/")}
            >
              Go to Workspace
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Resume section — always visible if user has cases */}
          {recentCases.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">Continue where you left off</h2>
                {cases!.length > 3 && (
                  <button
                    onClick={() => setLocation("/cases")}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    View all {cases!.length} cases
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {recentCases.map((c) => (
                  <ResumeCard key={c.id} caseData={c} onNavigate={setLocation} />
                ))}
              </div>
            </div>
          )}

          {/* Dual-path header */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Start a new investigation
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-tight">
              How would you like to begin?
            </h1>
          </div>

          {/* Tab switcher */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg border border-border/50 bg-card/30 p-1 gap-1">
              <button
                onClick={() => {
                  setActiveTab("guided");
                  setShowPipelineCatalog(false);
                }}
                className={`px-4 py-2.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === "guided"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Heart className="h-4 w-4" />
                <span>I Need Help</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab("direct");
                  setShowPipelineCatalog(true);
                }}
                className={`px-4 py-2.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                  activeTab === "direct"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Briefcase className="h-4 w-4" />
                <span>Direct Access</span>
              </button>
            </div>
          </div>

          {/* Tab description */}
          <p className="text-center text-sm text-muted-foreground max-w-lg mx-auto">
            {activeTab === "guided"
              ? "We'll walk through it together. Pick what feels closest, or let us figure it out for you."
              : "For advocates, attorneys, and professionals. Select a pipeline to go directly to a configured workspace with the right tools ready."}
          </p>

          {/* Auto-detect entry point — only in guided mode */}
          {activeTab === "guided" && (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={() => setLocation("/guided-intake")}
                className="group relative w-full max-w-md rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 p-5 transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="flex items-center gap-4">
                  <div className="h-11 w-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-foreground">Not sure where to start?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Just tell me what happened — I'll figure out which pipeline fits your situation.
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-primary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </button>
              <button
                onClick={() => setLocation("/benefits")}
                className="group relative w-full max-w-md rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 p-5 transition-all duration-200 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/5"
              >
                <div className="flex items-center gap-4">
                  <div className="h-11 w-11 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/25 transition-colors">
                    <HeartHandshake className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-foreground">Need help with benefits?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Find government programs you may qualify for — food, housing, healthcare, burial assistance, and more.
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-emerald-500/50 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </button>

              {/* Did You Know? discovery link */}
              <button
                onClick={() => setLocation("/discover")}
                className="group relative w-full max-w-md rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 p-5 transition-all duration-200 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/5"
              >
                <div className="flex items-center gap-4">
                  <div className="h-11 w-11 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 group-hover:bg-amber-500/25 transition-colors">
                    <Lightbulb className="h-5 w-5 text-amber-400" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-foreground">Did You Know?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Discover programs and resources most people don't know exist.
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-amber-500/50 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              </button>
            </div>
          )}

          {activeTab === "guided" && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowPipelineCatalog((visible) => !visible)}
                aria-expanded={showPipelineCatalog}
                aria-controls="pipeline-catalog"
                className="inline-flex items-center gap-2 rounded-lg border border-border/50 px-3.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <Briefcase className="h-3.5 w-3.5" />
                {showPipelineCatalog ? "Hide detailed paths" : "Browse a specific issue or service"}
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showPipelineCatalog ? "rotate-90" : ""}`} />
              </button>
            </div>
          )}

          {(activeTab === "direct" || showPipelineCatalog) && (
            <section id="pipeline-catalog" className="space-y-6" aria-label="Specialized intake paths">
              {activeTab === "guided" && (
                <p className="text-center text-xs text-muted-foreground max-w-xl mx-auto">
                  Choose a detailed path only if you already know what kind of help you need.
                </p>
              )}
              <div key={activeTab} className="space-y-6">
                {CATEGORIES.map((category, idx) => (
                  <CategorySection
                    key={category.id}
                    category={category}
                    mode={activeTab}
                    hoveredId={hoveredId}
                    setHoveredId={setHoveredId}
                    onIntakeClick={handleIntakeClick}
                    onDirectPipeline={handleDirectPipeline}
                    creatingPipeline={creatingPipeline}
                    defaultExpanded={activeTab === "direct" && idx === 0}
                  />
                ))}
              </div>
              <div className="text-center pt-2">
                <p className="text-xs text-muted-foreground/50">
                  {ALL_PIPELINES.length} specialized pipelines across {CATEGORIES.length} categories
                </p>
              </div>
            </section>
          )}

          {/* Offline Intake Bundle */}
          <div className="flex items-center justify-center gap-3 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                window.open("/api/bundle/download", "_blank");
                toast.info("Downloading offline intake bundle...");
              }}
            >
              <FileDown className="h-3.5 w-3.5 mr-1.5" />
              Offline Intake Bundle
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setLocation("/import-bundle")}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Import Bundle
            </Button>
          </div>

          {/* Reassurance footer */}
          <div className="text-center space-y-3 pt-4 pb-8">
            <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Private and secure
              </span>
              <span className="flex items-center gap-1.5">
                <Headphones className="h-3.5 w-3.5" />
                Read-aloud available
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/60 max-w-md mx-auto">
              Everything you share stays in your account. The engine reads your documents 
              so you don't have to relive them. It finds what matters and explains it simply.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
