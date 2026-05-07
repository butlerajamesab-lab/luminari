import { useAuth } from "@/_core/hooks/useAuth";
import { useCase } from "@/contexts/CaseContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  FileText,
  Users,
  Clock,
  Shield,
  Network,
  LogOut,
  PanelLeft,
  Scale,
  Upload,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  MessageSquare,
  Download,
  Wrench,
  FileSearch,
  Lock,
  ShieldAlert,
  AlertTriangle,
  Heart,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  BarChart3,
  Presentation,
  UserCog,
  FlaskConical,
  ClipboardList,
  ScrollText,
  Rocket,
  Lamp,
  MapPin,
  Eye,
  Gavel,
  Send,
  BookOpen,
  Library,
  Brain,
  Layers,
  RadioTower,
  Ban,
  GitBranch,
  Timer,
  ListChecks,
  Route as RouteIcon,
  Map,
  FileCheck,
  Compass,
  Target,
  Terminal,
  DoorOpen,
  ShieldCheck,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { trpc } from "@/lib/trpc";
import MobileBottomNav from "./MobileBottomNav";
import PlainLanguageToggle from "./PlainLanguageToggle";
import { NotificationBell } from "./NotificationBell";
import { resetTour } from "./OnboardingTour";

/* ─── Navigation Structure ─── */

type NavItem = { icon: any; label: string; path: string; requiresSealed?: boolean };
type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
  labelColor?: string;
};

/* ─── Workflow Stage Items ─── */

