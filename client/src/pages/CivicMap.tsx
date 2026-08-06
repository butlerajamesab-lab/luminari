import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import MapIntakePanel from "./MapIntakePanel";
import { ArrowLeft, BookOpen, Compass, FileText, Home, Landmark, LayoutDashboard, MapPinned, Route, Wrench } from "lucide-react";

const CIVIC_MAP_INTAKE_REQUEST = "luminari:civic-map:intake-request" as const;

type CivicMapIntakeRequest = {
  type: typeof CIVIC_MAP_INTAKE_REQUEST;
  entryKind: "jurisdiction" | "resource";
  lat: number;
  lng: number;
};

function isCivicMapIntakeRequest(value: unknown): value is CivicMapIntakeRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CivicMapIntakeRequest>;
  const lat = candidate.lat;
  const lng = candidate.lng;
  return (
    candidate.type === CIVIC_MAP_INTAKE_REQUEST &&
    (candidate.entryKind === "jurisdiction" || candidate.entryKind === "resource") &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

const navItems = [
  { href: "/lighthouse", label: "Lighthouse", icon: Home },
  { href: "/guided-intake", label: "Start / Intake", icon: Route },
  { href: "/cases", label: "My Case", icon: FileText },
  { href: "/workshop", label: "Workshop", icon: Wrench },
  { href: "/legal-library", label: "Legal Library", icon: BookOpen },
  { href: "/viewfinder", label: "Viewfinder", icon: Compass },
  { href: "/docket", label: "Docket Room", icon: Landmark },
  { href: "/mission-control", label: "Mission Control", icon: LayoutDashboard },
];

export default function CivicMap() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [intakePoint, setIntakePoint] = useState<{ lat: number; lng: number } | null>(null);
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!isCivicMapIntakeRequest(event.data)) return;
      setIntakePoint({ lat: event.data.lat, lng: event.data.lng });
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/lighthouse" className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Lighthouse
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="flex min-w-0 items-center gap-2">
            <MapPinned className="h-4 w-4 text-cyan-400" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">Civic Map</h1>
              <p className="truncate text-[11px] text-muted-foreground">Geographic view of the v3.13 Resource Directory</p>
            </div>
          </div>
        </div>

        <nav className="flex max-w-full items-center gap-1 overflow-x-auto">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-card/70 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-200"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="relative min-h-0 flex-1">
        <iframe
          ref={iframeRef}
          src={`/civicmap.html${window.location.search}`}
          className="h-full w-full border-0"
          title="Civic Map — Resource Directory geography"
        />
        {intakePoint && (
          <MapIntakePanel
            lat={intakePoint.lat}
            lng={intakePoint.lng}
            isAuthenticated={isAuthenticated}
            onClose={() => setIntakePoint(null)}
            onNavigate={setLocation}
          />
        )}
      </div>
    </div>
  );
}
