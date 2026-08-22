import { trpc } from "@/lib/trpc";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

type CompactContact = {
  contact_point_id: string;
  contact_type: string;
  contact_value: string;
};

type CompactResource = {
  resource_entity_id: string;
  resource_name: string;
  resource_category?: string | null;
  state?: string | null;
  description?: string | null;
  apply_notes?: string | null;
  contacts: CompactContact[];
};

type CompactSearchResponse = {
  total: number;
  total_is_exact: boolean;
  has_more: boolean;
  items: CompactResource[];
};

type DirectoryFilter = {
  category?: string;
  query?: string;
};

const PIPELINE_FILTERS: Record<string, DirectoryFilter> = {
  insurance: { query: "insurance" },
  custody: { category: "legal_civil_rights", query: "family" },
  medical: { category: "healthcare" },
  workplace: { category: "employment_labor" },
  housing: { category: "housing" },
  consumer: { category: "legal_civil_rights", query: "consumer" },
  disability: { category: "disability" },
  medicaid: { category: "healthcare", query: "Medicaid" },
  snap: { category: "food_nutrition", query: "SNAP" },
  veterans: { category: "veterans" },
  unemployment: { category: "employment_labor", query: "unemployment" },
  nursing: { category: "healthcare", query: "long-term care" },
  guardianship: { category: "legal_civil_rights", query: "guardianship" },
  elderabuse: { category: "safety_crisis", query: "elder" },
  immigration: { category: "legal_civil_rights", query: "immigration" },
  childwelfare: { category: "safety_crisis", query: "child welfare" },
  education: { category: "general_resource", query: "education" },
  section8: { category: "housing", query: "housing voucher" },
  juvenile: { category: "legal_civil_rights", query: "juvenile" },
  icwa: { category: "tribal", query: "Indian Child Welfare" },
  mmiw: { category: "tribal", query: "missing" },
  treatyrights: { category: "tribal", query: "treaty" },
  triballand: { category: "tribal", query: "land" },
  tribalenrollment: { category: "tribal", query: "enrollment" },
  tribalhousing: { category: "tribal", query: "housing" },
  tribalsovereignty: { category: "tribal", query: "sovereignty" },
  workerscomp: { category: "employment_labor", query: "workers compensation" },
  wrongfulconviction: {
    category: "legal_civil_rights",
    query: "wrongful conviction",
  },
  debtcollection: { category: "legal_civil_rights", query: "debt" },
  policemisconduct: {
    category: "legal_civil_rights",
    query: "police misconduct",
  },
  bankruptcy: { category: "legal_civil_rights", query: "bankruptcy" },
  environmental: { category: "general_resource", query: "environmental" },
  hoa: { category: "housing", query: "homeowner" },
  taxdispute: { category: "legal_civil_rights", query: "tax" },
  fostercare: { category: "safety_crisis", query: "foster" },
  medmalpractice: { category: "healthcare", query: "medical complaint" },
  predatorylending: {
    category: "legal_civil_rights",
    query: "lending",
  },
  whistleblower: {
    category: "legal_civil_rights",
    query: "whistleblower",
  },
  nonprofitcompliance: {
    category: "general_resource",
    query: "nonprofit",
  },
};

function phoneHref(value: string): string | null {
  const digits = (value.split(/[·|]/)[0] || value).replace(/\D/g, "");
  return digits.length >= 3 ? `tel:${digits}` : null;
}

function websiteHref(value: string): string | null {
  const match = value.match(
    /https?:\/\/[^\s·|]+|(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s·|]*)?/i,
  )?.[0];
  if (!match) return null;
  const candidate = /^https?:\/\//i.test(match) ? match : `https://${match}`;
  try {
    return new URL(candidate).href;
  } catch {
    return null;
  }
}

export function ResourceDirectory({
  pipelineType,
}: {
  pipelineType?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const filter = useMemo<DirectoryFilter>(() => {
    if (!pipelineType) return {};
    return (
      PIPELINE_FILTERS[pipelineType] ?? {
        query: pipelineType.replace(/[_-]+/g, " "),
      }
    );
  }, [pipelineType]);

  const directoryQuery = trpc.resourceDirectory.search.useQuery(
    {
      query: filter.query,
      category: filter.category,
      limit: 6,
      offset: 0,
    },
    {
      enabled: expanded,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );
  const result = directoryQuery.data as CompactSearchResponse | undefined;

  const directoryParams = new URLSearchParams();
  if (filter.query) directoryParams.set("query", filter.query);
  if (filter.category) directoryParams.set("category", filter.category);
  const directoryHref = `/resources${
    directoryParams.toString() ? `?${directoryParams.toString()}` : ""
  }`;

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-card/50">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between p-4 transition-colors hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">Resource Directory</span>
          <span className="text-xs text-muted-foreground">
            {expanded && result
              ? result.total_is_exact
                ? `${result.total.toLocaleString()} matches`
                : `${result.total.toLocaleString()}+ matches`
              : "current collection"}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2 px-4 pb-4">
          {directoryQuery.isLoading && (
            <div className="flex items-center gap-2 rounded-md border border-border/40 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              Loading canonical resources…
            </div>
          )}

          {directoryQuery.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              The canonical directory could not load.
            </div>
          )}

          {result?.items.map((resource) => {
            const phone = resource.contacts.find((contact) =>
              ["phone", "hotline"].includes(contact.contact_type.toLowerCase()),
            );
            const website = resource.contacts.find((contact) =>
              ["website", "portal", "filing_portal"].includes(
                contact.contact_type.toLowerCase(),
              ),
            );
            const callHref = phone ? phoneHref(phone.contact_value) : null;
            const visitHref = website
              ? websiteHref(website.contact_value)
              : null;
            return (
              <div
                key={resource.resource_entity_id}
                className="rounded-md border border-border/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {resource.resource_name}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {resource.description ||
                        resource.apply_notes ||
                        "Source-attached public resource."}
                    </p>
                  </div>
                  {resource.state && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                      <MapPin className="h-3 w-3" />
                      {resource.state}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {callHref && phone && (
                    <a
                      href={callHref}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 px-2.5 py-1 text-[10px] font-semibold text-emerald-300"
                    >
                      <Phone className="h-3 w-3" />
                      Call
                    </a>
                  )}
                  {visitHref && (
                    <a
                      href={visitHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-cyan-400/20 px-2.5 py-1 text-[10px] font-semibold text-cyan-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Website
                    </a>
                  )}
                </div>
              </div>
            );
          })}

          {result && result.items.length === 0 && (
            <p className="rounded-md border border-border/40 p-3 text-xs text-muted-foreground">
              No exact pipeline match. Open the full collection to search across
              every category.
            </p>
          )}

          <Link
            href={directoryHref}
            className="flex items-center justify-center gap-2 rounded-md border border-emerald-400/25 bg-emerald-400/10 p-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/15"
          >
            <Search className="h-3.5 w-3.5" />
            Search the full Resource Directory
          </Link>
        </div>
      )}
    </div>
  );
}
