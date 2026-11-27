import { useState } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

/* ═══════════════════════════════════════════════════════════════════════
   THE ENTRANCE — the Lighthouse door (2026-11-27)
   Two paths. A person here for help says nothing about who they are and
   nothing is recorded — the Continue button writes nothing, it only walks
   through. A person here to work declares a kind (a lens label, never the
   security role); government entrants identify their branch and, on the
   agency branch, their agency or department from the canonical directory,
   or type it held as unverified.
   The worker path authenticates BEFORE any declaration is collected: a
   signed-out worker is sent through Login (and back here) first, because
   setMine is an authenticated procedure — collecting the declaration
   first would bounce them to Login mid-submit and discard it.
   Styled in the Lighthouse gold-serif family (Family A).
   ═══════════════════════════════════════════════════════════════════════ */

const lh = {
  bg: "#1a1408",
  bgGrad: "radial-gradient(ellipse at 50% 0%, rgba(212,160,23,0.08) 0%, rgba(26,20,8,0) 70%)",
  cork: "#2a1f12",
  corkLight: "#352816",
  cream: "#ede7d9",
  muted: "#8b7e6e",
  gold: "#d4a017",
  goldSoft: "rgba(212,160,23,0.15)",
  goldBorder: "rgba(212,160,23,0.25)",
  beacon: "#ffd54f",
  ink: "#1a1410",
  red: "#e08a7a",
};
const fontSerif = "'Cormorant Garamond', serif";
const fontMono = "'DM Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

export type EntrantKind = "advocate" | "legal" | "education" | "government";
export type GovBranch = "agency" | "legislative";

export interface AgencyPick {
  canonical_id: string;
  display_name: string;
}

export interface EntranceSelection {
  kind: EntrantKind | null;
  govBranch: GovBranch | null;
  agencyPick: AgencyPick | null;
  agencyText: string;
  notListed: boolean;
}

export const EMPTY_SELECTION: EntranceSelection = {
  kind: null,
  govBranch: null,
  agencyPick: null,
  agencyText: "",
  notListed: false,
};

export interface EntranceProfileLike {
  entrantKind: EntrantKind | null;
  govBranch: GovBranch | null;
  agencyCanonicalId: string | null;
  agencyDisplayName: string | null;
  agencyTextUnverified: string | null;
}

export interface SetMineInput {
  entrantKind: EntrantKind;
  govBranch?: GovBranch;
  agencyCanonicalId?: string;
  agencyText?: string;
}

export function selection_from_profile(
  profile: EntranceProfileLike | null | undefined,
): EntranceSelection {
  if (!profile || !profile.entrantKind) return EMPTY_SELECTION;
  const selection: EntranceSelection = {
    ...EMPTY_SELECTION,
    kind: profile.entrantKind,
    govBranch: profile.govBranch,
  };
  if (profile.agencyCanonicalId) {
    selection.agencyPick = {
      canonical_id: profile.agencyCanonicalId,
      display_name: profile.agencyDisplayName ?? profile.agencyCanonicalId,
    };
  } else if (profile.agencyTextUnverified) {
    selection.notListed = true;
    selection.agencyText = profile.agencyTextUnverified;
  }
  return selection;
}

/** The exact setMine payload for a selection, or null while it is incomplete. */
export function build_setmine_input(selection: EntranceSelection): SetMineInput | null {
  if (!selection.kind) return null;
  if (selection.kind !== "government") return { entrantKind: selection.kind };
  if (!selection.govBranch) return null;
  if (selection.govBranch === "legislative") {
    return { entrantKind: "government", govBranch: "legislative" };
  }
  if (selection.notListed) {
    const text = selection.agencyText.trim();
    return text ? { entrantKind: "government", govBranch: "agency", agencyText: text } : null;
  }
  return selection.agencyPick
    ? { entrantKind: "government", govBranch: "agency", agencyCanonicalId: selection.agencyPick.canonical_id }
    : null;
}

type Navigate = (path: string) => void;

