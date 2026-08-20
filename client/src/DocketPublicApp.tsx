import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CaseProvider } from "./contexts/CaseContext";
import DocketRoom from "./pages/DocketRoom";
import MobileBottomNav from "./components/MobileBottomNav";

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

/**
 * Read-focused initial shell for direct Docket Room visits.
 *
 * The full Luminari application remains available after navigation leaves the
 * Docket routes, but the public first paint does not import every unrelated
 * application page. The <main> boundary also supplies the landmark expected by
 * assistive technology without changing Docket data or analysis semantics.
 */
export default function DocketPublicApp() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <CaseProvider>
            <main aria-label="The Docket Room" style={{ minHeight: "100vh" }}>
              <Switch>
                <Route path="/docket" component={DocketRoom} />
                <Route path="/docket/:slug" component={DocketRoom} />
                <Route component={FullApplicationForwarder} />
              </Switch>
            </main>
            <MobileBottomNav />
          </CaseProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
