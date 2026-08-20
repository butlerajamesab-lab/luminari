import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CaseProvider } from "./contexts/CaseContext";
import { PlainLanguageProvider } from "./contexts/PlainLanguageContext";
import CivicGenome from "./pages/CivicGenome";
import MobileBottomNav from "./components/MobileBottomNav";
import GlobalUploadIndicator from "./components/GlobalUploadIndicator";
import { LuminariHelper } from "./components/LuminariHelper";

/**
 * The public Civic Genome route is a read-focused delivery shell. It preserves
 * the same shared providers and presentation helpers as the full application,
 * but does not eagerly import every unrelated Luminari page into the initial
 * browser bundle. If client-side navigation leaves the Civic Genome route, the
 * browser reloads once and main.tsx selects the complete application shell.
 */
function FullApplicationForwarder() {
  useEffect(() => {
    window.location.reload();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="animate-pulse text-muted-foreground">Loading Luminari...</div>
    </main>
  );
}

export default function CivicGenomePublicApp() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <PlainLanguageProvider>
            <CaseProvider>
              <Switch>
                <Route path="/civic-genome" component={CivicGenome} />
                <Route path="/civic-genome/bill/:bill_id" component={CivicGenome} />
                <Route component={FullApplicationForwarder} />
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
