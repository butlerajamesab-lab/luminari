import {
  Upload,
  FileText,
  Users,
  Clock,
  Network,
  Lightbulb,
  MessageSquare,
  AlertTriangle,
  Shield,
  ShieldAlert,
  Target,
  Scale,
  BarChart3,
  Ban,
  GitBranch,
  FileSearch,
  RadioTower,
  Compass,
  Layers,
  Terminal,
  Route as RouteIcon,
  ListChecks,
  Timer,
  Map,
  FileCheck,
  Send,
  ClipboardList,
  ScrollText,
  Download,
  Presentation,
  Eye,
  Gavel,
  DoorOpen,
  Wrench,
  Lamp,
  MapPin,
  Library,
  BookOpen,
  Brain,
  UserCog,
  FlaskConical,
  Rocket,
  ShieldCheck,
  Briefcase,
  Globe,
  LayoutDashboard,
} from "lucide-react";

export type NavItem = { icon: any; label: string; path: string; requiresSealed?: boolean };
export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
  labelColor?: string;
};

export type UserLens = "guide" | "advocate" | "professional" | "admin";

export const LENS_OPTIONS: readonly UserLens[] = [
  "guide",
  "advocate",
  "professional",
  "admin",
] as const;

export const caseWorkspaceItems: NavItem[] = [
  { icon: Layers, label: "Control Room", path: "/control-room" },
  { icon: LayoutDashboard, label: "Case Overview", path: "/case-overview" },
];

export const investigateItems: NavItem[] = [
  { icon: Upload, label: "Upload Evidence", path: "/upload" },
  { icon: FileText, label: "Documents", path: "/documents" },
  { icon: Users, label: "Entities", path: "/entities" },
  { icon: Clock, label: "Timeline", path: "/timeline" },
  { icon: Network, label: "Network Graph", path: "/network" },
  { icon: Lightbulb, label: "Findings", path: "/findings" },
  { icon: MessageSquare, label: "Ask the Evidence", path: "/chat" },
  { icon: AlertTriangle, label: "Extraction Failures", path: "/extraction-failures" },
  { icon: Shield, label: "Audit Trail", path: "/audit" },
  { icon: ShieldAlert, label: "Integrity Dashboard", path: "/integrity" },
];

export const analyzeItems: NavItem[] = [
  { icon: Target, label: "Claim Elements", path: "/claim-elements" },
  { icon: Scale, label: "Proof Frameworks", path: "/proof-frameworks" },
  { icon: BarChart3, label: "Contradiction Scoring", path: "/contradiction-scoring" },
  { icon: Ban, label: "Litigation Barriers", path: "/barriers" },
  { icon: GitBranch, label: "Doctrine Graph", path: "/doctrine-graph" },
  { icon: FileSearch, label: "Claim Denial Analysis", path: "/cda" },
  { icon: Shield, label: "Provenance Drill-Down", path: "/provenance" },
  { icon: RadioTower, label: "Signal Registry", path: "/signal-registry" },
];

export const strategizeItems: NavItem[] = [
  { icon: Compass, label: "Case Resolution", path: "/resolve" },
  { icon: Layers, label: "Structural Diagnostics", path: "/diagnostics" },
  { icon: Terminal, label: "Command Board", path: "/command-board" },
  { icon: RouteIcon, label: "Enforcement Pathway", path: "/enforcement-pathway" },
  { icon: ListChecks, label: "Investigation Workflow", path: "/investigation-workflow" },
  { icon: Timer, label: "Deadline Calculator", path: "/deadline-calculator" },
  { icon: Shield, label: "Enforcement Intel", path: "/enforcement-intel" },
  { icon: Compass, label: "Investigation Guidance", path: "/investigation-guidance" },
  { icon: Map, label: "Architecture Map", path: "/architecture-map" },
];

export const actItems: NavItem[] = [
  { icon: FileCheck, label: "Filing Generator", path: "/filing-generator" },
  { icon: FileSearch, label: "Templates", path: "/templates" },
  { icon: Send, label: "LumenSend", path: "/lumensend" },
  { icon: ClipboardList, label: "FOIA Tracker", path: "/foia" },
  { icon: ScrollText, label: "Statement of Facts", path: "/narrative" },
  { icon: Download, label: "Export Reports", path: "/exports" },
  { icon: Presentation, label: "Presentations", path: "/presentations" },
];

