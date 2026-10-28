/**
 * Legislators — "Who represents me" hub page.
 *
 * Flow: state picker -> level picker (Federal / State / Both) ->
 * district picker(s) -> cards. Member data is rendered ONLY through
 * LegislatorCard; this page renders pickers, section labels, held /
 * needs-district notices, and the always-visible face labels (coverage,
 * last refreshed, sources, tribal link). No member dump is ever rendered:
 * state-without-district stops at a prompt, and unknown districts stop
 * at a held notice with the valid district list.
 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import LegislatorCard from "@/components/legislators/LegislatorCard";
import type { LegislatorMember } from "@/components/legislators/LegislatorCard";

const tone = {
  bg: "#0c0f14",
  paper: "#f0ece4",
  muted: "rgba(240,236,228,0.64)",
  card_bg: "rgba(255,255,255,0.035)",
  card_border: "rgba(255,255,255,0.09)",
  gold: "#D4A017",
  blue: "#7eb3e8",
  green: "#34d399",
};

type Level = "federal" | "state" | "both";

type ResolveResult =
  | { members: LegislatorMember[]; delegation?: true }
  | {
      members: LegislatorMember[];
      held: true;
      reason: string;
      validDistricts: string[];
    }
  | { needsDistrict: true; validDistricts: string[] };

function districtOptionLabel(level: "federal" | "state", district: string) {
  // Federal "0" is at-large, but NOT always a delegate seat: single-district
  // states elect a voting at-large representative, while the territories
  // and DC send a non-voting delegate. The picker only carries district
  // strings, so it uses the neutral "At-Large" label; the card, which has
  // the stored representation, makes the precise distinction.
  if (level === "federal" && district === "0") return "At-Large";
  if (/^[0-9]+$/.test(district)) return `District ${district}`;
  return district;
}

function DistrictPicker({
  id,
  label,
  level,
  districts,
  value,
  onChange,
  allLabel,
}: {
  id: string;
  label: string;
  level: "federal" | "state";
  districts: string[];
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{
          background: tone.card_bg,
          color: tone.paper,
          border: `1px solid ${tone.card_border}`,
          borderRadius: 10,
          padding: "0.6rem 0.75rem",
          fontSize: "1rem",
        }}
      >
        <option value="">{allLabel}</option>
        {districts.map((district) => (
          <option key={district} value={district}>
            {districtOptionLabel(level, district)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Renders one resolve result: held / needs-district notices (with
 * clickable valid districts) or a delegation label plus cards.
 * Member data itself is rendered only by LegislatorCard.
 */
