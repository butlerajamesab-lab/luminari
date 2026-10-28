/**
 * LegislatorCard — THE one card component for legislator data.
 *
 * Every surface that shows a legislator (hub page now, doorways later)
 * renders through this component so member data has exactly one shape.
 * It never invents, infers, or fills in a missing value: absent phone,
 * email, website, or bio renders as an honest "not listed" line.
 * A present phone renders as a tel: link and a present email as a
 * mailto: link; a contact_method fallback is not an address and stays
 * plain text. The card links out to LumenSend compose (inquiry, with
 * a manual context — the context parameter only accepts the server's
 * fixed context-type enum, never member text — and the member's name
 * and office as the situation seed) and attaches the member to
 * a case through the shared CommitToCase resource path (member_key as
 * the resource ref). It never writes legislator data itself.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { CommitToCase } from "../CommitToCase";

/**
 * Explicit member shape, mirroring the legislators router's output
 * (public.legislators columns + attached committees). Deliberately NOT
 * inferred from AppRouter: AppRouter inference is broken repo-wide
 * (pre-existing — the same failure hits DocketRoom's trpc.docket calls),
 * so inference would leave this component's props untyped. If AppRouter
 * inference is ever repaired, this shape can switch back to
 * inferRouterOutputs<AppRouter>["legislators"]["member"].
 */
export type LegislatorCommittee = {
  committee_name: string;
  subcommittee_name: string;
  role: string | null;
  time_marker: string;
  time_kind: string | null;
};

export type LegislatorMember = {
  member_key: string;
  level: string;
  chamber: string;
  state: string;
  district: string | null;
  full_name: string;
  party: string | null;
  status: string;
  representation: string | null;
  phone: string | null;
  email: string | null;
  contact_method: string | null;
  contact_note: string | null;
  website_url: string | null;
  office_address: string | null;
  office_classification: string | null;
  district_office_address: string | null;
  district_phone: string | null;
  photo_url: string | null;
  bio_url: string | null;
  bio_text: string | null;
  bio_source: string | null;
  links_json: string | null;
  source: string | null;
  source_url: string | null;
  source_update: string | null;
  fetched_date: string | null;
  last_refreshed: string | null;
  verification_status: string | null;
  committees: LegislatorCommittee[];
};

/** Display-only state names (mirrors the router's map; never a data source). */
const STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
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
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
  PR: "Puerto Rico",
  AS: "American Samoa",
  GU: "Guam",
  MP: "Northern Mariana Islands",
  VI: "U.S. Virgin Islands",
};

export function chamberDisplay(level: string, chamber: string): string {
  if (level === "federal" && chamber === "senate") return "U.S. Senate";
  if (level === "federal" && chamber === "house") return "U.S. House";
  if (level === "state" && chamber === "upper") return "State Senate";
  if (level === "state" && chamber === "lower") return "State House";
  if (level === "state" && chamber === "legislature") return "Legislature";
  return chamber;
}

/**
 * District label: numeric districts become "District N". Stored
 * non-numeric values render verbatim ("At-Large", "Ward N"). A federal
 * district of "0" is at-large — but it is NOT always a delegate seat:
 * single-district states (AK, DE, ND, SD, VT, WY) elect a voting
 * at-large representative, while AS, DC, GU, MP, PR, VI send a
 * non-voting delegate. The stored representation decides which label
 * applies; without it, "At-Large" is the honest neutral label.
 * A missing district (e.g. a senator) renders as "Statewide".
 */
