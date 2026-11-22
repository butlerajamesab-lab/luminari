import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { CaseProvider } from "./contexts/CaseContext";
import { useClickToRead } from "./contexts/ClickToReadContext";
import DocketRoom from "./pages/DocketRoom";
import MobileBottomNav from "./components/MobileBottomNav";

/**
 * Read-aloud toggle for the direct-Docket shell. This shell never mounts
 * the Luminari Helper — where the toggle lives in the full application —
 * so the shell carries its own, at the same corner coordinates the helper
 * button uses there. Without it, read-aloud could never be switched on
 * during a direct Docket visit.
 */
function DocketReadAloudToggle() {
  const { enabled, toggle } = useClickToRead();
  return (
    <button
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Turn off read aloud" : "Turn on read aloud"}
      className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full border border-border/60 bg-card/90 px-3 py-1.5 text-xs text-foreground shadow-lg backdrop-blur transition hover:bg-card md:bottom-6 md:right-6"
    >
      {enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      Read aloud: {enabled ? "On" : "Off"}
    </button>
  );
}

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
          <Toaster position="top-center" />
          <CaseProvider>
            <main aria-label="The Docket Room" style={{ minHeight: "100vh" }}>
              <Switch>
                <Route path="/docket" component={DocketRoom} />
                <Route path="/docket/:slug" component={DocketRoom} />
                <Route component={FullApplicationForwarder} />
              </Switch>
            </main>
            <MobileBottomNav />
            <DocketReadAloudToggle />
          </CaseProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
