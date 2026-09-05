import {
  ArrowLeft,
  ExternalLink,
  FileCheck2,
  Globe2,
  Loader2,
  Mail,
  Map,
  MapPin,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Link, useParams } from "wouter";
import { CommitToCase } from "@/components/CommitToCase";

type Contact = {
  contact_point_id?: string | null;
  contact_type: string;
  contact_value: string;
  label?: string | null;
  is_primary?: boolean;
  contact_quality?: string;
  manually_reviewed?: boolean;
  manual_source_reference?: string | null;
};

type ResourceLocation = {
  location_id?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  coordinate_quality?: string | null;
  manual_location_kind?: string | null;
  manual_map_eligible?: boolean | null;
  manual_source_reference?: string | null;
  manual_review_version?: string | null;
};

type ResourceRecord = {
  resource_entity_id: string;
  canonical_id?: string | null;
  resource_name: string;
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
  service_categories?: string[];
  verification_status?: string;
  promotion_status?: string | null;
  provenance_status?: string | null;
  publication_status?: string;
  publication_source_reference?: string | null;
  contacts?: Contact[];
  locations?: ResourceLocation[];
};

function titleCase(value: string | null | undefined): string {
  if (!value) return "Other";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
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

function ContactRow({ contact }: { contact: Contact }) {
  const type = contact.contact_type.toLowerCase();
  if (type === "phone" || type === "hotline") {
    const digits = (contact.contact_value.split(/[·|]/)[0] ?? "").replace(/\D/g, "");
    return (
      <a
        href={digits.length >= 3 ? `tel:${digits}` : undefined}
        className="flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100 transition hover:border-emerald-300/50"
      >
        <Phone className="h-4 w-4 shrink-0 text-emerald-300" />
        <span className="min-w-0 flex-1 break-words">{contact.contact_value}</span>
        {contact.label && (
          <span className="shrink-0 text-[10px] uppercase tracking-widest text-slate-500">
            {contact.label}
          </span>
        )}
      </a>
    );
  }
  if (type === "email") {
    return (
      <a
        href={`mailto:${contact.contact_value}`}
        className="flex items-center gap-3 rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-sm text-sky-100 transition hover:border-sky-300/50"
      >
        <Mail className="h-4 w-4 shrink-0 text-sky-300" />
        <span className="min-w-0 flex-1 break-all">{contact.contact_value}</span>
      </a>
    );
  }
  const candidate = /^https?:\/\//i.test(contact.contact_value)
    ? contact.contact_value
    : `https://${contact.contact_value}`;
  let href: string | null = null;
  try {
    const parsed = new URL(candidate);
    href = ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    href = null;
  }
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100 transition hover:border-cyan-300/50"
    >
      <ExternalLink className="h-4 w-4 shrink-0 text-cyan-300" />
      <span className="min-w-0 flex-1 break-all">{contact.contact_value}</span>
    </a>
  );
}

function ProvenanceRow({ label, value }: { label: string; value?: string | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 border-b border-white/5 py-2 text-xs leading-5 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="break-words font-mono text-slate-300">{value}</span>
    </div>
  );
}

