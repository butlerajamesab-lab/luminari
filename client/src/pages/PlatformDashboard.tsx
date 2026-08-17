import { ArrowRight, BriefcaseBusiness, LayoutDashboard } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/core/hooks/useAuth";
import {
  adminSection,
  allNavSections,
  type NavSection,
} from "@/components/navigation";

function CatalogSection({
  section,
  onNavigate,
}: {
  section: NavSection;
  onNavigate: (path: string) => void;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {section.label}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {section.items.length} {section.items.length === 1 ? "workspace" : "workspaces"}
          </p>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-mono text-muted-foreground">
          {section.items.length}
        </span>
      </div>

      <div className="space-y-1">
        {section.items.map((item) => (
          <button
            key={`${section.id}:${item.path}`}
            type="button"
            onClick={() => onNavigate(item.path)}
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <item.icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            <span className="min-w-0 flex-1 text-sm text-foreground">{item.label}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Canonical destination for the global Dashboard control.
 *
 * Case Overview intentionally lives at /case-overview. This page projects the
 * same platform registry used by the desktop left rail, and keeps that catalog
 * reachable on mobile where DashboardLayout hides the rail.
 */
export default function PlatformDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = user?.role === "admin";
  const sections = isAdmin ? [...allNavSections, adminSection] : allNavSections;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <LayoutDashboard className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Luminari platform catalog
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {isAdmin ? "Admin Dashboard" : "Platform Dashboard"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Open any Luminari workspace from the catalog. Case Overview is a separate case surface.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/case-overview")}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background/70 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BriefcaseBusiness className="h-4 w-4" />
            Case Overview
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((section) => (
          <CatalogSection key={section.id} section={section} onNavigate={navigate} />
        ))}
      </div>
    </div>
  );
}
