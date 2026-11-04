/**
 * VaFacilities — the VA facilities directory inside the veterans
 * area, modeled on the Legislators hub page. Route:
 * /veterans/facilities (the 2026-10-30 design's proposed route).
 * Wired 2026-11-04 on Alexander's direction from the draft
 * preserved in PR #762 (va-ui/client/VaFacilities.draft.tsx).
 *
 * Flow: coverage face labels + state picker -> facility type picker
 * -> city list or ZIP entry -> cards. Facility data is rendered ONLY
 * through VaFacilityCard; this page renders pickers, held notices,
 * and the always-visible face labels (coverage, last refreshed,
 * source). No facility dump is ever rendered: cards appear only
 * inside a chosen city/ZIP scope, every resolve is capped by the
 * router, and an unknown scope stops at a held notice with the
 * valid list as clickable options.
 *
 * This page makes zero calls to the VA API. It reads only the
 * seeded baseline through the vaFacilities router; the API's job is
 * reconciliation at refresh time.
 *
 * Draft notes:
 * - CLOSED facilities are excluded by the router default; whether
 *   they get a labeled toggle is DESIGN.md open question 2, so no
 *   toggle is drafted here.
 * - ZIP scope is exact-ZIP only; radius semantics are open
 *   question 3 and runtime radius calls are off the table.
 * - Clicking a card's name loads the router's `facility` detail
 *   (services + hours) and re-renders the same card enriched — the
 *   doorway path, as legislators' `member` is theirs.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import VaFacilityCard from "@/components/va/VaFacilityCard";
import type { VaFacility } from "@/components/va/VaFacilityCard";

const tone = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.64)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  gold: "#D4A017",
  blue: "#7eb3e8",
};

type StateRow = { state: string; count: number };
type TypeRow = { facility_type: string; count: number; label: string };
type CityRow = { city: string; count: number };

type ResolveResult =
  | { held: false; facilities: VaFacility[] }
  | { held: true; step: "state" | "type" | "city"; valid: unknown[] };

const selectStyle = {
  background: tone.card_bg,
  color: tone.paper,
  border: `1px solid ${tone.card_border}`,
  borderRadius: 10,
  padding: "0.6rem 0.75rem",
  fontSize: "1rem",
} as const;

function HeldNotice({
  step,
  valid,
  onPickState,
  onPickType,
  onPickCity,
}: {
  step: "state" | "type" | "city";
  valid: unknown[];
  onPickState: (state: string) => void;
  onPickType: (type: string) => void;
  onPickCity: (city: string) => void;
}) {
  const labels =
    step === "state"
      ? (valid as StateRow[]).map((r) => ({
          key: r.state,
          label: `${r.state} (${r.count})`,
          pick: () => onPickState(r.state),
        }))
      : step === "type"
        ? (valid as TypeRow[]).map((r) => ({
            key: r.facility_type,
            label: r.label,
            pick: () => onPickType(r.facility_type),
          }))
        : (valid as CityRow[]).map((r) => ({
            key: r.city,
            label: r.city,
            pick: () => onPickCity(r.city),
          }));
  return (
    <div
      style={{
        border: "1px solid rgba(212,160,23,0.5)",
        background: "rgba(212,160,23,0.08)",
        borderRadius: 14,
        padding: "1rem",
        marginTop: "1rem",
      }}
    >
      <p style={{ margin: "0 0 0.75rem" }}>
        That {step} is not in this base. Pick from what is:
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {labels.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.pick}
            style={{
              background: "transparent",
              color: tone.blue,
              border: `1px solid ${tone.card_border}`,
              borderRadius: 999,
              padding: "0.35rem 0.8rem",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function VaFacilities() {
  const [state, setState] = useState("");
  const [type, setType] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [zipApplied, setZipApplied] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const metaQuery = trpc.vaFacilities.meta.useQuery();
  const statesQuery = trpc.vaFacilities.states.useQuery();
  const typesQuery = trpc.vaFacilities.types.useQuery(
    { state: state || undefined },
    { enabled: state !== "" },
  );
  const citiesQuery = trpc.vaFacilities.cities.useQuery(
    { state, type },
    { enabled: state !== "" && type !== "" },
  );

  const scoped = state !== "" && type !== "" && (city !== "" || zipApplied !== "");
  const resolveQuery = trpc.vaFacilities.resolve.useQuery(
    {
      state,
      type,
      city: city || undefined,
      zip: zipApplied || undefined,
    },
    { enabled: scoped },
  );
  const detailQuery = trpc.vaFacilities.facility.useQuery(
    { facilityKey: selectedKey ?? "" },
    { enabled: selectedKey !== null },
  );

  const resolve = resolveQuery.data as ResolveResult | undefined;
  const detailRaw =
    detailQuery.data && !detailQuery.data.held
      ? (detailQuery.data as {
          facility: VaFacility & { hours_json?: string | null };
          services: VaFacility["services"];
        })
      : null;
  // The detail row carries hours as hours_json text; the card takes
  // the parsed object. Parse failure renders no hours block — the
  // card never guesses at a value it cannot read.
  const detail = detailRaw
    ? {
        facility: {
          ...detailRaw.facility,
          hours: detailRaw.facility.hours_json
            ? (() => {
                try {
                  return JSON.parse(detailRaw.facility.hours_json as string);
                } catch {
                  return null;
                }
              })()
            : null,
          services: detailRaw.services,
        } as VaFacility,
      }
    : null;

  function pickState(next: string) {
    setState(next);
    setType("");
    setCity("");
    setZipApplied("");
    setSelectedKey(null);
  }
  function pickType(next: string) {
    setType(next);
    setCity("");
    setZipApplied("");
    setSelectedKey(null);
  }
  function pickCity(next: string) {
    setCity(next);
    setZipApplied("");
    setSelectedKey(null);
  }

  return (
    <main
      style={{
        background: tone.bg,
        color: tone.paper,
        minHeight: "100vh",
        padding: "2rem 1.25rem 4rem",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.8rem", margin: "0 0 0.5rem" }}>
          VA facilities
        </h1>
        <p style={{ color: tone.muted, margin: "0 0 1.5rem", lineHeight: 1.6 }}>
          Health facilities, benefits offices, cemeteries, and Vet Centers —
          pick a state, a kind of facility, and a city or ZIP. Every listing
          is read from the seeded baseline; this page never calls the VA API.
        </p>

        {/* Face labels: coverage first, as on the legislators hub. */}
        <div
          style={{
            border: `1px solid ${tone.card_border}`,
            background: tone.card_bg,
            borderRadius: 14,
            padding: "1rem",
            marginBottom: "1.5rem",
            lineHeight: 1.6,
          }}
        >
          {metaQuery.data ? (
            <p style={{ margin: 0 }}>
              {metaQuery.data.facilities.toLocaleString()} facilities ·{" "}
              {metaQuery.data.jurisdictions} jurisdictions · Source: VA
              Facilities API v1
              {metaQuery.data.last_refreshed
                ? ` · Last refreshed ${metaQuery.data.last_refreshed}`
                : ""}
            </p>
          ) : (
            <p style={{ margin: 0, color: tone.muted }}>Loading coverage…</p>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
          }}
        >
          <label style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}>
            State
            <select
              value={state}
              onChange={(event) => pickState(event.target.value)}
              style={selectStyle}
            >
              <option value="">Choose a state…</option>
              {(statesQuery.data as StateRow[] | undefined)?.map((row) => (
                <option key={row.state} value={row.state}>
                  {row.state} ({row.count})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}>
            Kind of facility
            <select
              value={type}
              onChange={(event) => pickType(event.target.value)}
              style={selectStyle}
              disabled={state === ""}
            >
              <option value="">Choose a kind…</option>
              {(typesQuery.data as TypeRow[] | undefined)?.map((row) => (
                <option key={row.facility_type} value={row.facility_type}>
                  {row.label} ({row.count})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}>
            City
            <select
              value={city}
              onChange={(event) => pickCity(event.target.value)}
              style={selectStyle}
              disabled={state === "" || type === ""}
            >
              <option value="">Choose a city…</option>
              {(citiesQuery.data as CityRow[] | undefined)?.map((row) => (
                <option key={row.city} value={row.city}>
                  {row.city} ({row.count})
                </option>
              ))}
            </select>
          </label>

          <form
            style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}
            onSubmit={(event) => {
              event.preventDefault();
              setCity("");
              setZipApplied(zip.trim());
              setSelectedKey(null);
            }}
          >
            <label htmlFor="va-zip">…or ZIP code (exact)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="va-zip"
                value={zip}
                onChange={(event) => setZip(event.target.value)}
                disabled={state === "" || type === ""}
                style={{ ...selectStyle, flex: 1, minWidth: 0 }}
                inputMode="numeric"
                placeholder="ZIP"
              />
              <button
                type="submit"
                disabled={state === "" || type === "" || zip.trim() === ""}
                style={{
                  background: "transparent",
                  color: tone.blue,
                  border: `1px solid ${tone.card_border}`,
                  borderRadius: 10,
                  padding: "0.6rem 1rem",
                  cursor: "pointer",
                }}
              >
                Go
              </button>
            </div>
          </form>
        </div>

        {state !== "" && type !== "" && !scoped ? (
          <p style={{ color: tone.muted, marginTop: "1.5rem" }}>
            Pick a city or enter a ZIP to see facilities — the full state
            list is not shown here.
          </p>
        ) : null}

        {scoped && resolveQuery.isLoading ? (
          <p style={{ color: tone.muted, marginTop: "1.5rem" }}>
            Loading facilities…
          </p>
        ) : scoped && resolveQuery.isError ? (
          <p style={{ color: "#f87171", marginTop: "1.5rem" }}>
            Could not load facilities. Please try again.
          </p>
        ) : scoped && resolve?.held ? (
          <HeldNotice
            step={resolve.step}
            valid={resolve.valid}
            onPickState={pickState}
            onPickType={pickType}
            onPickCity={pickCity}
          />
        ) : scoped && resolve && !resolve.held ? (
          <section style={{ marginTop: "2rem" }}>
            {resolve.facilities.length === 0 ? (
              <p style={{ color: tone.muted }}>
                No facilities found for this selection.
              </p>
            ) : (
              <>
                <p style={{ color: tone.muted, margin: "0 0 1rem" }}>
                  {resolve.facilities.length} shown
                  {resolve.facilities.length >= 100
                    ? " — this scope hit the 100-listing cap; narrow by city or ZIP"
                    : ""}
                </p>
                <div
                  style={{
                    display: "grid",
                    gap: "1rem",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(min(100%, 420px), 1fr))",
                  }}
                >
                  {resolve.facilities.map((facility) => (
                    <div key={facility.facility_key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(facility.facility_key)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: tone.blue,
                          cursor: "pointer",
                          padding: "0 0 0.5rem",
                          fontSize: "0.9rem",
                        }}
                      >
                        Details &amp; services →
                      </button>
                      <VaFacilityCard facility={facility} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : null}

        {selectedKey !== null ? (
          <section style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "1.3rem", margin: "0 0 1rem" }}>Detail</h2>
            {detailQuery.isLoading ? (
              <p style={{ color: tone.muted }}>Loading detail…</p>
            ) : detail ? (
              <VaFacilityCard facility={detail.facility} />
            ) : (
              <p style={{ color: tone.muted }}>
                That facility is not in this base.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
