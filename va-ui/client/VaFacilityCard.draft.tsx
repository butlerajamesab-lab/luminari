/**
 * VaFacilityCard — DRAFT (2026-10-30, not wired, not live).
 *
 * THE one card component for VA facility data, modeled on
 * LegislatorCard. Every surface that shows a facility (this page,
 * the Civic Map pull-through, doorways later) renders through this
 * component so facility data has exactly one shape.
 *
 * It never invents, infers, or fills in a missing value: absent
 * phone or website renders as an honest "not listed" line, and a
 * facility whose source record carries no street address shows its
 * hold reason instead of an address block. Operating status is the
 * VA's own code, shown verbatim whenever it is not NORMAL — it is
 * never translated into a verdict. It performs no write or contact
 * action — it only renders the official info stored on the row.
 */
import type { ReactNode } from "react";

/**
 * Explicit facility shape, mirroring the VA facilities router's
 * resolve output (public.va_facilities columns). Deliberately NOT
 * inferred from AppRouter: AppRouter inference is broken repo-wide
 * (pre-existing — the same failure hits the legislators hub), so
 * inference would leave this component's props untyped.
 *
 * The optional fields (operating_status_detail, hours, services)
 * are not part of the resolve subset; the router's `facility`
 * detail procedure supplies them, and the card renders them when
 * present.
 */
export type VaFacilityService = {
  service_id: string;
  service_name: string;
  service_link: string | null;
};

export type VaFacility = {
  facility_key: string;
  name: string;
  facility_type: string;
  classification: string | null;
  operating_status: string;
  operating_status_detail?: string | null;
  phone_main: string | null;
  website_url: string | null;
  physical_address1: string | null;
  physical_address2?: string | null;
  physical_address3?: string | null;
  physical_city: string | null;
  physical_state: string | null;
  physical_zip: string | null;
  latitude: number | null;
  longitude: number | null;
  is_mobile: boolean;
  hours?: Record<string, string> | null;
  services?: VaFacilityService[];
  source: string | null;
  fetched_date: string | null;
  verification_status: string | null;
  hold_flag: boolean;
  hold_reason: string | null;
};

/** Display labels for the API's four facility types (mirrors the router's map). */
export const FACILITY_TYPE_LABELS: Record<string, string> = {
  va_health_facility: "Health",
  va_benefits_facility: "Benefits",
  va_cemetery: "Cemeteries",
  vet_center: "Vet Centers",
};

/**
 * Proposed Civic Map route — placement inside the veterans area is
 * an open design question (DESIGN.md); the link exists whenever the
 * source supplied coordinates, per Alexander's rule that every
 * addressed resource goes into the Civic Map.
 */
const CIVIC_MAP_ROUTE = "/civic-map";

/** Mechanical typography only: TEMPORARY_CLOSURE -> "Temporary Closure". */
function statusLabel(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const tone = {
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.64)",
  faint: "rgba(240,236,228,0.5)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  gold: "#D4A017",
  blue: "#7eb3e8",
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <dt style={{ color: tone.muted, minWidth: 72 }}>{label}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
  );
}

export default function VaFacilityCard({
  facility,
}: {
  facility: VaFacility;
}) {
  const typeLabel =
    FACILITY_TYPE_LABELS[facility.facility_type] ?? facility.facility_type;
  const addressLines = [
    facility.physical_address1,
    facility.physical_address2,
    facility.physical_address3,
  ].filter(Boolean) as string[];
  const cityLine = [facility.physical_city, facility.physical_state]
    .filter(Boolean)
    .join(", ");
  const hours = facility.hours
    ? Object.entries(facility.hours).filter(([, v]) => v)
    : [];

  return (
    <article
      style={{
        border: `1px solid ${tone.card_border}`,
        background: tone.card_bg,
        borderRadius: 18,
        padding: "1.25rem",
        color: tone.paper,
      }}
    >
      <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.15rem" }}>
        {facility.name}
      </h3>
      <p style={{ margin: "0 0 0.25rem", color: tone.muted }}>
        {typeLabel}
        {facility.classification ? ` · ${facility.classification}` : ""}
        {cityLine ? ` · ${cityLine}` : ""}
      </p>

      {facility.operating_status !== "NORMAL" ? (
        <p
          style={{
            margin: "0.5rem 0 0",
            color: tone.gold,
            fontSize: "0.95rem",
          }}
        >
          Status: {statusLabel(facility.operating_status)}
          {facility.operating_status_detail
            ? ` — ${facility.operating_status_detail}`
            : ""}
        </p>
      ) : null}

      {facility.is_mobile ? (
        <p style={{ margin: "0.5rem 0 0", color: tone.gold, fontSize: "0.9rem" }}>
          Mobile facility — the VA warns its listed location may not be
          exact. Call before traveling.
        </p>
      ) : null}

      <dl
        style={{
          margin: "1rem 0 0",
          display: "grid",
          gap: "0.4rem",
          fontSize: "0.95rem",
          lineHeight: 1.5,
        }}
      >
        <Row label="Phone">
          {facility.phone_main ? (
            <a
              href={`tel:${facility.phone_main}`}
              style={{ color: tone.blue, textDecoration: "none" }}
            >
              {facility.phone_main}
            </a>
          ) : (
            "Not listed"
          )}
        </Row>
        <Row label="Web">
          {facility.website_url ? (
            <a
              href={facility.website_url}
              target="_blank"
              rel="noreferrer"
              style={{ color: tone.blue, textDecoration: "none" }}
            >
              Official website
            </a>
          ) : (
            "Official page not listed"
          )}
        </Row>
        <Row label="Address">
          {facility.hold_flag ? (
            <span>
              Street address not listed in the source
              {facility.hold_reason ? ` — ${facility.hold_reason}` : ""}.
              Call before traveling.
            </span>
          ) : addressLines.length > 0 ? (
            <span>
              {addressLines.map((line) => (
                <span key={line} style={{ display: "block" }}>
                  {line}
                </span>
              ))}
              <span style={{ display: "block" }}>
                {cityLine}
                {facility.physical_zip ? ` ${facility.physical_zip}` : ""}
              </span>
            </span>
          ) : (
            "Not listed"
          )}
        </Row>
        {facility.latitude !== null && facility.longitude !== null ? (
          <Row label="Map">
            <a
              href={`${CIVIC_MAP_ROUTE}?facility=${encodeURIComponent(facility.facility_key)}`}
              style={{ color: tone.blue, textDecoration: "none" }}
            >
              View on Civic Map
            </a>
          </Row>
        ) : null}
      </dl>

      {hours.length > 0 ? (
        <div style={{ marginTop: "1rem" }}>
          <h4
            style={{
              margin: "0 0 0.5rem",
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: tone.gold,
            }}
          >
            Hours
          </h4>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.6 }}>
            {hours.map(([day, value]) => (
              <li key={day}>
                {day.charAt(0).toUpperCase() + day.slice(1)}: {value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {facility.services && facility.services.length > 0 ? (
        <div style={{ marginTop: "1rem" }}>
          <h4
            style={{
              margin: "0 0 0.5rem",
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: tone.gold,
            }}
          >
            Services
          </h4>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.6 }}>
            {facility.services.map((service) => (
              <li key={service.service_id}>{service.service_name}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p
        style={{
          margin: "1rem 0 0",
          fontSize: "0.8rem",
          color: tone.faint,
        }}
      >
        Source: {facility.source}
        {facility.fetched_date ? ` · Fetched ${facility.fetched_date}` : ""}
        {facility.verification_status
          ? ` · ${facility.verification_status}`
          : ""}
      </p>
    </article>
  );
}