const investigateItems: NavItem[] = [
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

const analyzeItems: NavItem[] = [
  { icon: Target, label: "Claim Elements", path: "/claim-elements" },
  { icon: Scale, label: "Proof Frameworks", path: "/proof-frameworks" },
  { icon: BarChart3, label: "Contradiction Scoring", path: "/contradiction-scoring" },
  { icon: Ban, label: "Litigation Barriers", path: "/barriers" },
  { icon: GitBranch, label: "Doctrine Graph", path: "/doctrine-graph" },
  { icon: FileSearch, label: "Claim Denial Analysis", path: "/cda" },
  { icon: Shield, label: "Provenance Drill-Down", path: "/provenance" },
  { icon: RadioTower, label: "Signal Registry", path: "/signal-registry" },
];

const strategizeItems: NavItem[] = [
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

const actItems: NavItem[] = [
  { icon: FileCheck, label: "Filing Generator", path: "/filing-generator" },
  { icon: FileSearch, label: "Templates", path: "/templates" },
  { icon: Send, label: "LumenSend", path: "/lumensend" },
  { icon: ClipboardList, label: "FOIA Tracker", path: "/foia" },
  { icon: ScrollText, label: "Statement of Facts", path: "/narrative" },
  { icon: Download, label: "Export Reports", path: "/exports" },
  { icon: Presentation, label: "Presentations", path: "/presentations" },
];

const observeItems: NavItem[] = [
  { icon: Eye, label: "Pattern Viewfinder", path: "/viewfinder" },
  { icon: Network, label: "Cross-Case Patterns", path: "/patterns" },
  { icon: BarChart3, label: "Agency Metrics", path: "/agency-metrics" },
  { icon: Gavel, label: "Docket Room", path: "/docket" },
];

const platformItems: NavItem[] = [
  { icon: DoorOpen, label: "Mudroom", path: "/mudroom" },
  { icon: Wrench, label: "Workshop Floor", path: "/workshop" },
  { icon: Lamp, label: "The Lighthouse", path: "/lighthouse" },
  { icon: Compass, label: "Pipeline Explorer", path: "/categories" },
  { icon: MapPin, label: "Civic Map", path: "/civic-map" },
  { icon: Library, label: "Legal Library", path: "/legal-library" },
  { icon: BookOpen, label: "Civil Gideon", path: "/civil-gideon" },
  { icon: Brain, label: "Mental Health System", path: "/mental-health" },
];

const adminItems: NavItem[] = [
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

/** All workflow sections — used for lens filtering */
const allNavSections: NavSection[] = [
  { id: "investigate", label: "Investigate", items: investigateItems, defaultOpen: true },
  { id: "analyze", label: "Analyze", items: analyzeItems, defaultOpen: false },
  { id: "strategize", label: "Strategize", items: strategizeItems, defaultOpen: false },
  { id: "act", label: "Act", items: actItems, defaultOpen: false },
  { id: "observe", label: "Observe", items: observeItems, defaultOpen: false },
  { id: "platform", label: "Platform", items: platformItems, defaultOpen: false },
];

const adminSection: NavSection = {
  id: "admin", label: "Admin", items: adminItems, defaultOpen: false, labelColor: "text-destructive/70",
};

/** User lens definitions — which workflow stages are visible for each lens */
export type UserLens = "guide" | "advocate" | "professional" | "admin";

const LENS_VISIBILITY: Record<UserLens, string[]> = {
  guide: ["investigate", "act", "platform"],
  advocate: ["investigate", "analyze", "act", "observe", "platform"],
  professional: ["investigate", "analyze", "strategize", "act", "observe", "platform"],
  admin: ["investigate", "analyze", "strategize", "act", "observe", "platform", "admin"],
};

const LENS_KEY = "luminari-user-lens";

function getStoredLens(): UserLens {
  try {
    const saved = localStorage.getItem(LENS_KEY);
    if (saved && ["guide", "advocate", "professional", "admin"].includes(saved)) {
      return saved as UserLens;
    }
  } catch {}
  return "professional";
}

function setStoredLens(lens: UserLens) {
  try { localStorage.setItem(LENS_KEY, lens); } catch {}
}

/** Filter navSections based on the active lens */
function getNavSectionsForLens(lens: UserLens): NavSection[] {
  const visibleIds = LENS_VISIBILITY[lens];
  return allNavSections.filter(s => visibleIds.includes(s.id));
}


/* ─── Collapsible State Persistence ─── */

const SIDEBAR_SECTIONS_KEY = "sidebar-sections-state";

function loadSectionState(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(SIDEBAR_SECTIONS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  // Default: investigation open, rest closed
  const defaults: Record<string, boolean> = {};
  allNavSections.forEach(s => { defaults[s.id] = s.defaultOpen ?? false; });
  defaults[adminSection.id] = false;
  return defaults;
}

function saveSectionState(state: Record<string, boolean>) {
  try { localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(state)); } catch {}
}

/* ─── Sidebar Width ─── */

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const isMobile = useIsMobile();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <Scale className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Luminari
              </h1>
            </div>
            <p className="text-xs font-mono text-muted-foreground tracking-wider uppercase">
              Neutral Document Intelligence Platform
            </p>
            <p className="text-sm text-muted-foreground text-center max-w-sm mt-2">
              Upload documents. Illuminate evidence. Every assertion traced to its source.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full"
          >
            Authenticate
          </Button>
        </div>
      </div>
    );
  }

  // Mobile layout: no sidebar, bottom nav instead
  if (isMobile) {
    return (
      <MobileLayout>{children}</MobileLayout>
    );
  }

  // Desktop layout: sidebar
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DesktopLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DesktopLayoutContent>
    </SidebarProvider>
  );
}

/* ─── Mobile Layout ─── */
function MobileLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { currentCase, currentCaseId } = useCase();

  const allMenuItems = [...investigateItems, ...analyzeItems, ...strategizeItems, ...actItems, ...observeItems, ...platformItems];
  const activeMenuItem = allMenuItems.find((item) => item.path === location);

  // Stats for guided journey step detection
  const caseStatsQuery = trpc.cases.stats.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );
  const lifecycleQuery = trpc.snapshots.lifecycle.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );
  const caseStats = caseStatsQuery.data ?? null;
  const lifecycle = lifecycleQuery.data ?? null;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile top header */}
      <header className="sticky top-0 z-40 flex items-center justify-between h-12 px-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center gap-2 min-w-0">
          <Scale className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">
            {activeMenuItem?.label ?? "Luminari"}
          </span>
        </div>
        {currentCase && (
          <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[40%]">
            {currentCase.name}
          </span>
        )}
      </header>

      {/* Guided Journey Resume Banner — Mobile */}
      {currentCaseId && caseStats && (
        <MobileJourneyBanner
          caseId={currentCaseId}
          docCount={caseStats.documents}
          findingCount={caseStats.findings}
          hasSnapshot={!!lifecycle?.hasSnapshot}
          onNavigate={setLocation}
        />
      )}

      {/* Main content with bottom padding for nav bar */}
      <main className="flex-1 p-3 pb-20">
        {children}
      </main>

      {/* Bottom navigation */}
      <MobileBottomNav />
    </div>
  );
}