function districtLabel(
  level: string,
  district: string | null,
  representation: string | null,
): string {
  if (!district) return "Statewide";
  if (level === "federal" && district === "0") {
    return representation?.includes("delegate")
      ? "At-Large Delegate"
      : "At-Large";
  }
  if (/^[0-9]+$/.test(district)) return `District ${district}`;
  return district;
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function LegislatorCard({
  member,
}: {
  member: LegislatorMember;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [, navigate] = useLocation();
  const showPhoto = Boolean(member.photo_url) && !photoFailed;
  const stateName = STATE_NAMES[member.state] ?? member.state;
  // Email renders as a mailto link ONLY when the stored value is a real
  // address. A contact_method fallback ("contact form on official website")
  // is not an address and stays plain text, never a fabricated mailto.
  const emailLine = member.email
    ? member.email
    : member.contact_method
      ? member.contact_method
      : "Not listed";
  const contactLinkStyle = { color: "#7eb3e8", textDecoration: "none" };
  const lumenSendContext = [
    member.full_name,
    chamberDisplay(member.level, member.chamber),
    stateName,
    districtLabel(member.level, member.district, member.representation),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      style={{
        border: "1px solid rgba(255,255,255,0.09)",
        background: "rgba(255,255,255,0.035)",
        borderRadius: 18,
        padding: "1.25rem",
        color: "#f0ece4",
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {showPhoto ? (
          <img
            src={member.photo_url as string}
            alt={`Portrait of ${member.full_name}`}
            onError={() => setPhotoFailed(true)}
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
              border: "1px solid rgba(255,255,255,0.15)",
            }}
          />
        ) : (
          <div
            aria-label={`No portrait listed for ${member.full_name}`}
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "rgba(212,160,23,0.18)",
              color: "#D4A017",
              display: "grid",
              placeItems: "center",
              fontSize: "1.4rem",
              fontWeight: 700,
              flexShrink: 0,
              border: "1px solid rgba(212,160,23,0.4)",
            }}
          >
            {initials(member.full_name)}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.15rem" }}>
            {member.full_name}
          </h3>
          <p style={{ margin: "0 0 0.25rem", color: "rgba(240,236,228,0.64)" }}>
            {chamberDisplay(member.level, member.chamber)}
            {" · "}
            {stateName}
            {" · "}
            {districtLabel(
              member.level,
              member.district,
              member.representation,
            )}
          </p>
          {member.party ? (
            <p style={{ margin: 0, color: "rgba(240,236,228,0.64)" }}>
              {member.party}
            </p>
          ) : null}
        </div>
      </div>

      <dl
        style={{
          margin: "1rem 0 0",
          display: "grid",
          gap: "0.4rem",
          fontSize: "0.95rem",
          lineHeight: 1.5,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <dt style={{ color: "rgba(240,236,228,0.64)", minWidth: 72 }}>
            Phone
          </dt>
          <dd style={{ margin: 0 }}>
            {member.phone ? (
              <a href={`tel:${member.phone}`} style={contactLinkStyle}>
                {member.phone}
              </a>
            ) : (
              "Not listed"
            )}
          </dd>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <dt style={{ color: "rgba(240,236,228,0.64)", minWidth: 72 }}>
            Email
          </dt>
          <dd style={{ margin: 0 }}>
            {member.email ? (
              <a href={`mailto:${member.email}`} style={contactLinkStyle}>
                {member.email}
              </a>
            ) : (
              emailLine
            )}
          </dd>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <dt style={{ color: "rgba(240,236,228,0.64)", minWidth: 72 }}>Web</dt>
          <dd style={{ margin: 0 }}>
            {member.website_url ? (
              <a
                href={member.website_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#7eb3e8", textDecoration: "none" }}
              >
                Official website
              </a>
            ) : (
              "Official page not listed"
            )}
          </dd>
        </div>
        {member.office_address ? (
          <div style={{ display: "flex", gap: 8 }}>
            <dt style={{ color: "rgba(240,236,228,0.64)", minWidth: 72 }}>
              Office
            </dt>
            <dd style={{ margin: 0 }}>{member.office_address}</dd>
          </div>
        ) : null}
      </dl>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: "1rem",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() =>
            navigate(
              `/lumensend?type=inquiry&context=manual&situation=${encodeURIComponent(lumenSendContext)}`,
            )
          }
          style={{
            background: "rgba(52,211,153,0.1)",
            border: "1px solid rgba(52,211,153,0.3)",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: "0.85rem",
            color: "#34d399",
          }}
        >
          Message in LumenSend
        </button>
        <CommitToCase
          type="resource"
          itemId={member.member_key}
          resourceName={member.full_name}
          sourceLane="legislators"
          label="Attach to Case"
          size="sm"
        />
      </div>

      {member.committees.length > 0 ? (
        <div style={{ marginTop: "1rem" }}>
          <h4
            style={{
              margin: "0 0 0.5rem",
              fontSize: "0.85rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#D4A017",
            }}
          >
            Committees
          </h4>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.6 }}>
            {member.committees.map((committee, index) => (
              <li
                key={`${committee.committee_name}-${committee.subcommittee_name}-${index}`}
              >
                {committee.committee_name}
                {committee.subcommittee_name
                  ? ` — ${committee.subcommittee_name}`
                  : ""}
                {committee.role ? ` (${committee.role})` : ""}
                {" · "}
                {committee.time_marker}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p
        style={{
          margin: "1rem 0 0",
          fontSize: "0.8rem",
          color: "rgba(240,236,228,0.5)",
        }}
      >
        Source: {member.source}
        {member.fetched_date ? ` · Fetched ${member.fetched_date}` : ""}
        {member.verification_status ? ` · ${member.verification_status}` : ""}
      </p>
    </article>
  );
}