export const observeItems: NavItem[] = [
  { icon: Eye, label: "Pattern Viewfinder", path: "/viewfinder" },
  { icon: Network, label: "Cross-Case Patterns", path: "/patterns" },
  { icon: BarChart3, label: "Agency Metrics", path: "/agency-metrics" },
  { icon: Gavel, label: "Docket Room", path: "/docket" },
  { icon: GitBranch, label: "Living Civic Genome", path: "/civic-genome" },
];

export const platformItems: NavItem[] = [
  { icon: DoorOpen, label: "Mudroom", path: "/mudroom" },
  { icon: Wrench, label: "Workshop Floor", path: "/workshop" },
  { icon: Lamp, label: "The Lighthouse", path: "/lighthouse" },
  { icon: Compass, label: "Pipeline Explorer", path: "/categories" },
  { icon: MapPin, label: "Civic Map", path: "/civic-map" },
  { icon: Globe, label: "Resource Directory", path: "/resource-directory" },
  { icon: Library, label: "Legal Library", path: "/legal-library" },
  { icon: BookOpen, label: "Civil Gideon", path: "/civil-gideon" },
  { icon: Brain, label: "Mental Health System", path: "/mental-health" },
];

export const adminItems: NavItem[] = [
  { icon: Wrench, label: "Case Repair", path: "/repair" },
  { icon: BarChart3, label: "Pipeline Analytics", path: "/admin/analytics" },
  { icon: BarChart3, label: "Business Analytics", path: "/business-analytics" },
  { icon: MessageSquare, label: "Feedback Dashboard", path: "/admin/feedback" },
  { icon: UserCog, label: "User Management", path: "/admin/users" },
  { icon: FlaskConical, label: "Test Scenarios", path: "/admin/test-scenarios" },
  { icon: Rocket, label: "Mission Control", path: "/mission-control" },
  { icon: Shield, label: "Sovereign Control", path: "/sovereign-control" },
  { icon: ShieldCheck, label: "Resource Verification", path: "/admin/resource-verification" },
];

export const allNavSections: NavSection[] = [
  { id: "investigate", label: "Investigate", items: investigateItems, defaultOpen: true },
  { id: "analyze", label: "Analyze", items: analyzeItems, defaultOpen: false },
  { id: "strategize", label: "Strategize", items: strategizeItems, defaultOpen: false },
  { id: "act", label: "Act", items: actItems, defaultOpen: false },
  { id: "observe", label: "Observe", items: observeItems, defaultOpen: false },
  { id: "platform", label: "Platform", items: platformItems, defaultOpen: false },
];

export const adminSection: NavSection = {
  id: "admin",
  label: "Admin",
  items: adminItems,
  defaultOpen: false,
  labelColor: "text-destructive/70",
};

export const accountItems: NavItem[] = [
  { icon: Briefcase, label: "My Cases", path: "/cases" },
];

export const mobilePrimaryItems: NavItem[] = [
  { ...caseWorkspaceItems[1], label: "Overview" },
  { icon: FileText, label: "Docs", path: "/documents" },
  { icon: Lightbulb, label: "Findings", path: "/findings" },
  { icon: MessageSquare, label: "Ask", path: "/chat" },
];

export const LENS_VISIBILITY: Record<UserLens, readonly string[]> = {
  guide: ["investigate", "act", "platform"],
  advocate: ["investigate", "analyze", "act", "observe", "platform"],
  professional: ["investigate", "analyze", "strategize", "act", "observe", "platform"],
  admin: ["investigate", "analyze", "strategize", "act", "observe", "platform"],
};

/**
 * A lens changes the workflow detail exposed to the person. Administrative
 * authority is a permission concern, not a lens concern, so it is appended only
 * when the authenticated user is actually allowed to see administrator tools.
 */
export function getNavSectionsForLens(lens: UserLens, includeAdmin = false): NavSection[] {
  const visibleIds = LENS_VISIBILITY[lens];
  const sections = allNavSections.filter((section) => visibleIds.includes(section.id));
  return includeAdmin ? [...sections, adminSection] : sections;
}

export function isUserLens(value: string | null): value is UserLens {
  return !!value && LENS_OPTIONS.includes(value as UserLens);
}
