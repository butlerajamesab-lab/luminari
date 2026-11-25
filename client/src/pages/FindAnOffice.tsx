/**
 * FindAnOffice — "Find an office" locator page (F3).
 *
 * Address-first, like /legislators: a person knows their address,
 * not agency taxonomies. The form posts to /api/offices/nearest,
 * which resolves the address through the same Census Geocoder the
 * legislators hub uses and finds the nearest anchored government
 * offices in the unified Resource Directory catalog.
 *
 * Honest states only: an address the Census cannot match says so
 * and offers a retry; a geocoder failure says the lookup is
 * unavailable; a family with no office in reach is named, never
 * silently replaced by another family. Cards render only the fields
 * their record carries (see OfficeCard).
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  OFFICE_FAMILY_KEYS,
  OFFICE_FAMILY_META,
} from "@shared/office-families";
import OfficeCard from "@/components/offices/OfficeCard";
import PlaceBrowse from "@/components/offices/PlaceBrowse";
import { StationNav } from "@/components/station-nav";
import {
  group_office_results,
  office_search_presentation,
  sort_by_distance,
  type NearestOfficesResponse,
  type OfficeSearchResult,
} from "@/lib/office-results";

const tone = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.64)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  gold: "#D4A017",
  blue: "#7eb3e8",
  red: "#f87171",
};

type SearchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | {
      phase: "done";
      response: NearestOfficesResponse;
      /**
       * The family selection this search was submitted with, stored
       * WITH the response. All result presentation (filtered vs.
       * grouped, the radius note) is driven by this snapshot, never
       * by the live chip state — chips stay editable after and
       * during a search, and the response on screen is the answer
       * to the selection it was submitted with.
       */
      submitted_families: string[];
    }
  | { phase: "error" };

