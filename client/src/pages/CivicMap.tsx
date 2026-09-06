import { Link } from "wouter";
import { ArrowLeft, BookOpen, Compass, FileText, Home, Landmark, LayoutDashboard, MapPinned, Route, Wrench } from "lucide-react";

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

// The basemap key arrives from the Render environment
// (VITE_CARTO_BASEMAP_KEY) and is forwarded to the map frame as a query
// parameter — the source file stays free of embedded credentials, and the
// key can rotate without a code change.
const cartoBasemapKey = import.meta.env.VITE_CARTO_BASEMAP_KEY as
  | string
  | undefined;

export default function CivicMap() {
  const frameParams = new URLSearchParams(window.location.search);
  if (cartoBasemapKey && !frameParams.has("carto_key")) {
    frameParams.set("carto_key", cartoBasemapKey);
  }
  const frameSuffix = frameParams.toString() ? `?${frameParams.toString()}` : "";

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

      <iframe
        src={`/civicmap.html${frameSuffix}`}
        className="min-h-0 flex-1 border-0"
        title="Civic Map — Resource Directory geography"
      />
    </div>
  );
}
