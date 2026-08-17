import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
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