function FamilyChips({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (family: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {OFFICE_FAMILY_KEYS.map((key) => {
        const meta = OFFICE_FAMILY_META[key];
        const active = selected.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: active ? "rgba(255,255,255,0.07)" : "transparent",
              color: tone.paper,
              border: `1px solid ${active ? meta.color : tone.card_border}`,
              borderRadius: 999,
              padding: "0.35rem 0.8rem",
              cursor: "pointer",
              fontSize: "0.88rem",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: meta.color,
                display: "inline-block",
              }}
            />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function ResultList({ results }: { results: OfficeSearchResult[] }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "0.75rem",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
      }}
    >
      {results.map((result) => (
        <OfficeCard
          key={`${result.resource_entity_id}-${result.family}-${result.distance_mi}`}
          result={result}
        />
      ))}
    </div>
  );
}

export default function FindAnOffice() {
  const [address, setAddress] = useState("");
  const [families, setFamilies] = useState<string[]>([]);
  const [search, setSearch] = useState<SearchState>({ phase: "idle" });

  const toggleFamily = (family: string) => {
    setFamilies((current) =>
      current.includes(family)
        ? current.filter((entry) => entry !== family)
        : [...current, family],
    );
  };

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = address.trim();
    if (trimmed.length < 6) return;
    // Snapshot the selection at submit time: this exact selection
    // is what the request asks about, so it is what the response
    // will be presented under — even if the chips change while the
    // request is in flight.
    const submitted_families = [...families];
    setSearch({ phase: "loading" });
    try {
      const response = await fetch("/api/offices/nearest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: trimmed,
          families:
            submitted_families.length > 0 ? submitted_families : undefined,
        }),
      });
      const payload = (await response.json()) as NearestOfficesResponse;
      setSearch({ phase: "done", response: payload, submitted_families });
    } catch {
      setSearch({ phase: "error" });
    }
  };

  const matched =
    search.phase === "done" && search.response.ok && search.response.status === "matched"
      ? search.response
      : null;
  // Presentation follows the SUBMITTED snapshot stored with the
  // response, never the live chips: whether the view is filtered,
  // and why the radius widened (a filtered search widens until
  // every picked family is in reach, so the note names the families
  // that were not within the initial radius instead of claiming
  // nothing was — see office_radius_note), are properties of the
  // search that produced these results. Changing the chips leaves
  // the displayed results untouched under their own snapshot; the
  // page flags the change and a new search updates them.
  const presentation =
    matched && search.phase === "done"
      ? office_search_presentation({
          response: matched,
          submitted_families: search.submitted_families,
          live_families: families,
        })
      : null;
  const filtered = presentation?.filtered ?? false;
  const radius_note = presentation?.radius_note ?? null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: tone.bg,
        color: tone.paper,
        fontFamily: "Inter, system-ui, sans-serif",
        padding: "2rem 1rem 4rem",
      }}
    >
      <div style={{ maxWidth: 1020, margin: "0 auto" }}>
        <h1
          style={{ fontSize: "clamp(2rem, 5vw, 3rem)", margin: "0 0 0.5rem" }}
        >
          Find an office
        </h1>
        <p style={{ color: tone.muted, lineHeight: 1.7, margin: "0 0 1.5rem" }}>
          Pick your state and city, or enter your address, to find the
          government offices near you —
          Social Security, veterans&apos; facilities, health centers,
          housing authorities, job centers, and more. Every office shown
          is a record in the{" "}
          <Link
            href="/resource-directory"
            style={{ color: tone.blue, textDecoration: "none" }}
          >
            Resource Directory
          </Link>
          , with the contact details its own record carries — nothing is
          invented.
        </p>

        <div style={{ marginBottom: "1.5rem" }}>
          <StationNav />
        </div>

        {matched ? (
          <section
            style={{
              border: `1px solid ${tone.card_border}`,
              background: tone.card_bg,
              borderRadius: 14,
              padding: "1rem",
              marginBottom: "1.5rem",
              fontSize: "0.92rem",
              lineHeight: 1.7,
            }}
          >
            <p style={{ margin: 0 }}>
              Coverage: {matched.coverage.anchored_office_sites.toLocaleString()}{" "}
              government offices with verified locations, drawn from the
              Resource Directory&apos;s{" "}
              {matched.coverage.total_resources.toLocaleString()} records.
            </p>
          </section>
        ) : null}

        <div style={{ marginBottom: "1rem", display: "grid", gap: 6 }}>
          <span style={{ fontSize: "0.9rem" }}>
            Only show these kinds of offices (optional)
          </span>
          <FamilyChips selected={families} onToggle={toggleFamily} />
        </div>

        <PlaceBrowse families={families} />

        <form
          onSubmit={runSearch}
          style={{
            border: `1px solid ${tone.card_border}`,
            background: tone.card_bg,
            borderRadius: 14,
            padding: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <label style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}>
            Or find the nearest offices to an address — no agency name needed
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Street address, city, state — e.g. 2930 Wetmore Ave, Everett, WA"
                autoComplete="street-address"
                style={{
                  flex: "1 1 320px",
                  background: tone.card_bg,
                  color: tone.paper,
                  border: `1px solid ${tone.card_border}`,
                  borderRadius: 10,
                  padding: "0.6rem 0.75rem",
                  fontSize: "1rem",
                }}
              />
              <button
                type="submit"
                disabled={address.trim().length < 6 || search.phase === "loading"}
                style={{
                  background: "rgba(212,160,23,0.18)",
                  color: tone.gold,
                  border: `1px solid ${tone.gold}`,
                  borderRadius: 999,
                  padding: "0.6rem 1.1rem",
                  cursor: "pointer",
                  fontSize: "0.95rem",
                }}
              >
                Find offices near me
              </button>
            </div>
          </label>

          {search.phase === "loading" ? (
            <p style={{ color: tone.muted, margin: "0.75rem 0 0" }}>
              Looking up your address and the offices near it…
            </p>
          ) : search.phase === "error" ? (
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.7, color: tone.red }}>
              Something went wrong with that search. Please try again.
            </p>
          ) : search.phase === "done" && !search.response.ok ? (
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.7 }}>
              {search.response.status === "unavailable"
                ? "The address lookup service is unavailable right now. Please try again in a moment — your address was not guessed or approximated."
                : (search.response.message ??
                  "Something went wrong with that search. Please try again.")}
            </p>
          ) : search.phase === "done" &&
            search.response.status === "no_match" ? (
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.7 }}>
              We couldn&apos;t find that address. Check the spelling and
              try again — include your street, city, and state.
            </p>
          ) : matched ? (
            <p style={{ margin: "0.75rem 0 0", lineHeight: 1.7 }}>
              Showing offices near {matched.geocoded_address}.
              {radius_note ? ` ${radius_note}` : ""}
            </p>
          ) : (
            <p
              style={{
                color: tone.muted,
                margin: "0.75rem 0 0",
                fontSize: "0.92rem",
              }}
            >
              Your address is sent to the U.S. Census Bureau geocoder for
              this one lookup and is not stored.
            </p>
          )}
        </form>

        {matched && presentation?.selection_changed ? (
          <section
            style={{
              border: `1px solid ${tone.card_border}`,
              background: tone.card_bg,
              borderRadius: 14,
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              You changed the kinds of offices selected after this
              search
              {search.phase === "done" &&
              search.submitted_families.length > 0
                ? ` — these results are for the earlier selection (${search.submitted_families
                    .map(
                      (family) =>
                        OFFICE_FAMILY_META[family]?.label ?? family,
                    )
                    .join(", ")})`
                : " — these results show every kind of office, from before a kind was picked"}
              . Run the search again to update them.
            </p>
          </section>
        ) : null}

        {matched && matched.results.length === 0 ? (
          <section>
            <p style={{ lineHeight: 1.7 }}>
              No government offices were found within{" "}
              {matched.radius_used_mi} miles of that address
              {filtered ? " for the kinds of offices you picked" : ""}. The{" "}
              <Link
                href="/resource-directory"
                style={{ color: tone.blue, textDecoration: "none" }}
              >
                Resource Directory
              </Link>{" "}
              can still search the whole catalog by name, city, or need.
            </p>
          </section>
        ) : matched ? (
          <section>
            {matched.families_not_found.length > 0 ? (
              <div
                style={{
                  border: "1px solid rgba(212,160,23,0.5)",
                  background: "rgba(212,160,23,0.08)",
                  borderRadius: 14,
                  padding: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <p style={{ margin: 0, lineHeight: 1.7 }}>
                  No office was found within {matched.radius_used_mi} miles
                  for:{" "}
                  {matched.families_not_found
                    .map(
                      (family) =>
                        OFFICE_FAMILY_META[family]?.label ?? family,
                    )
                    .join(", ")}
                  . The offices below are the other kinds you asked for.
                </p>
              </div>
            ) : null}

            {filtered ? (
              <ResultList results={sort_by_distance(matched.results)} />
            ) : (
              group_office_results(matched.results).map((group) => (
                <div key={group.family} style={{ marginBottom: "1.75rem" }}>
                  <h2
                    style={{
                      fontSize: "1.15rem",
                      margin: "0 0 0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background:
                          OFFICE_FAMILY_META[group.family]?.color ??
                          "#94a3b8",
                        display: "inline-block",
                      }}
                    />
                    {OFFICE_FAMILY_META[group.family]?.label ?? group.family}
                  </h2>
                  <ResultList results={group.results} />
                </div>
              ))
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
