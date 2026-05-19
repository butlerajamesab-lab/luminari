import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAuth } from "./_core/hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CaseProvider, useCase } from "./contexts/CaseContext";
import { PlainLanguageProvider } from "./contexts/PlainLanguageContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import Cases from "./pages/Cases";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import Upload from "./pages/Upload";
import Entities from "./pages/Entities";
import EntityDetail from "./pages/EntityDetail";
import Findings from "./pages/Findings";
import Timeline from "./pages/Timeline";
import NetworkGraph from "./pages/NetworkGraph";
import Chat from "./pages/Chat";
import Exports from "./pages/Exports";
import AuditTrail from "./pages/AuditTrail";
import EntityDedup from "./pages/EntityDedup";
import CaseRepair from "./pages/CaseRepair";
import CdaRunList from "./pages/CdaRunList";
import CdaRunDetail from "./pages/CdaRunDetail";
import Provenance from "./pages/Provenance";
import ProvenanceHistory from "./pages/ProvenanceHistory";
import SpineViewer from "./pages/SpineViewer";
import ExtractionFailures from "./pages/ExtractionFailures";
import IntegrityDashboard from "./pages/IntegrityDashboard";
import GlobalUploadIndicator from "./components/GlobalUploadIndicator";
import { LuminariHelper } from "./components/LuminariHelper";
import { ValidationRouteWrapper } from "./components/ValidationRouteWrapper";
import { SovereignHeader } from "./components/Navigation/SovereignHeader";

// Guided Advocacy Shell pages
import Welcome from "./pages/Welcome";
import Intake from "./pages/Intake";
import Case from "./pages/Case";
import GuidedIntake from "./pages/GuidedIntake";
import GuidedIntakeNew from "./pages/GuidedIntakeNew";
import BenefitsNavigator from "./pages/BenefitsNavigator";
import GuidedDashboard from "./pages/GuidedDashboard";
import SharedCaseView from "./pages/SharedCaseView";
import AdminFeedback from "./pages/AdminFeedback";
import AdminAnalytics from "./pages/AdminAnalytics";
import Presentations from "./pages/Presentations";
import PresentationEditor from "./pages/PresentationEditor";
import AdminUsers from "./pages/AdminUsers";
import InviteLanding from "./pages/InviteLanding";
import CaseTemplates from "./pages/CaseTemplates";
import AdminTestScenarios from "./pages/AdminTestScenarios";
import ResourceVerification from "./pages/ResourceVerification";
import FoiaTracking from "./pages/FoiaTracking";
import StatementOfFacts from "./pages/StatementOfFacts";
import Patterns from "./pages/Patterns";
import ImportBundle from "./pages/ImportBundle";
import MyApplications from "./pages/MyApplications";
import DiscoverBenefits from "./pages/DiscoverBenefits";
import MissionControl from "./pages/MissionControl";
import Lighthouse from "./pages/Lighthouse";
import CivicMap from "./pages/CivicMap";
import AnomalyViewfinder from "./pages/AnomalyViewfinder";
import DocketRoom from "./pages/DocketRoom";
import LumenSend from "./pages/LumenSend";
import LegalLibrary from "./pages/LegalLibrary";
import AgencyMetrics from "./pages/AgencyMetrics";
import CivilGideon from "./pages/CivilGideon";
import MentalHealth from "./pages/MentalHealth";
import CategoryLanding from "./pages/CategoryLanding";
import CategoryExplorer from "./pages/CategoryExplorer";
import DoctrineGraph from "./pages/DoctrineGraph";
import LitigationBarriers from "./pages/LitigationBarriers";
import SignalRegistry from "./pages/SignalRegistry";
import EnforcementIntel from "./pages/EnforcementIntel";
import DeadlineCalculator from "./pages/DeadlineCalculator";
import ContradictionScoring from "./pages/ContradictionScoring";
import EnforcementPathway from "./pages/EnforcementPathway";
import InvestigationWorkflow from "./pages/InvestigationWorkflow";
import ArchitectureMap from "./pages/ArchitectureMap";
import FilingGenerator from "./pages/FilingGenerator";
import ProofFrameworks from "./pages/ProofFrameworks";
import ClaimElements from "./pages/ClaimElements";
import ClaimDenialAnalysis from "./pages/ClaimDenialAnalysis";
import InvestigationGuidance from "./pages/InvestigationGuidance";
import CommandBoard from "./pages/CommandBoard";
import ControlRoom from "./pages/ControlRoom";
import KnowledgePopulation from "./pages/KnowledgePopulation";
import CaseResolutionLens from "./pages/CaseResolutionLens";
import StructuralDiagnosticsLens from "./pages/StructuralDiagnosticsLens";
import Mudroom from "./pages/Mudroom";
import WorkshopFloor from "./pages/WorkshopFloor";
import WorkbenchDashboard from "./pages/WorkbenchDashboard";
import EvidenceLab from "./pages/EvidenceLab";
import ShopOffice from "./pages/ShopOffice";
import ResourceDirectory from "./pages/ResourceDirectory";
import SovereignControl from "./pages/SovereignControl";
import GovernanceDashboard from "./pages/GovernanceDashboard";
import Verify from "./pages/Verify";
import ExtractionDashboard from "./pages/ExtractionDashboard";
import BusinessAnalytics from "./pages/BusinessAnalytics";

