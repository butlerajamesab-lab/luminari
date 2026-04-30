import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const links = [
  { href: "/lighthouse", label: "Lighthouse" },
  { href: "/civic-map", label: "Civic Map" },
  { href: "/signal-registry", label: "Signal Registry" },
  { href: "/mission-control", label: "Mission Control" },
];

export function SovereignHeader() {
  const [location] = useLocation();

  return (
    <header className="mb-6 rounded-2xl border border-border/70 bg-card/75 px-5 py-4 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Luminari V1</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Sovereign Operations Console</h1>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Primary workspace navigation">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              <span
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm transition-colors",
                  location === link.href
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background/70 text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default SovereignHeader;
