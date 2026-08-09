/**
 * Backward-compatible route for historical /case/:id links.
 *
 * Lighthouse has one canonical case workspace: /guide/:caseId. This component
 * performs no case query and owns no alternate case state.
 */

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { caseWorkspacePath } from "@/lib/caseNavigation";

export default function Case() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const destination = caseWorkspacePath(id);

  useEffect(() => {
    setLocation(destination, { replace: true });
  }, [destination, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Opening the canonical case workspace…</p>
      </div>
    </div>
  );
}
