/**
 * OfficeCard — one anchored-office result on the Find-an-Office page.
 *
 * Renders only what the record carries: the field rows come from
 * office_card_fields, so a facility with no phone on record shows no
 * phone row (never a placeholder). The card deep-links to the unified
 * Resource Directory record (/resource/:id) — the same detail surface
 * the directory itself uses.
 */
import { Link } from "wouter";
import { OFFICE_FAMILY_META } from "@shared/office-families";
import {
  format_distance,
  office_card_fields,
  website_href,
  type OfficeSearchResult,
} from "@/lib/office-results";

const tone = {
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.64)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  blue: "#7eb3e8",
};

export default function OfficeCard({
  result,
}: {
  result: OfficeSearchResult;
}) {
  const family = OFFICE_FAMILY_META[result.family];
  const fields = office_card_fields(result);
  const place = [
    result.city,
    [result.state, result.postal_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      style={{
        border: `1px solid ${tone.card_border}`,
        background: tone.card_bg,
        borderRadius: 14,
        padding: "1rem",
        display: "grid",
        gap: "0.45rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: "0.78rem",
            color: tone.muted,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: family?.color ?? "#94a3b8",
              display: "inline-block",
            }}
          />
          {family?.label ?? result.family}
        </span>
        <span style={{ fontSize: "0.85rem", color: tone.muted }}>
          {format_distance(result.distance_mi)} away
        </span>
      </div>

      <h3 style={{ margin: 0, fontSize: "1.05rem", lineHeight: 1.35 }}>
        <Link
          href={`/resource/${result.resource_entity_id}`}
          style={{ color: tone.paper, textDecoration: "none" }}
        >
          {result.name}
        </Link>
      </h3>

      {result.address || place ? (
        <p style={{ margin: 0, color: tone.muted, lineHeight: 1.55 }}>
          {result.address ? <>{result.address}</> : null}
          {result.address && place ? <br /> : null}
          {place ? <>{place}</> : null}
        </p>
      ) : null}

      {fields.length > 0 ? (
        <dl
          style={{
            margin: "0.15rem 0 0",
            display: "grid",
            gap: "0.25rem",
            fontSize: "0.92rem",
          }}
        >
          {fields.map((field) => (
            <div
              key={field.kind}
              style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
            >
              <dt style={{ color: tone.muted, minWidth: "4.2rem" }}>
                {field.label}
              </dt>
              <dd style={{ margin: 0 }}>
                {field.kind === "url" ? (
                  <a
                    href={website_href(field.value)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: tone.blue, textDecoration: "none" }}
                  >
                    {field.value}
                  </a>
                ) : (
                  field.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p style={{ margin: "0.25rem 0 0" }}>
        <Link
          href={`/resource/${result.resource_entity_id}`}
          style={{
            color: tone.blue,
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          View in the Resource Directory →
        </Link>
      </p>
    </article>
  );
}
