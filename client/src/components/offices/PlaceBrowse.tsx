/**
 * PlaceBrowse — Find an Office by state and city, no street address.
 *
 * Reads /api/offices/places (states, then cities with record counts) and
 * /api/offices/place (offices in the place, other catalog resources there,
 * and resources that serve the whole state). Offices use the same OfficeCard
 * as the address search; other resources render only what their record
 * carries. A statewide resource is labeled statewide, never placed in a city.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { OFFICE_FAMILY_KEYS, OFFICE_FAMILY_META } from "@shared/office-families";
import OfficeCard from "@/components/offices/OfficeCard";
import { website_href, type PlaceOffice } from "@/lib/office-results";

const tone = {
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.64)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  gold: "#D4A017",
  blue: "#7eb3e8",
  red: "#f87171",
};

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands", AS: "American Samoa",
  MP: "Northern Mariana Islands",
};

export const PLACE_CATEGORY_LABELS: Record<string, string> = {
  tribal: "Tribal and Native services",
  healthcare: "Health care",
  housing: "Housing",
  food_nutrition: "Food",
  cash_assistance: "Cash assistance",
  legal_civil_rights: "Legal help and civil rights",
  safety_crisis: "Safety and crisis",
  employment_labor: "Jobs and work",
  utilities: "Utilities",
  other: "Not yet categorized",
};

const CATEGORY_ORDER = Object.keys(PLACE_CATEGORY_LABELS);

type PlaceOption = { code: string; label: string; record_count: number };

type PlaceResource = {
  resource_entity_id: string;
  name: string;
  category: string;
  scope: "local" | "statewide";
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone?: string;
  url?: string;
};

type PlaceResponse = {
  ok: boolean;
  state: string;
  city_key: string | null;
  offices: PlaceOffice[];
  offices_capped: boolean;
  families_not_found: string[];
  other_resources: PlaceResource[];
  other_resources_capped: boolean;
};

type BrowseState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; response: PlaceResponse; city_label: string | null; families: string[] }
  | { phase: "error" };

/** Group items by key in a fixed order, unknown keys last. */
export function group_in_order<T>(items: T[], key_of: (item: T) => string, order: string[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = key_of(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const keys = [
    ...order.filter(key => groups.has(key)),
    ...[...groups.keys()].filter(key => !order.includes(key)),
  ];
  return keys.map(key => ({ key, items: groups.get(key) ?? [] }));
}

function ResourceCard({ resource }: { resource: PlaceResource }) {
  const place = [resource.city, [resource.state, resource.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return (
    <article
      style={{
        border: `1px solid ${tone.card_border}`,
        background: tone.card_bg,
        borderRadius: 12,
        padding: "0.85rem",
        display: "grid",
        gap: 6,
      }}
    >
      <span style={{ fontSize: "0.8rem", color: tone.muted }}>
        {resource.scope === "statewide" ? "Serves the whole state" : "In this city"}
      </span>
      <h4 style={{ margin: 0, fontSize: "1rem", lineHeight: 1.35 }}>
        <Link
          href={`/resource/${resource.resource_entity_id}`}
          style={{ color: tone.paper, textDecoration: "none" }}
        >
          {resource.name}
        </Link>
      </h4>
      {resource.address || place ? (
        <p style={{ margin: 0, color: tone.muted, lineHeight: 1.5, fontSize: "0.92rem" }}>
          {resource.address}
          {resource.address && place ? <br /> : null}
          {place}
        </p>
      ) : null}
      {resource.phone ? (
        <p style={{ margin: 0, fontSize: "0.92rem" }}>
          <span style={{ color: tone.muted }}>Phone </span>
          <a href={`tel:${resource.phone.replace(/[^0-9+]/g, "")}`} style={{ color: tone.paper }}>
            {resource.phone}
          </a>
        </p>
      ) : null}
      {resource.url && website_href(resource.url) ? (
        <p style={{ margin: 0, fontSize: "0.92rem", overflowWrap: "anywhere" }}>
          <span style={{ color: tone.muted }}>Website </span>
          <a href={website_href(resource.url) ?? undefined} target="_blank" rel="noreferrer" style={{ color: tone.blue }}>
            {resource.url}
          </a>
        </p>
      ) : null}
    </article>
  );
}

const grid = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
} as const;

const select_style = {
  background: tone.card_bg,
  color: tone.paper,
  border: `1px solid ${tone.card_border}`,
  borderRadius: 10,
  padding: "0.55rem 0.7rem",
  fontSize: "1rem",
  minWidth: 0,
} as const;

export default function PlaceBrowse({ families }: { families: string[] }) {
  const [states, setStates] = useState<PlaceOption[] | null>(null);
  const [state, setState] = useState("");
  const [cities, setCities] = useState<PlaceOption[] | null>(null);
  const [city, setCity] = useState("");
  const [browse, setBrowse] = useState<BrowseState>({ phase: "idle" });
  const [lists_error, setListsError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/offices/places")
      .then(response => response.json())
      .then(payload => {
        if (!cancelled) setStates(payload.ok ? payload.states : []);
      })
      .catch(() => !cancelled && setListsError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCities(null);
    setCity("");
    if (!state) return;
    let cancelled = false;
    fetch(`/api/offices/places?state=${encodeURIComponent(state)}`)
      .then(response => response.json())
      .then(payload => {
        if (!cancelled) setCities(payload.ok ? payload.cities : []);
      })
      .catch(() => !cancelled && setListsError(true));
    return () => {
      cancelled = true;
    };
  }, [state]);

  const show = async () => {
    if (!state) return;
    const submitted = [...families];
    const city_label = cities?.find(option => option.code === city)?.label ?? null;
    setBrowse({ phase: "loading" });
    const params = new URLSearchParams({ state });
    if (city) params.set("city", city);
    if (submitted.length > 0) params.set("families", submitted.join(","));
    try {
      const response = await fetch(`/api/offices/place?${params.toString()}`);
      const payload = (await response.json()) as PlaceResponse;
      setBrowse(payload.ok ? { phase: "done", response: payload, city_label, families: submitted } : { phase: "error" });
    } catch {
      setBrowse({ phase: "error" });
    }
  };

  const done = browse.phase === "done" ? browse : null;
  const place_name = done
    ? [done.city_label, STATE_NAMES[done.response.state] ?? done.response.state].filter(Boolean).join(", ")
    : "";
  const local = done?.response.other_resources.filter(item => item.scope === "local") ?? [];
  const statewide = done?.response.other_resources.filter(item => item.scope === "statewide") ?? [];

  return (
    <section
      style={{
        border: `1px solid ${tone.card_border}`,
        background: tone.card_bg,
        borderRadius: 14,
        padding: "1rem",
        marginBottom: "1.5rem",
      }}
    >
      <div style={{ fontSize: "0.9rem", marginBottom: 8 }}>
        Browse by place — pick your state, then your city
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select aria-label="State" value={state} onChange={event => setState(event.target.value)} style={select_style}>
          <option value="">{states ? "Choose a state" : "Loading states…"}</option>
          {(states ?? []).map(option => (
            <option key={option.code} value={option.code}>
              {STATE_NAMES[option.code] ?? option.code} ({option.record_count.toLocaleString()})
            </option>
          ))}
        </select>
        <select
          aria-label="City"
          value={city}
          onChange={event => setCity(event.target.value)}
          disabled={!state || !cities}
          style={select_style}
        >
          <option value="">{!state ? "Choose a state first" : cities ? "Whole state" : "Loading cities…"}</option>
          {(cities ?? []).map(option => (
            <option key={option.code} value={option.code}>
              {option.label} ({option.record_count.toLocaleString()})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={show}
          disabled={!state || browse.phase === "loading"}
          style={{
            background: "rgba(212,160,23,0.18)",
            color: tone.gold,
            border: `1px solid ${tone.gold}`,
            borderRadius: 999,
            padding: "0.55rem 1.1rem",
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          Show what&apos;s here
        </button>
      </div>
      {lists_error ? (
        <p style={{ margin: "0.75rem 0 0", color: tone.red }}>The list of places could not load. Please try again.</p>
      ) : null}
      {browse.phase === "loading" ? (
        <p style={{ margin: "0.75rem 0 0", color: tone.muted }}>Gathering what&apos;s in this place…</p>
      ) : browse.phase === "error" ? (
        <p style={{ margin: "0.75rem 0 0", color: tone.red }}>Something went wrong. Please try again.</p>
      ) : null}

      {done ? (
        <div style={{ marginTop: "1.25rem", display: "grid", gap: "1.5rem" }}>
          <p style={{ margin: 0, lineHeight: 1.7 }}>
            {place_name}: {done.response.offices.length.toLocaleString()} government
            {done.response.offices.length === 1 ? " office" : " offices"}
            {done.families.length === 0
              ? `, ${local.length.toLocaleString()} other local resources, and ${statewide.length.toLocaleString()} that serve the whole state.`
              : " of the kinds you picked."}
            {done.response.offices_capped || done.response.other_resources_capped
              ? " The list is long, so it is cut short — pick a city to narrow it."
              : ""}
          </p>

          {done.response.families_not_found.length > 0 ? (
            <p style={{ margin: 0, lineHeight: 1.7, color: tone.gold }}>
              None found here for:{" "}
              {done.response.families_not_found.map(family => OFFICE_FAMILY_META[family]?.label ?? family).join(", ")}.
            </p>
          ) : null}

          {group_in_order(done.response.offices, office => office.family, OFFICE_FAMILY_KEYS).map(group => (
            <div key={group.key}>
              <h3 style={{ fontSize: "1.1rem", margin: "0 0 0.6rem" }}>
                {OFFICE_FAMILY_META[group.key]?.label ?? group.key}
              </h3>
              <div style={grid}>
                {group.items.map(office => (
                  <OfficeCard key={`${office.resource_entity_id}-${office.family}`} result={office} />
                ))}
              </div>
            </div>
          ))}

          {local.length > 0 ? (
            <div>
              <h3 style={{ fontSize: "1.1rem", margin: "0 0 0.6rem" }}>Other resources here</h3>
              {group_in_order(local, item => item.category, CATEGORY_ORDER).map(group => (
                <div key={group.key} style={{ marginBottom: "1rem" }}>
                  <h4 style={{ fontSize: "0.95rem", color: tone.muted, margin: "0 0 0.5rem" }}>
                    {PLACE_CATEGORY_LABELS[group.key] ?? group.key}
                  </h4>
                  <div style={grid}>
                    {group.items.map(item => <ResourceCard key={item.resource_entity_id} resource={item} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {statewide.length > 0 ? (
            <div>
              <h3 style={{ fontSize: "1.1rem", margin: "0 0 0.6rem" }}>
                Serving all of {STATE_NAMES[done.response.state] ?? done.response.state}
              </h3>
              {group_in_order(statewide, item => item.category, CATEGORY_ORDER).map(group => (
                <details key={group.key} style={{ marginBottom: "0.6rem" }}>
                  <summary style={{ cursor: "pointer", lineHeight: 1.8 }}>
                    {PLACE_CATEGORY_LABELS[group.key] ?? group.key} ({group.items.length})
                  </summary>
                  <div style={{ ...grid, marginTop: "0.5rem" }}>
                    {group.items.map(item => <ResourceCard key={item.resource_entity_id} resource={item} />)}
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
