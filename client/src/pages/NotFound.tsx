import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { caseWorkspacePath } from "@/lib/caseNavigation";

export default function NotFound() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const legacy_case_id_match = location.match(/^\/(\d+)$/);
    if (!legacy_case_id_match) return;

    setLocation(caseWorkspacePath(legacy_case_id_match[1]), { replace: true });
  }, [location, setLocation]);

  if (/^\/(\d+)$/.test(location)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-sm text-muted-foreground">
        Opening case workspace...
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Button variant="outline" onClick={() => setLocation("/dashboard")}>
        Return to Dashboard
      </Button>
    </div>
  );
}