function ResolveSection({
  title,
  level,
  result,
  isLoading,
  isError,
  onPickDistrict,
}: {
  title: string;
  level: "federal" | "state";
  result: ResolveResult | undefined;
  isLoading: boolean;
  isError: boolean;
  onPickDistrict: (district: string) => void;
}) {
  return (
    <section style={{ marginTop: "2rem" }}>
      <h2 style={{ fontSize: "1.3rem", margin: "0 0 1rem" }}>{title}</h2>
      {isLoading ? (
        <p style={{ color: tone.muted }}>Loading representatives…</p>
      ) : isError ? (
        <p style={{ color: "#f87171" }}>
          Could not load representatives. Please try again.
        </p>
      ) : !result ? null : "needsDistrict" in result ? (
        <div
          style={{
            border: `1px solid ${tone.card_border}`,
            background: tone.card_bg,
            borderRadius: 14,
            padding: "1rem",
          }}
        >
          {result.validDistricts.length === 0 ? (
            <p style={{ margin: 0 }}>
              No state-level roster for this jurisdiction in this base — only
              its federal delegate is listed.
            </p>
          ) : (
            <>
              <p style={{ margin: "0 0 0.75rem" }}>
                Pick a legislative district to see your state legislators — the
                full state roster is not shown here.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {result.validDistricts.map((district) => (
                  <button
                    key={district}
                    type="button"
                    onClick={() => onPickDistrict(district)}
                    style={{
                      background: "transparent",
                      color: tone.blue,
                      border: `1px solid ${tone.card_border}`,
                      borderRadius: 999,
                      padding: "0.35rem 0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    {districtOptionLabel("state", district)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {"delegation" in result && result.delegation ? (
            <p style={{ color: tone.muted, margin: "0 0 1rem" }}>
              Full federal delegation
            </p>
          ) : null}
          {"held" in result && result.held ? (
            <div
              style={{
                border: `1px solid rgba(212,160,23,0.5)`,
                background: "rgba(212,160,23,0.08)",
                borderRadius: 14,
                padding: "1rem",
                marginBottom: "1rem",
              }}
            >
              <p style={{ margin: "0 0 0.75rem" }}>{result.reason}</p>
              <p style={{ margin: "0 0 0.5rem", color: tone.muted }}>
                Valid districts for this state:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {result.validDistricts.map((district) => (
                  <button
                    key={district}
                    type="button"
                    onClick={() => onPickDistrict(district)}
                    style={{
                      background: "transparent",
                      color: tone.blue,
                      border: `1px solid ${tone.card_border}`,
                      borderRadius: 999,
                      padding: "0.35rem 0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    {districtOptionLabel(level, district)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {result.members.length === 0 && !("held" in result && result.held) ? (
            <p style={{ color: tone.muted }}>
              No current legislators found for this selection.
            </p>
          ) : (
            <div
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(min(100%, 420px), 1fr))",
              }}
            >
              {result.members.map((member) => (
                <LegislatorCard key={member.member_key} member={member} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function Legislators() {
  const [state, setState] = useState("");
  const [level, setLevel] = useState<Level>("federal");
  const [federalDistrict, setFederalDistrict] = useState("");
  const [stateDistrict, setStateDistrict] = useState("");

  const statesQuery = trpc.legislators.states.useQuery();
  const metaQuery = trpc.legislators.meta.useQuery();

  const federalDistrictsQuery = trpc.legislators.districts.useQuery(
    { state, level: "federal" },
    { enabled: state !== "" && level !== "state" },
  );
  const stateDistrictsQuery = trpc.legislators.districts.useQuery(
    { state, level: "state" },
    { enabled: state !== "" && level !== "federal" },
  );

  const federalResolveQuery = trpc.legislators.resolve.useQuery(
    {
      state,
      level: "federal",
      district: federalDistrict === "" ? undefined : federalDistrict,
    },
    { enabled: state !== "" && level !== "state" },
  );
  const stateResolveQuery = trpc.legislators.resolve.useQuery(
    {
      state,
      level: "state",
      district: stateDistrict === "" ? undefined : stateDistrict,
    },
    { enabled: state !== "" && level !== "federal" },
  );

  const pickState = (next: string) => {
    setState(next);
    setFederalDistrict("");
    setStateDistrict("");
  };
  const pickLevel = (next: Level) => {
    setLevel(next);
    setFederalDistrict("");
    setStateDistrict("");
  };

  // Explicit result shapes: AppRouter inference is broken repo-wide
  // (pre-existing — see LegislatorCard), so query payloads are cast to
  // the exact shapes the legislators router returns. Procedure names and
  // inputs above are verified against the router by hand.
  const statesData = statesQuery.data as
    | { states: { code: string; name: string }[] }
    | undefined;
  const metaData = metaQuery.data as
    | {
        totalMembers: number;
        totalCommittees: number;
        statesCovered: number;
        fetchedDate: string | null;
        sources: { federal: string; state: string };
        tribalNote: string;
      }
    | undefined;
  const federalDistrictList =
    (federalDistrictsQuery.data as { districts: string[] } | undefined)
      ?.districts ?? [];
  const stateDistrictList =
    (stateDistrictsQuery.data as { districts: string[] } | undefined)
      ?.districts ?? [];
  const federalResult = federalResolveQuery.data as ResolveResult | undefined;
  const stateResult = stateResolveQuery.data as ResolveResult | undefined;

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
          Who represents me
        </h1>
        <p style={{ color: tone.muted, lineHeight: 1.7, margin: "0 0 1.5rem" }}>
          Pick your state, then your level and district, to see your current
          legislators and their committees. Contact details shown here are the
          officials&apos; own published details — nothing is invented.
        </p>

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
          <p style={{ margin: "0 0 0.25rem" }}>
            Coverage: Current legislators for all 50 states, DC, and Puerto
            Rico, plus the federal delegates for American Samoa, Guam, the
            Northern Mariana Islands, and the U.S. Virgin Islands.
            {metaData
              ? ` ${metaData.totalMembers.toLocaleString()} legislators · ${metaData.totalCommittees.toLocaleString()} committee assignments · ${metaData.statesCovered} jurisdictions.`
              : ""}
          </p>
          <p style={{ margin: "0 0 0.25rem" }}>
            Last refreshed:{" "}
            {metaQuery.isLoading
              ? "Loading…"
              : (metaData?.fetchedDate ?? "date not recorded")}
          </p>
          {metaData ? (
            <>
              <p style={{ margin: "0 0 0.25rem" }}>
                Federal sources: {metaData.sources.federal}
              </p>
              <p style={{ margin: "0 0 0.25rem" }}>
                State sources: {metaData.sources.state}
              </p>
              <p style={{ margin: 0 }}>
                {metaData.tribalNote}{" "}
                <Link
                  href="/native-nations"
                  style={{ color: tone.blue, textDecoration: "none" }}
                >
                  Native Nations hub
                </Link>
              </p>
            </>
          ) : null}
        </section>

        {statesQuery.isLoading ? (
          <p style={{ color: tone.muted }}>Loading states…</p>
        ) : statesQuery.isError ? (
          <p style={{ color: "#f87171" }}>
            Could not load the state list. Please try again.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "1rem",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}>
              State
              <select
                value={state}
                onChange={(event) => pickState(event.target.value)}
                style={{
                  background: tone.card_bg,
                  color: tone.paper,
                  border: `1px solid ${tone.card_border}`,
                  borderRadius: 10,
                  padding: "0.6rem 0.75rem",
                  fontSize: "1rem",
                }}
              >
                <option value="">Choose your state</option>
                {statesData?.states.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={{ fontSize: "0.9rem", marginBottom: 6 }}>
                Level
              </legend>
              <div style={{ display: "flex", gap: 8 }}>
                {(
                  [
                    ["federal", "Federal"],
                    ["state", "State"],
                    ["both", "Both"],
                  ] as [Level, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => pickLevel(value)}
                    aria-pressed={level === value}
                    style={{
                      background:
                        level === value
                          ? "rgba(212,160,23,0.18)"
                          : "transparent",
                      color: level === value ? tone.gold : tone.paper,
                      border: `1px solid ${level === value ? tone.gold : tone.card_border}`,
                      borderRadius: 999,
                      padding: "0.5rem 1rem",
                      cursor: "pointer",
                      fontSize: "0.95rem",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            {state !== "" && level !== "state" ? (
              <DistrictPicker
                id="federal-district"
                label="Congressional district"
                level="federal"
                districts={federalDistrictList}
                value={federalDistrict}
                onChange={setFederalDistrict}
                allLabel="Full federal delegation"
              />
            ) : null}
            {state !== "" && level !== "federal" ? (
              <DistrictPicker
                id="state-district"
                label="Legislative district"
                level="state"
                districts={stateDistrictList}
                value={stateDistrict}
                onChange={setStateDistrict}
                allLabel="Pick a district"
              />
            ) : null}
          </div>
        )}

        {state === "" ? (
          <p style={{ color: tone.muted, marginTop: "2rem" }}>
            Choose a state above to begin.
          </p>
        ) : (
          <>
            {level !== "state" ? (
              <ResolveSection
                title={level === "both" ? "Federal" : "Your federal delegation"}
                level="federal"
                result={federalResult}
                isLoading={federalResolveQuery.isLoading}
                isError={federalResolveQuery.isError}
                onPickDistrict={setFederalDistrict}
              />
            ) : null}
            {level !== "federal" ? (
              <ResolveSection
                title={level === "both" ? "State" : "Your state legislators"}
                level="state"
                result={stateResult}
                isLoading={stateResolveQuery.isLoading}
                isError={stateResolveQuery.isError}
                onPickDistrict={setStateDistrict}
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
