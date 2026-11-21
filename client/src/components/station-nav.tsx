import { Link, useLocation } from "wouter";
import {
  Brain,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileText,
  FolderOpen,
  HelpCircle,
  Landmark,
  Map,
  MapPin,
  Scale,
  Send,
  Shield,
  UploadCloud,
  Vote,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The canonical Workshop Floor station list.
 *
 * Every person-facing hub renders the same strip (see StationNav below) so
 * a person can move from any station to any other — "Pick a station. Move
 * freely. Every station connects to the others." Keep this list as the one
 * source of truth: every href must stay registered in
 * shared/client-route-registry.ts (enforced by station-nav.test.tsx).
 */
export const STATION_LINKS = [
  { label: "Workshop Floor", href: "/workshop", icon: Wrench, station: "Pick a station. Move freely." },
  { label: "Control Room / Lighthouse", href: "/control-room", icon: Shield, station: "Case command" },
  { label: "Lighthouse Hub", href: "/lighthouse", icon: Landmark, station: "Community Board" },
  { label: "CivicMap", href: "/civic-map", icon: Map, station: "Mapped resources" },
  { label: "Legal Library", href: "/legal-library", icon: Scale, station: "Doctrine" },
  { label: "Anomaly Viewfinder", href: "/viewfinder", icon: Brain, station: "Signals" },
  { label: "FOIA Tracker", href: "/foia", icon: FileText, station: "Requests" },
  { label: "Case Resolution", href: "/resolve", icon: CheckCircle2, station: "Repair Bench" },
  { label: "Guided Intake", href: "/guided-intake", icon: HelpCircle, station: "Repair Bench" },
  { label: "Upload Evidence", href: "/upload", icon: UploadCloud, station: "Evidence Lab" },
  { label: "Resource Directory", href: "/resources", icon: FolderOpen, station: "Community Board" },
  { label: "LumenSend", href: "/lumensend", icon: Send, station: "Shop Office" },
  { label: "Filing Generator", href: "/filing-generator", icon: ClipboardList, station: "Shop Office" },
  { label: "Case Dashboard", href: "/workbench", icon: Building2, station: "Case workspace" },
  { label: "Find an Office", href: "/find-an-office", icon: MapPin, station: "Community Board" },
  { label: "Legislators", href: "/legislators", icon: Vote, station: "Community Board" },
];

export type StationLink = (typeof STATION_LINKS)[number];

/**
 * The shared Workshop Floor station strip. Renders on every person-facing
 * hub; the station for the page being viewed is marked aria-current="page"
 * with a visible active style, and stays a link like every other station.
 */
export function StationNav() {
  const [location] = useLocation();
  return (
    <Card className="bg-card/50 border-border/50 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" />
          Workshop Floor navigation
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Pick a station. Move freely. Every station connects to the others.
        </p>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 print:flex-wrap">
          {STATION_LINKS.map((link) => {
            const Icon = link.icon;
            const isCurrent = location === link.href;
            return (
              <Link key={link.href} href={link.href}>
                <a
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "min-w-max rounded-lg border px-3 py-2 text-left transition-colors",
                    isCurrent
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/50 bg-background/40 hover:border-primary/40 hover:bg-primary/5",
                  )}
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <Icon className="w-3.5 h-3.5 text-primary/80" />
                    {link.label}
                  </span>
                  <span className="block text-[10px] text-muted-foreground mt-0.5">{link.station}</span>
                </a>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default StationNav;
