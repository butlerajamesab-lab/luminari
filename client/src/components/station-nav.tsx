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
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The canonical station list.
 *
 * Every person-facing hub renders the same strip (see StationNav below) so
 * a person can move from any station to any other. Keep this list as the one
 * source of truth: every href must stay registered in
 * shared/client-route-registry.ts (enforced by station-nav.test.tsx).
 */
export const STATION_LINKS = [
  { label: "Workshop Floor", href: "/workshop", icon: Wrench, station: "Pick a station. Move freely." },
  { label: "Control Room", href: "/control-room", icon: Shield, station: "Case command" },
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
 * The shared station strip. Renders on every person-facing hub as one slim
 * row of chips — no header of its own: the page already carries its own
 * title, so the strip names nothing and brands nothing (owner direction
 * 2026-11-22: "less is more"). The station for the page being viewed is
 * marked aria-current="page" with a visible active style, and stays a link
 * like every other station. The right-edge fade is the scroll cue: the row
 * scrolls sideways on narrow screens.
 */
export function StationNav() {
  const [location] = useLocation();
  return (
    <Card className="bg-card/50 border-border/50 overflow-hidden">
      <CardContent className="p-2">
        <div className="relative">
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 print:flex-wrap">
            {STATION_LINKS.map((link) => {
              const Icon = link.icon;
              const isCurrent = location === link.href;
              return (
                <Link key={link.href} href={link.href}>
                  <a
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex min-w-max items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors",
                      isCurrent
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/50 bg-background/40 text-foreground/80 hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 text-primary/80" />
                    {link.label}
                  </a>
                </Link>
              );
            })}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent print:hidden"
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default StationNav;
