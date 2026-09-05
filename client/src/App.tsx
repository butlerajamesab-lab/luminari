import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CaseProvider } from "./contexts/CaseContext";
import { PlainLanguageProvider } from "./contexts/PlainLanguageContext";
import DashboardLayout from "./components/DashboardLayout";
import Home from "./pages/Home";
import PlatformDashboard from "./pages/PlatformDashboard";
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
import MissionControlShell from "./pages/MissionControlShell";
import MissionControlLive from "./pages/MissionControlLive";
import MissionControlIntake from "./pages/MissionControlIntake";
import Lighthouse from "./pages/Lighthouse";
import CivicMap from "./pages/CivicMap";
import AnomalyViewfinder from "./pages/AnomalyViewfinder";
import docket_room_page from "./pages/DocketRoom";
import CivicGenome from "./pages/CivicGenome";
import LumenSend from "./pages/LumenSend";
import LegalLibrary from "./pages/LegalLibrary";
import MobileBottomNav from "./components/MobileBottomNav";
import AgencyMetrics from "./pages/AgencyMetrics";
import CivilGideon from "./pages/CivilGideon";
import native_nations_hub_page from "./pages/NativeNationsHub";
import recognition_atlas_page from "./pages/RecognitionAtlas";
import recognition_atlas_tribe_page from "./pages/RecognitionAtlasTribe";
import recognition_atlas_layer_page from "./pages/RecognitionAtlasLayer";
import recognition_gideon_page from "./pages/RecognitionGideon";
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
import InvestigationGuidance from "./pages/InvestigationGuidance";
import CommandBoard from "./pages/CommandBoard";
import ControlRoom from "./pages/ControlRoom";
import KnowledgePopulation from "./pages/KnowledgePopulation";
import CaseResolutionLens from "./pages/CaseResolutionLens";
import StructuralDiagnosticsLens from "./pages/StructuralDiagnosticsLens";
import Mudroom from "./pages/Mudroom";
import Login from "./pages/Login";
import WorkshopFloor from "./pages/WorkshopFloor";
import WorkbenchDashboard from "./pages/WorkbenchDashboard";
import EvidenceLab from "./pages/EvidenceLab";
import ShopOffice from "./pages/ShopOffice";
import ResourceDirectory from "./pages/ResourceDirectory";
import SovereignControl from "./pages/SovereignControl";
import ingestion_control from "./pages/ingestion_control";
import GovernanceDashboard from "./pages/GovernanceDashboard";
import Verify from "./pages/Verify";
import BusinessAnalytics from "./pages/BusinessAnalytics";
import IntegrityReview from "./pages/IntegrityReview";

function DashboardRouter() {
  return (
    <DashboardLayout>
      <SovereignHeader />
      <Switch>
        <Route path="/dashboard" component={PlatformDashboard} />
        <Route path="/case-overview" component={Home} />
        <Route path="/" component={PlatformDashboard} />
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
        <Route path="/foia" component={FoiaTracking} />
        <Route path="/narrative" component={StatementOfFacts} />
        <Route path="/patterns" component={Patterns} />
        <Route path="/presentations" component={Presentations} />
        <Route path="/presentations/:id" component={PresentationEditor} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

const PUBLIC_ROOT_SEEN_KEY = "luminari-public-root-seen";

function PublicEntry() {
  const [, setLocation] = useLocation();
  const [isFirstVisit] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(PUBLIC_ROOT_SEEN_KEY) !== "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isFirstVisit) {
      window.localStorage.setItem(PUBLIC_ROOT_SEEN_KEY, "true");
      return;
    }
    setLocation("/lighthouse", { replace: true });
  }, [isFirstVisit, setLocation]);

  if (isFirstVisit) return <Welcome />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Opening Lighthouse...
    </div>
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
                <Route path="/welcome" component={Welcome} />
                <Route path="/intake"><ValidationRouteWrapper><Intake /></ValidationRouteWrapper></Route>
                <Route path="/case/:id"><ValidationRouteWrapper><Case /></ValidationRouteWrapper></Route>
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
                <Route path="/mission-control/live" component={MissionControlLive} />
                <Route path="/mission-control/intake" component={MissionControlIntake} />
                <Route path="/mission-control/full" component={MissionControl} />
                <Route path="/mission-control" component={MissionControlShell} />
                <Route path="/sovereign-control" component={SovereignControl} />
                <Route path="/ingestion-control" component={ingestion_control} />
                <Route path="/dashboard"><DashboardRouter /></Route>
                <Route path="/case-overview"><DashboardRouter /></Route>
                <Route path="/" component={PublicEntry} />
                <Route path="/lighthouse" component={Lighthouse} />
                <Route path="/civic-map" component={CivicMap} />
                <Route path="/viewfinder" component={AnomalyViewfinder} />
                <Route path="/docket" component={docket_room_page} />
                <Route path="/docket/:slug" component={docket_room_page} />
                <Route path="/civic-genome" component={CivicGenome} />
                <Route path="/civic-genome/bill/:bill_id" component={CivicGenome} />
                <Route path="/lumensend" component={LumenSend} />
                <Route path="/legal-library" component={LegalLibrary} />
                <Route path="/agency-metrics" component={AgencyMetrics} />
                <Route path="/civil-gideon" component={CivilGideon} />
                <Route path="/native-nations" component={native_nations_hub_page} />
                <Route path="/recognition-gideon" component={recognition_gideon_page} />
                <Route path="/recognition-atlas/:tribe_id/:layer_slug" component={recognition_atlas_layer_page} />
                <Route path="/recognition-atlas/:tribe_id" component={recognition_atlas_tribe_page} />
                <Route path="/recognition-atlas" component={recognition_atlas_page} />
                <Route path="/mental-health" component={MentalHealth} />
                <Route path="/categories" component={CategoryExplorer} />
                <Route path="/category/:categoryId" component={CategoryLanding} />
                <Route path="/doctrine-graph" component={DoctrineGraph} />
                <Route path="/barriers" component={LitigationBarriers} />
                <Route path="/litigation-barriers" component={LitigationBarriers} />
                <Route path="/signal-registry" component={SignalRegistry} />
                <Route path="/integrity-review" component={IntegrityReview} />
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
                <Route path="/investigation-guidance" component={InvestigationGuidance} />
                <Route path="/command-board" component={CommandBoard} />
                <Route path="/admin/knowledge-population" component={KnowledgePopulation} />
                <Route path="/resolve" component={CaseResolutionLens} />
                <Route path="/diagnostics" component={StructuralDiagnosticsLens} />
                <Route path="/mudroom" component={Mudroom} />
                <Route path="/login" component={Login} />
                <Route path="/workshop" component={WorkshopFloor} />
                <Route path="/workbench/:caseId" component={WorkbenchDashboard} />
                <Route path="/workbench" component={WorkbenchDashboard} />
                <Route path="/evidence-lab" component={EvidenceLab} />
                <Route path="/shop-office" component={ShopOffice} />
                <Route path="/resources" component={ResourceDirectory} />
                <Route path="/resource-directory" component={ResourceDirectory} />
                <Route path="/mission-control/governance" component={GovernanceDashboard} />
                <Route path="/verify" component={Verify} />
                <Route path="/business-analytics" component={BusinessAnalytics} />
                <Route><DashboardRouter /></Route>
              </Switch>
              <MobileBottomNav />
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