/** The seeker path: walks through the door. Writes nothing — by design this
 *  handler is never given the mutation, so it cannot record anything. */
export function entrance_seeker_continue(navigate: Navigate): void {
  navigate("/lighthouse");
}

/** Skipping the declaration: also writes nothing. */
export function entrance_skip(navigate: Navigate): void {
  navigate("/lighthouse");
}

export function entrance_save(
  selection: EntranceSelection,
  setMine: { mutate: (input: SetMineInput, options?: { onSuccess?: () => void }) => void },
  navigate: Navigate,
): boolean {
  const input = build_setmine_input(selection);
  if (!input) return false;
  setMine.mutate(input, { onSuccess: () => navigate("/lighthouse") });
  return true;
}

/** Where a worker returns after signing in: this door. */
export const ENTRANCE_PATH = "/entrance";

/**
 * The worker path's gate. The declaration form and the agency directory
 * search are authenticated surfaces, so they render only for a signed-in
 * visitor. While the session is still being read, neither the form nor
 * the account step shows — the form must never flash for someone who is
 * about to be sent to Login.
 */
export type EntranceWorkerGate = "loading" | "account" | "form";

export function entrance_worker_gate(auth: {
  loading: boolean;
  isAuthenticated: boolean;
}): EntranceWorkerGate {
  if (auth.loading) return "loading";
  return auth.isAuthenticated ? "form" : "account";
}

/** The worker account step's sign-in link: Login's own redirect
 *  convention, so a signed-in worker lands back at this door. */
export function entrance_worker_signin_href(): string {
  return getLoginUrl(ENTRANCE_PATH);
}

const KIND_OPTIONS: { kind: EntrantKind; label: string; sub?: string }[] = [
  { kind: "advocate", label: "Advocate", sub: "volunteers, caseworkers, community helpers" },
  { kind: "legal", label: "Legal" },
  { kind: "education", label: "Education" },
  { kind: "government", label: "Government" },
];