/**
 * Role-based entry routing:
 *   - Unauthenticated → /mudroom (calm entry, orientation)
 *   - Authenticated admin → /mission-control
 *   - Authenticated professional/analyst/enterprise plan → dashboard (DashboardRouter)
 *   - Authenticated free/advocacy with cases → /resolve (Repair Bench)
 *   - Authenticated free/advocacy without cases → /mudroom
 *
 * The Mudroom is a front porch, not a gate. All users can still visit any area.
 * Modes change the default entry point, not access.
 */
function HomeOrWelcome() {
  const { cases, isLoading } = useCase();
  const { isAuthenticated, user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (authLoading || isLoading) return;

    // For validation routes (/intake, /case/:id), bypass auth and allow access
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (pathname.startsWith('/intake') || pathname.startsWith('/case/')) {
        setChecked(true);
        return;
      }
    }

    if (!isAuthenticated) {
      // Not logged in → Mudroom (calm entry)
      navigate("/mudroom", { replace: true });
      setChecked(true);
      return;
    }

    // Allow all authenticated users to access dashboard (including admins)
    // Admins can still navigate to /mission-control if needed
    setChecked(true);
  }, [cases, isLoading, authLoading, isAuthenticated, user, navigate]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <Home />;
}

/** Full workspace — the existing power-user dashboard */
function DashboardRouter() {
  return (
    <DashboardLayout>
      <SovereignHeader />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/control-room" component={ControlRoom} />
        <Route path="/cases/:id/control-room" component={ControlRoom} />
        <Route path="/cases" component={Cases} />
        <Route path="/documents" component={Documents} />
        <Route path="/documents/:id" component={DocumentDetail} />
        <Route path="/upload" component={Upload} />
        <Route path="/entities" component={Entities} />
        <Route path="/entities/dedup" component={EntityDedup} />
        <Route path="/entities/:id" component={EntityDetail} />
        <Route path="/findings" component={Findings} />
        <Route path="/timeline" component={Timeline} />
        <Route path="/network" component={NetworkGraph} />
        <Route path="/chat" component={Chat} />
        <Route path="/exports" component={Exports} />
        <Route path="/audit" component={AuditTrail} />
        <Route path="/repair" component={CaseRepair} />
        <Route path="/cda" component={CdaRunList} />
        <Route path="/cda/:id" component={CdaRunDetail} />
        <Route path="/provenance" component={Provenance} />
        <Route path="/provenance/history" component={ProvenanceHistory} />
        <Route path="/extraction-failures" component={ExtractionFailures} />
        <Route path="/integrity" component={IntegrityDashboard} />
        <Route path="/spine/:caseId/:snapshotId" component={SpineViewer} />
        <Route path="/foia" component={FoiaTracking} />
        <Route path="/narrative" component={StatementOfFacts} />
        <Route path="/patterns" component={Patterns} />
                <Route path="/presentations" component={Presentations} />
                <Route path="/presentations/:id" component={PresentationEditor} />
                <Route path="/extraction" component={ExtractionDashboard} />
                <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <PlainLanguageProvider>
            <CaseProvider>
              <Switch>
                {/* Guided Advocacy Shell — standalone pages (no sidebar) */}
                <Route path="/welcome" component={Welcome} />                <Route path="/intake">
                  <ValidationRouteWrapper>
                    <Intake />
                  </ValidationRouteWrapper>
                </Route>
                <Route path="/case/:id">
                  <ValidationRouteWrapper>
                    <Case />
                  </ValidationRouteWrapper>
                </Route>
                <Route path="/luminari-intake" component={GuidedIntakeNew} />
                <Route path="/guided-intake" component={GuidedIntakeNew} />
                <Route path="/benefits" component={BenefitsNavigator} />
                <Route path="/my-applications" component={MyApplications} />
                <Route path="/discover" component={DiscoverBenefits} />
                <Route path="/guide/:caseId" component={GuidedDashboard} />
                <Route path="/shared/:token" component={SharedCaseView} />
                <Route path="/admin/feedback" component={AdminFeedback} />
                <Route path="/admin/analytics" component={AdminAnalytics} />
                <Route path="/admin/users" component={AdminUsers} />
                <Route path="/admin/test-scenarios" component={AdminTestScenarios} />
                <Route path="/admin/resource-verification" component={ResourceVerification} />
                <Route path="/invite/:token" component={InviteLanding} />
                <Route path="/templates" component={CaseTemplates} />
                <Route path="/import-bundle" component={ImportBundle} />
                <Route path="/mission-control" component={MissionControl} />
                <Route path="/" component={HomeOrWelcome} />
                <Route path="/lighthouse" component={Lighthouse} />
                <Route path="/civic-map" component={CivicMap} />
                <Route path="/viewfinder" component={AnomalyViewfinder} />
                <Route path="/docket" component={DocketRoom} />
                <Route path="/docket/:slug" component={DocketRoom} />
                <Route path="/lumensend" component={LumenSend} />
                <Route path="/legal-library" component={LegalLibrary} />
                <Route path="/agency-metrics" component={AgencyMetrics} />
                <Route path="/civil-gideon" component={CivilGideon} />
                <Route path="/mental-health" component={MentalHealth} />
                <Route path="/categories" component={CategoryExplorer} />
                <Route path="/category/:categoryId" component={CategoryLanding} />
                <Route path="/doctrine-graph" component={DoctrineGraph} />
                <Route path="/barriers" component={LitigationBarriers} />
                <Route path="/litigation-barriers" component={LitigationBarriers} />
                <Route path="/signal-registry" component={SignalRegistry} />
                <Route path="/enforcement-intel" component={EnforcementIntel} />
                <Route path="/deadline-calculator" component={DeadlineCalculator} />
                <Route path="/contradiction-scoring" component={ContradictionScoring} />
                <Route path="/enforcement-pathway" component={EnforcementPathway} />
                <Route path="/investigation-workflow" component={InvestigationWorkflow} />
                <Route path="/architecture-map" component={ArchitectureMap} />
                <Route path="/architecture" component={ArchitectureMap} />
                <Route path="/filing-generator" component={FilingGenerator} />
                <Route path="/proof-frameworks" component={ProofFrameworks} />
                <Route path="/claim-elements" component={ClaimElements} />
                <Route path="/claim-denial-analysis" component={ClaimDenialAnalysis} />
                <Route path="/investigation-guidance" component={InvestigationGuidance} />
                <Route path="/command-board" component={CommandBoard} />
                <Route path="/admin/knowledge-population" component={KnowledgePopulation} />
                <Route path="/resolve" component={CaseResolutionLens} />
                <Route path="/diagnostics" component={StructuralDiagnosticsLens} />
                <Route path="/mudroom" component={Mudroom} />
                <Route path="/workshop" component={WorkshopFloor} />
                <Route path="/workbench/:caseId" component={WorkbenchDashboard} />
                <Route path="/workbench" component={WorkbenchDashboard} />
                <Route path="/evidence-lab" component={EvidenceLab} />
                <Route path="/shop-office" component={ShopOffice} />
                <Route path="/resources" component={ResourceDirectory} />
                <Route path="/sovereign-control" component={SovereignControl} />
                <Route path="/mission-control/governance" component={GovernanceDashboard} />
                <Route path="/verify" component={Verify} />
                <Route path="/business-analytics" component={BusinessAnalytics} />

                {/* Full workspace — all existing dashboard routes */}
                <Route>
                  <DashboardRouter />
                </Route>
              </Switch>
              <GlobalUploadIndicator />
              <LuminariHelper />
            </CaseProvider>
          </PlainLanguageProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