export default function ResourceRecord() {
  const params = useParams<{ id: string }>();
  const recordId = params.id ?? "";

  const detailQuery = trpc.resourceDirectory.detail.useQuery(
    { resourceEntityId: recordId },
    { enabled: recordId.length > 0, retry: 1, refetchOnWindowFocus: false },
  );

  const resource = detailQuery.data as ResourceRecord | undefined;
  const locations = resource?.locations ?? [];
  const contacts = resource?.contacts ?? [];
  const primaryLocation = locations[0];
  const address = formatAddress(primaryLocation);
  const hasCoordinates =
    primaryLocation?.latitude != null && primaryLocation?.longitude != null;
  const mapParams = new URLSearchParams();
  if (resource?.state) mapParams.set("jurisdiction", resource.state);
  if (hasCoordinates) mapParams.set("resource", recordId);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b12]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/resource-directory"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-white/5 hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Resource Directory
          </Link>
          <div className="h-6 w-px bg-white/10" />
          <p className="truncate text-[11px] text-slate-500">
            Canonical record
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {detailQuery.isLoading && (
          <div className="flex min-h-64 items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-emerald-300" />
              <p className="mt-3 text-sm text-slate-400">
                Loading the canonical record
              </p>
            </div>
          </div>
        )}

        {detailQuery.error && (
          <div className="rounded-2xl border border-rose-400/25 bg-rose-400/5 p-6">
            <h1 className="font-semibold text-rose-200">
              This record could not be loaded.
            </h1>
            <p className="mt-2 text-sm text-rose-100/70">
              {detailQuery.error.message}
            </p>
            <Link
              href="/resource-directory"
              className="mt-4 inline-flex rounded-lg border border-rose-300/25 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-300/10"
            >
              Back to the directory
            </Link>
          </div>
        )}

        {resource && (
          <>
            <section>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                  {titleCase(resource.resource_category)}
                </span>
                {(resource.state || resource.jurisdiction) && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                    {resource.state || resource.jurisdiction}
                  </span>
                )}
                {resource.verification_status && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-1 text-[11px] font-medium text-sky-200">
                    <FileCheck2 className="h-3 w-3" />
                    {resource.verification_status}
                  </span>
                )}
              </div>
              <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight text-white sm:text-4xl">
                {resource.resource_name}
              </h1>
            </section>

            {resource.description && (
              <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  About
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                  {resource.description}
                </p>
              </section>
            )}

            {resource.eligibility_summary && (
              <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Eligibility
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                  {resource.eligibility_summary}
                </p>
              </section>
            )}

            {resource.apply_notes && (
              <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  How to apply
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-200">
                  {resource.apply_notes}
                </p>
              </section>
            )}

            {contacts.length > 0 && (
              <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  Contact
                </h2>
                <div className="mt-3 grid gap-2">
                  {contacts.map((contact, index) => (
                    <ContactRow
                      key={contact.contact_point_id ?? index}
                      contact={contact}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                Location
              </h2>
              <div className="mt-3 flex items-start gap-3 text-sm leading-6 text-slate-200">
                <MapPin className="mt-1 h-4 w-4 shrink-0 text-emerald-300" />
                <div>
                  <p>{address || "Coverage is shown by jurisdiction; no street marker is implied."}</p>
                  {primaryLocation?.coordinate_quality && (
                    <p className="mt-1 text-xs text-slate-500">
                      Coordinates: {titleCase(primaryLocation.coordinate_quality)}
                    </p>
                  )}
                </div>
              </div>
              {hasCoordinates && (
                <Link
                  href={`/civic-map?${mapParams.toString()}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
                >
                  <Map className="h-3.5 w-3.5" />
                  Show exact public site on the Civic Map
                </Link>
              )}
            </section>

            <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                Provenance
              </h2>
              <div className="mt-3">
                <ProvenanceRow label="Canonical identity" value={resource.canonical_id ?? resource.resource_entity_id} />
                <ProvenanceRow label="Record identity" value={resource.resource_entity_id} />
                <ProvenanceRow label="Source reference" value={resource.publication_source_reference} />
                <ProvenanceRow label="Provenance status" value={resource.provenance_status ? titleCase(resource.provenance_status) : null} />
                <ProvenanceRow label="Promotion status" value={resource.promotion_status ? titleCase(resource.promotion_status) : null} />
              </div>
            </section>

            <section className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
              <CommitToCase
                type="resource"
                itemId={resource.resource_entity_id}
                resourceName={resource.resource_name}
                size="default"
              />
              <Link
                href="/resource-directory"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                <Globe2 className="h-4 w-4" />
                Back to the directory
              </Link>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