/** Compact mobile journey banner */
function MobileJourneyBanner({
  caseId,
  docCount,
  findingCount,
  hasSnapshot,
  onNavigate,
}: {
  caseId: number;
  docCount: number;
  findingCount: number;
  hasSnapshot: boolean;
  onNavigate: (path: string) => void;
}) {
  let step = 0;
  let stepLabel = "Upload Documents";

  if (docCount > 0 && findingCount === 0) {
    step = 1;
    stepLabel = "Analyze Evidence";
  } else if (findingCount > 0 && !hasSnapshot) {
    step = 2;
    stepLabel = "Review Findings";
  } else if (findingCount > 0 && hasSnapshot) {
    step = 3;
    stepLabel = "Export & Act";
  }

  const steps = ["Upload", "Analyze", "Review", "Act"];

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border-b border-primary/10 cursor-pointer active:bg-primary/10"
      onClick={() => onNavigate(`/guide/${caseId}`)}
    >
      <Heart className="h-3.5 w-3.5 text-primary shrink-0" />
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <div className="flex items-center gap-0.5">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-0.5 ${i <= step ? "text-primary" : "text-muted-foreground/40"}`}
            >
              {i <= step ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <div className="h-3 w-3 rounded-full border border-current" />
              )}
              <span className="text-[9px] font-medium hidden sm:inline">{s}</span>
              {i < steps.length - 1 && (
                <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/30 mx-0.5" />
              )}
            </div>
          ))}
        </div>
      </div>
      <span className="text-[10px] text-primary font-medium shrink-0">
        {stepLabel} →
      </span>
    </div>
  );
}

/* ─── Collapsible Section Component ─── */

function CollapsibleNavSection({
  section,
  isOpen,
  onToggle,
  location,
  setLocation,
  isCollapsed,
  snapshotStatus,
}: {
  section: NavSection;
  isOpen: boolean;
  onToggle: () => void;
  location: string;
  setLocation: (path: string) => void;
  isCollapsed: boolean;
  snapshotStatus: string | null;
}) {
  const hasActiveItem = section.items.some(
    item => location === item.path || location.startsWith(item.path + "/")
  );
  const itemCount = section.items.length;

  return (
    <SidebarMenu className="px-2 py-0">
      {/* Section header — clickable toggle */}
      {!isCollapsed && (
        <button
          onClick={onToggle}
          className={`flex items-center gap-1.5 w-full px-2 pt-2.5 pb-1 mt-0.5 rounded-sm hover:bg-accent/30 transition-colors group text-left`}
        >
          <ChevronRight
            className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            } ${hasActiveItem ? "text-primary" : "text-muted-foreground/60"}`}
          />
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              section.labelColor || (hasActiveItem ? "text-primary/80" : "text-muted-foreground/70")
            }`}
          >
            {section.label}
          </span>
          {!isOpen && (
            <span className="text-[9px] text-muted-foreground/40 ml-auto font-mono">
              {itemCount}
            </span>
          )}
          {!isOpen && hasActiveItem && (
            <div className="h-1.5 w-1.5 rounded-full bg-primary ml-1 shrink-0" />
          )}
        </button>
      )}

      {/* Section items — shown when open or sidebar collapsed (icon mode) */}
      {(isOpen || isCollapsed) && section.items.map((item) => {
        const isActive = location === item.path || location.startsWith(item.path + "/");
        const needsSealed = (item as any).requiresSealed;
        const isDisabled = needsSealed && snapshotStatus === 'open';

        if (isDisabled) {
          return (
            <SidebarMenuItem key={item.path}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    isActive={false}
                    tooltip={item.label}
                    className="min-h-8 h-auto transition-all font-normal text-[13px] leading-snug py-1.5 px-3 opacity-40 cursor-not-allowed"
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="whitespace-normal">{item.label}</span>
                    <Lock className="h-3 w-3 text-muted-foreground ml-auto" />
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-xs">Available after snapshot is sealed.</p>
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          );
        }

        return (
          <SidebarMenuItem key={item.path}>
            <SidebarMenuButton
              isActive={isActive}
              onClick={() => setLocation(item.path)}
              tooltip={item.label}
              className="min-h-8 h-auto transition-all font-normal text-[13px] leading-snug py-1.5 px-3"
            >
              <item.icon
                className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
              />
              <span className="whitespace-normal">{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

/* ─── Integrity Section (special — has badge) ─── */

function IntegritySection({
  location,
  setLocation,
  isCollapsed,
  isOpen,
  onToggle,
  lifecycle,
}: {
  location: string;
  setLocation: (path: string) => void;
  isCollapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
  lifecycle: any;
}) {
  const blockingCount = lifecycle?.activeErrorBreakdown?.total ?? 0;
  const hasBlocking = blockingCount > 0;
  const integrityActive = location === "/integrity";
  const auditActive = location === "/audit";
  const extractionActive = location === "/extraction-failures";
  const hasActiveItem = integrityActive || auditActive || extractionActive;

  return (
    <SidebarMenu className="px-2 py-0">
      {!isCollapsed && (
        <button
          onClick={onToggle}
          className="flex items-center gap-1.5 w-full px-2 pt-2.5 pb-1 mt-0.5 rounded-sm hover:bg-accent/30 transition-colors group text-left"
        >
          <ChevronRight
            className={`h-3 w-3 shrink-0 transition-transform duration-200 ${
              isOpen ? "rotate-90" : ""
            } ${hasActiveItem ? "text-primary" : "text-muted-foreground/60"}`}
          />
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${hasActiveItem ? "text-primary/80" : "text-muted-foreground/70"}`}>
            Integrity
          </span>
          {hasBlocking && (
            <span className="ml-auto flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold">
              {blockingCount}
            </span>
          )}
          {!isOpen && hasActiveItem && !hasBlocking && (
            <div className="h-1.5 w-1.5 rounded-full bg-primary ml-auto shrink-0" />
          )}
        </button>
      )}

      {(isOpen || isCollapsed) && (
        <>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={integrityActive}
              onClick={() => setLocation("/integrity")}
              tooltip="Integrity & Resolutions"
              className="min-h-8 h-auto transition-all font-normal text-[13px] leading-snug py-1.5 px-3"
            >
              <ShieldAlert
                className={`h-3.5 w-3.5 shrink-0 ${
                  integrityActive ? "text-primary" : hasBlocking ? "text-red-400" : "text-muted-foreground"
                }`}
              />
              <span className="whitespace-normal flex-1">Integrity & Resolutions</span>
              {!isCollapsed && hasBlocking && (
                <span className="ml-auto flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold">
                  {blockingCount}
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
          {investigateItems.filter((item: NavItem) => ['/extraction-failures', '/audit', '/integrity'].includes(item.path)).map((item) => {
            const isActive = location === item.path;
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={isActive}
                  onClick={() => setLocation(item.path)}
                  tooltip={item.label}
                  className="min-h-8 h-auto transition-all font-normal text-[13px] leading-snug py-1.5 px-3"
                >
                  <item.icon
                    className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <span className="whitespace-normal">{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </>
      )}
    </SidebarMenu>
  );
}

/* ─── Desktop Layout ─── */

function DesktopLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { currentCase, currentCaseId, setCurrentCaseId } = useCase();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // User lens state
  const [activeLens, setActiveLens] = useState<UserLens>(getStoredLens);
  const visibleSections = getNavSectionsForLens(activeLens);
  const handleLensChange = useCallback((lens: UserLens) => {
    setActiveLens(lens);
    setStoredLens(lens);
  }, []);
  // Collapsible section state
  const [sectionState, setSectionState] = useState<Record<string, boolean>>(loadSectionState);

  const toggleSection = useCallback((id: string) => {
    setSectionState(prev => {
      const next = { ...prev, [id]: !prev[id] };
      saveSectionState(next);
      return next;
    });
  }, []);

  // Auto-expand section containing active route
  useEffect(() => {
    const allSections = [...allNavSections, adminSection];
    for (const section of allSections) {
      const hasActive = section.items.some(
        item => location === item.path || location.startsWith(item.path + "/")
      );
      if (hasActive && !sectionState[section.id]) {
        setSectionState(prev => {
          const next = { ...prev, [section.id]: true };
          saveSectionState(next);
          return next;
        });
        break;
      }
    }
    // Also check integrity special items
    if (["/integrity", "/extraction-failures", "/audit"].includes(location) && !sectionState["integrity"]) {
      setSectionState(prev => {
        const next = { ...prev, integrity: true };
        saveSectionState(next);
        return next;
      });
    }
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live data queries
  const casesQuery = trpc.cases.list.useQuery();
  const cases = casesQuery.data ?? [];
  const lifecycleQuery2 = trpc.snapshots.lifecycle.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );
  const lifecycle = lifecycleQuery2.data ?? null;
  const snapshotStatus = lifecycle?.status ?? null;
  const caseStatsQuery2 = trpc.cases.stats.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );
  const caseStats = caseStatsQuery2.data ?? null;

  // Ctrl+K keyboard shortcut for jurisdiction search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('[data-jurisdiction-search]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft =
        sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH)
        setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Scale className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold tracking-tight truncate text-sm">
                    Luminari
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                    v4.0
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-y-auto">
            {/* Case Selector */}
            {!isCollapsed && (
              <div className="px-3 py-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left">
                      <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-xs font-medium truncate flex-1">
                        {currentCase?.name || "Select Case"}
                      </span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {cases && cases.length > 0 && cases.map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={() => {
                          setCurrentCaseId(c.id);
                          setLocation("/");
                        }}
                        className={`cursor-pointer ${c.id === currentCaseId ? "bg-accent" : ""}`}
                      >
                        <span className="text-xs truncate">{c.name}</span>
                      </DropdownMenuItem>
                    ))}
                    {(!cases || cases.length === 0) && (
                      <DropdownMenuItem disabled>
                        <span className="text-xs text-muted-foreground">No cases available</span>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => setLocation("/cases")}
                      className="cursor-pointer text-primary"
                    >
                      <span className="text-xs">Manage Cases...</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* Control Room — top-level nav item */}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setLocation("/control-room")}
                  isActive={location === "/control-room"}
                  tooltip="Control Room"
                  className="font-medium"
                >
                  <Layers className="h-4 w-4" />
                  <span className="group-data-[collapsible=icon]:hidden">Control Room</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setLocation("/")}
                  isActive={location === "/"}
                  tooltip="Case Overview"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="group-data-[collapsible=icon]:hidden">Case Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="my-1" />
            {/* Workflow Stage Sections */}
            {visibleSections.map((section) => (
              <CollapsibleNavSection
                key={section.id}
                section={section}
                isOpen={sectionState[section.id] ?? section.defaultOpen ?? false}
                onToggle={() => toggleSection(section.id)}
                location={location}
                setLocation={setLocation}
                isCollapsed={isCollapsed}
                snapshotStatus={snapshotStatus}
              />
            ))}

            {/* Admin Tools — always visible for testing */}
            <CollapsibleNavSection
              section={adminSection}
              isOpen={sectionState["admin"] ?? false}
              onToggle={() => toggleSection("admin")}
              location={location}
              setLocation={setLocation}
              isCollapsed={isCollapsed}
              snapshotStatus={snapshotStatus}
            />
          </SidebarContent>

          <SidebarFooter className="p-3 space-y-2">
            <button
              onClick={() => { window.location.href = "/welcome"; }}
              className="flex items-center gap-2.5 w-full rounded-lg px-3 py-2.5 bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors text-left group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
            >
              <Heart className="h-4 w-4 text-primary shrink-0" />
              <div className="group-data-[collapsible=icon]:hidden">
                <p className="text-xs font-medium text-primary leading-none">Guided View</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Step-by-step help</p>
              </div>
            </button>
            {/* Lens Selector */}
            <div className={`${isCollapsed ? 'px-0' : 'px-1'}`}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 w-full rounded-lg px-3 py-2 bg-muted/40 border border-border/50 hover:bg-muted/60 transition-colors text-left group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                      {activeLens.charAt(0).toUpperCase() + activeLens.slice(1)} Lens
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  {(["guide", "advocate", "professional", "admin"] as UserLens[]).map((lens) => (
                    <DropdownMenuItem
                      key={lens}
                      onClick={() => handleLensChange(lens)}
                      className={`cursor-pointer text-xs ${activeLens === lens ? 'bg-accent' : ''}`}
                    >
                      <span>{lens.charAt(0).toUpperCase() + lens.slice(1)}</span>
                      {activeLens === lens && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <PlainLanguageToggle collapsed={isCollapsed} />
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'px-1'}`}>
              <NotificationBell />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-8 w-8 border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-primary/10 text-primary">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => { window.location.href = "/welcome"; }}
                  className="cursor-pointer"
                >
                  <Heart className="mr-2 h-4 w-4" />
                  <span>Guided View</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => resetTour()}
                  className="cursor-pointer"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  <span>Replay Tour</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* Resize handle */}
        {!isCollapsed && (
          <div
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-50 group"
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="w-px h-full bg-border group-hover:bg-primary/50 transition-colors mx-auto" />
          </div>
        )}
      </div>

      <SidebarInset>
        {/* Guided Journey Resume Banner — Desktop */}
        {currentCaseId && caseStats && (
          <DesktopJourneyBanner
            caseId={currentCaseId}
            docCount={caseStats.documents}
            findingCount={caseStats.findings}
            hasSnapshot={!!lifecycle?.hasSnapshot}
            onNavigate={setLocation}
          />
        )}
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </>
  );
}

/** Desktop journey banner */
function DesktopJourneyBanner({
  caseId,
  docCount,
  findingCount,
  hasSnapshot,
  onNavigate,
}: {
  caseId: number;
  docCount: number;
  findingCount: number;
  hasSnapshot: boolean;
  onNavigate: (path: string) => void;
}) {
  let step = 0;
  let label = "Upload Documents";
  let desc = "Start by uploading your evidence documents";

  if (docCount > 0 && findingCount === 0) {
    step = 1;
    label = "Analyze Evidence";
    desc = "Run analysis to extract findings from your documents";
  } else if (findingCount > 0 && !hasSnapshot) {
    step = 2;
    label = "Review Findings";
    desc = "Review extracted findings and create a snapshot";
  } else if (findingCount > 0 && hasSnapshot) {
    step = 3;
    label = "Export & Act";
    desc = "Export reports and take action on your findings";
  }

  const steps = [
    { label: "Upload", icon: Upload },
    { label: "Analyze", icon: FileSearch },
    { label: "Review", icon: Lightbulb },
    { label: "Act", icon: ArrowRight },
  ];

  return (
    <div
      className="flex items-center gap-4 px-6 py-2 bg-primary/5 border-b border-primary/10 cursor-pointer hover:bg-primary/8 transition-colors"
      onClick={() => onNavigate(`/guide/${caseId}`)}
    >
      <Heart className="h-4 w-4 text-primary shrink-0" />
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                i < step
                  ? "bg-primary/20 text-primary"
                  : i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <s.icon className="h-3 w-3" />
              )}
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
            )}
          </div>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-muted-foreground truncate">{desc}</span>
      </div>
      <span className="text-xs text-primary font-medium shrink-0">
        Continue →
      </span>
    </div>
  );
}