export default function Entrance() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: auth_loading } = useAuth();
  const worker_gate = entrance_worker_gate({ loading: auth_loading, isAuthenticated });
  // Both entrance reads are authenticated procedures; a signed-out visitor
  // never calls them — the seeker path needs nothing from the server.
  const profile_query = trpc.entrance.getMine.useQuery(undefined, { enabled: isAuthenticated });
  const set_mine = trpc.entrance.setMine.useMutation();
  const [local, setLocal] = useState<EntranceSelection | null>(null);
  const [agency_query, setAgencyQuery] = useState("");

  const selection = local ?? selection_from_profile(profile_query.data);
  const update = (patch: Partial<EntranceSelection>) => setLocal({ ...selection, ...patch });

  const agency_search_enabled =
    isAuthenticated &&
    selection.kind === "government" &&
    selection.govBranch === "agency" &&
    !selection.notListed &&
    agency_query.trim().length >= 2;
  const agency_search = trpc.entrance.searchAgencies.useQuery(
    { query: agency_query.trim() },
    { enabled: agency_search_enabled },
  );

  const save_input = build_setmine_input(selection);

  const toggle_style = (active: boolean): React.CSSProperties => ({
    flex: "1 1 40%",
    textAlign: "left",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${active ? lh.gold : lh.goldBorder}`,
    background: active ? lh.goldSoft : lh.cork,
    color: lh.cream,
    cursor: "pointer",
    fontFamily: fontSans,
  });

  return (
    <div style={{ minHeight: "100vh", background: lh.bg, backgroundImage: lh.bgGrad, color: lh.cream, fontFamily: fontSans }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px 64px" }}>
        <p style={{ fontFamily: fontMono, fontSize: 11, letterSpacing: "0.18em", color: lh.gold, margin: 0 }}>
          THE LIGHTHOUSE · ENTRANCE
        </p>
        <h1 style={{ fontFamily: fontSerif, fontSize: 44, fontWeight: 600, margin: "10px 0 8px", color: lh.cream }}>
          Come in.
        </h1>
        <p style={{ color: lh.muted, fontSize: 16, lineHeight: 1.55, margin: "0 0 28px" }}>
          There are two ways through this door, and they ask different things of you.
        </p>

        <section style={{ background: lh.cork, border: `1px solid ${lh.goldBorder}`, borderRadius: 12, padding: "22px 22px 24px", marginBottom: 20 }}>
          <h2 style={{ fontFamily: fontSerif, fontSize: 26, margin: "0 0 6px" }}>I&rsquo;m here for help</h2>
          <p style={{ color: lh.muted, lineHeight: 1.55, margin: "0 0 16px" }}>
            You don&rsquo;t have to say who you are, and nothing about you is recorded here.
            If you want to share more later, that happens inside, by your choice.
          </p>
          <button
            type="button"
            onClick={() => entrance_seeker_continue(navigate)}
            style={{ background: lh.gold, color: lh.ink, border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: fontSans }}
          >
            Continue
          </button>
        </section>

        <section style={{ background: lh.cork, border: `1px solid ${lh.goldBorder}`, borderRadius: 12, padding: "22px 22px 24px" }}>
          <h2 style={{ fontFamily: fontSerif, fontSize: 26, margin: "0 0 6px" }}>I&rsquo;m here to work</h2>

          {worker_gate === "loading" && (
            <p style={{ color: lh.muted, lineHeight: 1.55, margin: 0 }}>
              One moment — seeing whether you&rsquo;re already signed in.
            </p>
          )}

          {worker_gate === "account" && (
            <>
              <p style={{ color: lh.muted, lineHeight: 1.55, margin: "0 0 16px" }}>
                Working here starts with an account, so the ground you declare is tied to you —
                and only you can change it. Sign in, or create your free account, and you&rsquo;ll
                come right back to this door to finish.
              </p>
              <a
                href={entrance_worker_signin_href()}
                style={{ display: "inline-block", background: lh.gold, color: lh.ink, borderRadius: 8, padding: "11px 22px", fontSize: 15, fontWeight: 600, fontFamily: fontSans, textDecoration: "none" }}
              >
                Sign in or create an account
              </a>
            </>
          )}

          {worker_gate === "form" && (
            <>
          <p style={{ color: lh.muted, lineHeight: 1.55, margin: "0 0 16px" }}>
            Tell us the ground you stand on. It shapes what you land on first — nothing more —
            and you can change it any time.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }} role="group" aria-label="Your kind of work">
            {KIND_OPTIONS.map((option) => (
              <button
                key={option.kind}
                type="button"
                aria-pressed={selection.kind === option.kind}
                onClick={() =>
                  update({
                    kind: option.kind,
                    govBranch: null,
                    agencyPick: null,
                    agencyText: "",
                    notListed: false,
                  })
                }
                style={toggle_style(selection.kind === option.kind)}
              >
                <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{option.label}</span>
                {option.sub && (
                  <span style={{ display: "block", fontSize: 12.5, color: lh.muted, marginTop: 2 }}>{option.sub}</span>
                )}
              </button>
            ))}
          </div>

          {selection.kind === "government" && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 14, color: lh.cream, margin: "0 0 8px" }}>
                Government means identifying yourself. Which side?
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }} role="group" aria-label="Government branch">
                <button
                  type="button"
                  aria-pressed={selection.govBranch === "agency"}
                  onClick={() => update({ govBranch: "agency" })}
                  style={toggle_style(selection.govBranch === "agency")}
                >
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Agency</span>
                </button>
                <button
                  type="button"
                  aria-pressed={selection.govBranch === "legislative"}
                  onClick={() => update({ govBranch: "legislative", agencyPick: null, agencyText: "", notListed: false })}
                  style={toggle_style(selection.govBranch === "legislative")}
                >
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Legislative</span>
                </button>
              </div>
            </div>
          )}

          {selection.kind === "government" && selection.govBranch === "agency" && (
            <div style={{ marginTop: 18 }}>
              {!selection.notListed && !selection.agencyPick && (
                <>
                  <label htmlFor="entrance-agency-search" style={{ display: "block", fontSize: 14, marginBottom: 6 }}>
                    Find your agency or department
                  </label>
                  <input
                    id="entrance-agency-search"
                    type="text"
                    value={agency_query}
                    onChange={(event) => setAgencyQuery(event.target.value)}
                    placeholder="Start typing its name…"
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${lh.goldBorder}`, background: lh.corkLight, color: lh.cream, fontFamily: fontSans, fontSize: 15 }}
                  />
                  {agency_search_enabled && agency_search.data && agency_search.data.length > 0 && (
                    <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                      {agency_search.data.map((agency) => (
                        <button
                          key={agency.canonical_id}
                          type="button"
                          onClick={() => update({ agencyPick: { canonical_id: agency.canonical_id, display_name: agency.display_name } })}
                          style={{ textAlign: "left", padding: "9px 12px", borderRadius: 8, border: `1px solid ${lh.goldBorder}`, background: lh.corkLight, color: lh.cream, cursor: "pointer", fontFamily: fontSans, fontSize: 14 }}
                        >
                          {agency.display_name}
                          {agency.jurisdiction_code ? (
                            <span style={{ color: lh.muted }}> · {agency.jurisdiction_code}</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                  {agency_search_enabled && agency_search.data && agency_search.data.length === 0 && (
                    <p style={{ color: lh.muted, fontSize: 13.5, margin: "8px 0 0" }}>
                      Nothing in the directory matches that yet.
                    </p>
                  )}
                </>
              )}

              {selection.agencyPick && (
                <p style={{ fontSize: 15, margin: 0 }}>
                  Your agency: <strong>{selection.agencyPick.display_name}</strong>{" "}
                  <button
                    type="button"
                    onClick={() => update({ agencyPick: null })}
                    style={{ background: "none", border: "none", color: lh.beacon, cursor: "pointer", fontFamily: fontSans, fontSize: 14, textDecoration: "underline" }}
                  >
                    Change
                  </button>
                </p>
              )}

              {!selection.notListed && (
                <button
                  type="button"
                  onClick={() => update({ notListed: true, agencyPick: null })}
                  style={{ background: "none", border: "none", color: lh.beacon, cursor: "pointer", fontFamily: fontSans, fontSize: 14, textDecoration: "underline", padding: 0, marginTop: 12 }}
                >
                  My agency or department isn&rsquo;t listed
                </button>
              )}

              {selection.notListed && (
                <div>
                  <label htmlFor="entrance-agency-text" style={{ display: "block", fontSize: 14, marginBottom: 6 }}>
                    Type it here — we&rsquo;ll hold it as unverified until it joins the directory.
                  </label>
                  <input
                    id="entrance-agency-text"
                    type="text"
                    value={selection.agencyText}
                    onChange={(event) => update({ agencyText: event.target.value })}
                    placeholder="Agency or department name"
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${lh.goldBorder}`, background: lh.corkLight, color: lh.cream, fontFamily: fontSans, fontSize: 15 }}
                  />
                </div>
              )}
            </div>
          )}

          {set_mine.error && (
            <p role="alert" style={{ color: lh.red, fontSize: 14, margin: "14px 0 0" }}>
              {set_mine.error.message}
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 20 }}>
            <button
              type="button"
              disabled={save_input === null || set_mine.isPending}
              onClick={() => entrance_save(selection, set_mine, navigate)}
              style={{ background: lh.gold, color: lh.ink, border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 15, fontWeight: 600, cursor: save_input === null ? "not-allowed" : "pointer", opacity: save_input === null || set_mine.isPending ? 0.5 : 1, fontFamily: fontSans }}
            >
              Save and come in
            </button>
            <button
              type="button"
              onClick={() => entrance_skip(navigate)}
              style={{ background: "none", border: "none", color: lh.muted, cursor: "pointer", fontFamily: fontSans, fontSize: 14, textDecoration: "underline" }}
            >
              Skip for now
            </button>
          </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
