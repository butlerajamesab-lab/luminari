import {
  Accessibility,
  ArrowLeft,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  Globe2,
  HandHeart,
  HeartPulse,
  Home,
  Landmark,
  Loader2,
  Mail,
  Map,
  MapPin,
  Phone,
  PlugZap,
  Scale,
  Search,
  ShieldAlert,
  Soup,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";

type Contact = {
  contact_point_id: string;
  contact_type: string;
  contact_value: string;
  label?: string | null;
  is_primary: boolean;
  contact_quality: string;
  manually_reviewed?: boolean;
  manual_source_reference?: string | null;
};

type ResourceLocation = {
  location_id: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  manual_location_kind?: string | null;
  manual_map_eligible?: boolean | null;
  manual_source_reference?: string | null;
  manual_review_version?: string | null;
};

type LocationResolution = {
  disposition?: string | null;
  location_kind?: string | null;
  map_eligible?: boolean | null;
  source_reference?: string | null;
  review_note?: string | null;
  review_version?: string | null;
};

type DirectoryResource = {
  resource_entity_id: string;
  canonical_id?: string | null;
  resource_name: string;
  source_resource_name: string;
  resource_type?: string | null;
  resource_category?: string | null;
  jurisdiction?: string | null;
  jurisdiction_scope?: string | null;
  state?: string | null;
  county?: string | null;
  city?: string | null;
  description?: string | null;
  eligibility_summary?: string | null;
  apply_notes?: string | null;
  service_categories: string[];
  verification_status: string;
  promotion_status: string;
  provenance_status: string;
  publication_status: "active" | "inactive";
  publication_source_reference?: string | null;
  publication_review_note?: string | null;
  contacts: Contact[];
  locations: ResourceLocation[];
  location_resolution?: LocationResolution | null;
};

type DirectorySummary = {
  total_resources: number;
  active_resources: number;
  inactive_resources: number;
  jurisdiction_count: number;
  category_count: number;
  contact_count: number;
  resources_with_contacts: number;
  location_count: number;
  resources_with_locations: number;
  verified_physical_sites: number;
  exact_mappable_resources: number;
  categories: Array<{ id: string; count: number }>;
  jurisdictions: Array<{
    code: string;
    count: number;
    categories?: Record<string, number>;
  }>;
};

type SearchResponse = {
  total: number;
  total_is_exact: boolean;
  has_more: boolean;
  limit: number;
  offset: number;
  items: DirectoryResource[];
};

const PAGE_SIZE = 24;

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AS: "American Samoa",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  GU: "Guam",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  MP: "Northern Mariana Islands",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  PR: "Puerto Rico",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VI: "U.S. Virgin Islands",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const CATEGORY_CONFIG = {
  general_resource: {
    label: "General Resources",
    description: "Broad service navigation and community support",
    icon: HandHeart,
    color: "emerald",
  },
  legal_civil_rights: {
    label: "Legal & Civil Rights",
    description: "Legal aid, advocacy, complaints, and rights",
    icon: Scale,
    color: "violet",
  },
  safety_crisis: {
    label: "Safety & Crisis",
    description: "Crisis response, violence prevention, and hotlines",
    icon: ShieldAlert,
    color: "rose",
  },
  healthcare: {
    label: "Healthcare",
    description: "Health coverage, clinics, and care navigation",
    icon: Stethoscope,
    color: "cyan",
  },
  food_nutrition: {
    label: "Food & Nutrition",
    description: "Food access, nutrition support, and benefits",
    icon: Soup,
    color: "amber",
  },
  tribal: {
    label: "Tribal Resources",
    description: "Tribal governments, Native services, and programs",
    icon: Users,
    color: "orange",
  },
  employment_labor: {
    label: "Employment & Labor",
    description: "Jobs, workforce support, wages, and labor rights",
    icon: BriefcaseBusiness,
    color: "blue",
  },
  housing: {
    label: "Housing",
    description: "Housing access, shelter, utilities, and tenant support",
    icon: Home,
    color: "yellow",
  },
  disability: {
    label: "Disability",
    description: "Disability services, access, and civil rights",
    icon: Accessibility,
    color: "teal",
  },
  utilities: {
    label: "Utilities",
    description: "Energy, water, communications, and bill support",
    icon: PlugZap,
    color: "sky",
  },
  cash_assistance: {
    label: "Cash Assistance",
    description: "Direct aid and income-support programs",
    icon: CircleDollarSign,
    color: "lime",
  },
  veterans: {
    label: "Veterans",
    description: "Veterans benefits, services, and advocacy",
    icon: Landmark,
    color: "indigo",
  },
} satisfies Record<
  string,
  {
    label: string;
    description: string;
    icon: React.ElementType;
    color: string;
  }
>;

function titleCase(value: string | null | undefined): string {
  if (!value) return "Other";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function categoryLabel(category: string | null | undefined): string {
  if (!category) return "Other";
  return (
    CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]?.label ??
    titleCase(category)
  );
}

function normalizeExternalUrl(value: string): string | null {
  const cleaned = value.trim();
  if (!cleaned || cleaned.toLowerCase().startsWith("n/a")) return null;
  const candidate = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;
  try {
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function phoneHref(value: string): string | null {
  const extensionless = value.split(/[·|]/)[0] ?? value;
  const digits = extensionless.replace(/\D/g, "");
  return digits.length >= 3 ? `tel:${digits}` : null;
}

function formatAddress(location: ResourceLocation | undefined): string | null {
  if (!location) return null;
  const locality = [location.city, location.state, location.postal_code]
    .filter(Boolean)
    .join(" ");
  const parts = [
    location.address_line1,
    location.address_line2,
    locality || location.county,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function locationLabel(resource: DirectoryResource): string {
  const current = resource.locations[0];
  if (current?.manual_location_kind) {
    return titleCase(current.manual_location_kind);
  }
  if (resource.location_resolution?.location_kind) {
    return titleCase(resource.location_resolution.location_kind);
  }
  if (resource.jurisdiction_scope) {
    return `${titleCase(resource.jurisdiction_scope)} coverage`;
  }
  return "Jurisdiction coverage";
}

function ContactAction({ contact }: { contact: Contact }) {
  const type = contact.contact_type.toLowerCase();
  const commonClass =
    "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition hover:-translate-y-0.5";

  if (type === "phone" || type === "hotline") {
    const href = phoneHref(contact.contact_value);
    if (!href) return null;
    return (
      <a
        href={href}
        className={`${commonClass} border-emerald-400/25 bg-emerald-400/10 text-emerald-200 hover:border-emerald-300/50`}
        title={contact.contact_value}
      >
        <Phone className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{contact.contact_value}</span>
      </a>
    );
  }

  if (type === "email") {
    return (
      <a
        href={`mailto:${contact.contact_value}`}
        className={`${commonClass} border-sky-400/25 bg-sky-400/10 text-sky-200 hover:border-sky-300/50`}
      >
        <Mail className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{contact.label || "Email"}</span>
      </a>
    );
  }

  if (
    type === "website" ||
    type === "portal" ||
    type === "filing_portal" ||
    type === "application"
  ) {
    const candidates = contact.contact_value.match(
      /https?:\/\/[^\s·|]+|(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s·|]*)?/gi,
    ) ?? [contact.contact_value];
    const links = candidates
      .map(normalizeExternalUrl)
      .filter((value): value is string => Boolean(value))
      .slice(0, 4);
    if (links.length === 0) return null;
    return (
      <>
        {links.map((href) => {
          const host = new URL(href).hostname.replace(/^www\./, "");
          return (
            <a
              key={`${contact.contact_point_id}:${href}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${commonClass} border-cyan-400/25 bg-cyan-400/10 text-cyan-200 hover:border-cyan-300/50`}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {links.length === 1 && contact.label
                  ? contact.label
                  : type.includes("portal")
                    ? `Portal · ${host}`
                    : host}
              </span>
            </a>
          );
        })}
      </>
    );
  }

  return null;
}

function ResourceCard({ resource }: { resource: DirectoryResource }) {
  const stateName =
    STATE_NAMES[resource.state ?? ""] || resource.state || "National";
  const currentLocation = resource.locations[0];
  const address = formatAddress(currentLocation);
  const visibleContacts = resource.contacts
    .filter((contact) =>
      [
        "phone",
        "hotline",
        "email",
        "website",
        "portal",
        "filing_portal",
        "application",
      ].includes(contact.contact_type.toLowerCase()),
    )
    .slice(0, 5);
  const description =
    resource.description ||
    resource.apply_notes ||
    resource.eligibility_summary ||
    "Source-attached public service resource.";
  const mapEligible = Boolean(
    currentLocation?.manual_map_eligible &&
    currentLocation.latitude != null &&
    currentLocation.longitude != null,
  );
  const mapParams = new URLSearchParams();
  if (resource.state) mapParams.set("jurisdiction", resource.state);
  if (mapEligible) mapParams.set("resource", resource.resource_entity_id);

  return (
    <article
      className={`flex h-full flex-col rounded-2xl border bg-slate-950/70 p-5 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:border-emerald-400/30 ${
        resource.publication_status === "inactive"
          ? "border-amber-400/25"
          : "border-white/10"
      }`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
          {categoryLabel(resource.resource_category)}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300">
          {stateName}
        </span>
        {resource.publication_status === "inactive" ? (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
            Historical · not operating
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-medium text-sky-200">
            <FileCheck2 className="h-3 w-3" />
            Source attached
          </span>
        )}
      </div>

      <h2 className="text-lg font-semibold leading-snug text-slate-50">
        {resource.resource_name}
      </h2>
      <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-300">
        {description}
      </p>

      {resource.eligibility_summary && (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.035] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Eligibility
          </p>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-300">
            {resource.eligibility_summary}
          </p>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-400">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <div>
          <span className="font-medium text-slate-200">
            {address || locationLabel(resource)}
          </span>
          {!address && (
            <span className="mt-0.5 block">
              Coverage is shown by jurisdiction; no street marker is implied.
            </span>
          )}
          {address && !currentLocation?.manual_review_version && (
            <span className="mt-0.5 block">
              Source address context; exact map placement is not yet reviewed.
            </span>
          )}
          {address &&
            currentLocation?.manual_review_version &&
            !mapEligible && (
              <span className="mt-0.5 block">
                Manually reviewed; no exact marker until genuine coordinates are
                added.
              </span>
            )}
        </div>
      </div>

      {resource.publication_status === "inactive" &&
        resource.publication_review_note && (
          <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/80">
            {resource.publication_review_note}
          </p>
        )}

      <div className="mt-auto pt-5">
        {visibleContacts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {visibleContacts.map((contact) => (
              <ContactAction key={contact.contact_point_id} contact={contact} />
            ))}
          </div>
        )}

        {resource.state && (
          <Link
            href={`/civic-map?${mapParams.toString()}`}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
          >
            <Map className="h-3.5 w-3.5" />
            {mapEligible ? "Show exact public site" : `Explore ${stateName}`}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </article>
  );
}

export default function ResourceDirectory() {
  const [, navigate] = useLocation();
  const initialParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const [queryDraft, setQueryDraft] = useState(
    initialParams.get("query") || "",
  );
  const [query, setQuery] = useState(initialParams.get("query") || "");
  const [jurisdiction, setJurisdiction] = useState(
    initialParams.get("jurisdiction") || "",
  );
  const [category, setCategory] = useState(initialParams.get("category") || "");
  const [page, setPage] = useState(0);

  const directoryQuery = trpc.resourceDirectory.search.useQuery(
    {
      query: query || undefined,
      jurisdiction: jurisdiction || undefined,
      category: category || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );
  // Let the first resource page settle before running the single-pass summary.
  // This keeps two expensive canonical-view reads from competing during the
  // public zero state while still caching filters and totals for five minutes.
  const summaryQuery = trpc.resourceDirectory.summary.useQuery(undefined, {
    enabled: directoryQuery.isSuccess || directoryQuery.isError,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const summary = summaryQuery.data as DirectorySummary | undefined;
  const searchResult = directoryQuery.data as SearchResponse | undefined;
  const jurisdictionOptions = summary?.jurisdictions ?? [];
  const categoryOptions = summary?.categories ?? [];
  const hasFilters = Boolean(query || jurisdiction || category);
  const exactVisibleTotal = !hasFilters
    ? summary?.total_resources
    : searchResult?.total_is_exact
      ? searchResult.total
      : undefined;

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (jurisdiction) params.set("jurisdiction", jurisdiction);
    if (category) params.set("category", category);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    window.history.replaceState({}, "", `${window.location.pathname}${suffix}`);
  }, [query, jurisdiction, category]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(0);
    setQuery(queryDraft.trim());
  }

  function clearFilters() {
    setQueryDraft("");
    setQuery("");
    setJurisdiction("");
    setCategory("");
    setPage(0);
  }

  function chooseCategory(nextCategory: string) {
    setCategory((current) => (current === nextCategory ? "" : nextCategory));
    setPage(0);
  }

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b12]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/lighthouse")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Lighthouse</span>
            </button>
            <div className="h-6 w-px bg-white/10" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 shrink-0 text-emerald-300" />
                <h1 className="truncate font-serif text-lg font-semibold">
                  Resource Directory
                </h1>
              </div>
              <p className="hidden text-[11px] text-slate-500 sm:block">
                The current governed civic resource collection
              </p>
            </div>
          </div>
          <Link
            href="/civic-map"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:border-emerald-300/50"
          >
            <Map className="h-4 w-4" />
            Civic Map
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_42%),radial-gradient(circle_at_80%_20%,rgba(14,165,233,0.11),transparent_34%)]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              Find real help
            </p>
            <h2 className="mt-3 max-w-4xl font-serif text-4xl font-semibold leading-tight text-white sm:text-6xl">
              Public resources, organized for people—not a graph.
            </h2>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              Search the complete promoted state and territory collection by
              need, jurisdiction, service, or organization. Locations are
              described honestly: exact public sites where known, coverage areas
              everywhere else.
            </p>

            <form
              onSubmit={submitSearch}
              className="mt-8 flex max-w-4xl flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-black/25 sm:flex-row"
            >
              <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-white/[0.04] px-4">
                <Search className="h-5 w-5 shrink-0 text-emerald-300" />
                <span className="sr-only">Search resources</span>
                <input
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder="Search housing, legal aid, food, disability…"
                  className="h-12 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                />
              </label>
              <select
                value={jurisdiction}
                onChange={(event) => {
                  setJurisdiction(event.target.value);
                  setPage(0);
                }}
                aria-label="Filter by jurisdiction"
                className="h-12 rounded-xl border border-white/10 bg-slate-900 px-4 text-sm text-slate-200 outline-none focus:border-emerald-400/50"
              >
                <option value="">All jurisdictions</option>
                {jurisdictionOptions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {STATE_NAMES[item.code] || item.code} ({item.count})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-12 rounded-xl bg-emerald-400 px-6 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
              >
                Search
              </button>
            </form>

            <div className="mt-7 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  value: summary?.total_resources,
                  label: "canonical resources",
                },
                {
                  value: summary?.jurisdiction_count,
                  label: "jurisdictions",
                },
                {
                  value: summary?.category_count,
                  label: "resource categories",
                },
                {
                  value: summary?.resources_with_locations,
                  label: "with reviewed location context",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3"
                >
                  <p className="font-mono text-xl font-bold text-white">
                    {stat.value == null ? "—" : stat.value.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-400">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Browse by need
              </p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-white">
                Twelve governed resource categories
              </h2>
            </div>
            {category && (
              <button
                type="button"
                onClick={() => chooseCategory(category)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
                Clear category
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {categoryOptions.map((item) => {
              const config =
                CATEGORY_CONFIG[item.id as keyof typeof CATEGORY_CONFIG];
              const Icon = config?.icon ?? HeartPulse;
              const selected = category === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => chooseCategory(item.id)}
                  aria-pressed={selected}
                  className={`group rounded-2xl border p-4 text-left transition ${
                    selected
                      ? "border-emerald-300/60 bg-emerald-400/12"
                      : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className={`rounded-xl p-2.5 ${
                        selected
                          ? "bg-emerald-300 text-emerald-950"
                          : "bg-white/5 text-emerald-300"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-300">
                      {item.count.toLocaleString()}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-white">
                    {config?.label || titleCase(item.id)}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {config?.description || "Public service resources"}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section className="border-t border-white/10 bg-slate-950/35">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
                  Directory results
                </p>
                <h2 className="mt-1 font-serif text-3xl font-semibold text-white">
                  {directoryQuery.isLoading
                    ? "Searching the collection…"
                    : exactVisibleTotal != null
                      ? `${exactVisibleTotal.toLocaleString()} resources`
                      : searchResult?.has_more
                        ? `At least ${searchResult.total.toLocaleString()} resources`
                        : `${(searchResult?.total ?? 0).toLocaleString()} resources`}
                </h2>
                {hasFilters && (
                  <p className="mt-1 text-sm text-slate-400">
                    {[
                      query ? `“${query}”` : null,
                      jurisdiction
                        ? STATE_NAMES[jurisdiction] || jurisdiction
                        : null,
                      category ? categoryLabel(category) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 sm:self-auto"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear all filters
                </button>
              )}
            </div>

            {directoryQuery.isLoading && (
              <div className="flex min-h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.025]">
                <div className="text-center">
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-emerald-300" />
                  <p className="mt-3 text-sm text-slate-400">
                    Loading canonical resources
                  </p>
                </div>
              </div>
            )}

            {directoryQuery.error && (
              <div className="rounded-2xl border border-rose-400/25 bg-rose-400/5 p-6">
                <h3 className="font-semibold text-rose-200">
                  The directory could not load.
                </h3>
                <p className="mt-2 text-sm text-rose-100/70">
                  {directoryQuery.error.message}
                </p>
                <button
                  type="button"
                  onClick={() => directoryQuery.refetch()}
                  className="mt-4 rounded-lg border border-rose-300/25 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-300/10"
                >
                  Try again
                </button>
              </div>
            )}

            {!directoryQuery.isLoading &&
              !directoryQuery.error &&
              searchResult?.items.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-10 text-center">
                  <Search className="mx-auto h-8 w-8 text-slate-600" />
                  <h3 className="mt-4 text-lg font-semibold text-white">
                    No matching resources
                  </h3>
                  <p className="mt-2 text-sm text-slate-400">
                    Try a broader term or clear one of the filters.
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-5 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-emerald-950"
                  >
                    Show the full directory
                  </button>
                </div>
              )}

            {searchResult && searchResult.items.length > 0 && (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {searchResult.items.map((resource) => (
                    <ResourceCard
                      key={resource.resource_entity_id}
                      resource={resource}
                    />
                  ))}
                </div>

                <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
                  <p className="text-xs text-slate-500">
                    Showing {(searchResult.offset + 1).toLocaleString()}–
                    {(
                      searchResult.offset + searchResult.items.length
                    ).toLocaleString()}
                    {searchResult.has_more
                      ? " · More matches available"
                      : " · End of results"}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => {
                        setPage((current) => Math.max(0, current - 1));
                        window.scrollTo({ top: 1050, behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 enabled:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <span className="px-2 font-mono text-xs text-slate-500">
                      Page {page + 1}
                    </span>
                    <button
                      type="button"
                      disabled={!searchResult.has_more}
                      onClick={() => {
                        setPage((current) => current + 1);
                        window.scrollTo({ top: 1050, behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 enabled:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
