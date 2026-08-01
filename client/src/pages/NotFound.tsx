import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import PrismV2 from "./PrismV2";

export default function NotFound() {
  const [location, setLocation] = useLocation();

  // Prism V2 is intentionally frontend-only and mounted through the existing
  // catch-all route so no backend or application-router contract is changed.
  if (location === "/prism" || location.startsWith("/prism/")) {
    return <PrismV2 />;
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Button variant="outline" onClick={() => setLocation("/")}>
        Return to Dashboard
      </Button>
    </div>
  );
}
