import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake governed world behind query_with_diagnostics: entrance_profiles
// rows keyed by user_id, and the canonical agency view reduced to the rows
// in state.known_agencies. The dispatch keys on the SQL shape the router
// issues, so a change in the router's reads/writes fails here loudly.
const state = vi.hoisted(() => ({
  profiles: new Map<number, Record<string, unknown>>(),
  known_agencies: new Map<string, { canonical_id: string; display_name: string; jurisdiction_code: string }>(),
  writes: [] as unknown[][],
  query_with_diagnostics: vi.fn(),
}));

vi.mock("../db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../db")>();
  return { ...original, query_with_diagnostics: state.query_with_diagnostics };
});

import { entranceRouter } from "./entrance";

const KNOWN_AGENCY = {
  canonical_id: "canon-dept-examples",
  display_name: "Department of Examples",
  jurisdiction_code: "WA",
};

function caller_for(user_id: number) {
  return entranceRouter.createCaller({
    user: { id: user_id, role: "user", login_method: "oauth" },
    auth: { auth_status: "authenticated" },
  } as any);
}

beforeEach(() => {
  state.profiles.clear();
  state.writes.length = 0;
  state.known_agencies.clear();
  state.known_agencies.set(KNOWN_AGENCY.canonical_id, KNOWN_AGENCY);
  state.query_with_diagnostics.mockReset();
  state.query_with_diagnostics.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("insert into public.entrance_profiles")) {
      state.writes.push(params);
      const [user_id, entrant_kind, gov_branch, agency_canonical_id, agency_display_name, agency_text_unverified, now] = params as any[];
      const existing = state.profiles.get(user_id);
      const row = {
        entrant_kind,
        gov_branch,
        agency_canonical_id,
        agency_display_name,
        agency_text_unverified,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      state.profiles.set(user_id, row);
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes("from public.entrance_profiles")) {
      const row = state.profiles.get(params[0] as number);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes("v_lighthouse_workflow_accountability_catalog_v1")) {
      if (sql.includes("civic_object_uid::text = $1")) {
        const agency = state.known_agencies.get(params[0] as string);
        return { rows: agency ? [agency] : [], rowCount: agency ? 1 : 0 };
      }
      const needle = String(params[0]).replace(/%/g, "").toLowerCase();
      const rows = [...state.known_agencies.values()].filter((agency) =>
        agency.display_name.toLowerCase().includes(needle),
      );
      return { rows, rowCount: rows.length };
    }
    throw new Error(`Unexpected SQL in entrance test: ${sql.slice(0, 80)}`);
  });
});

describe("entrance.getMine", () => {
  it("returns null before the caller has an entrance profile", async () => {
    await expect(caller_for(7).getMine()).resolves.toBeNull();
  });

  it("returns the caller's own saved profile", async () => {
    const caller = caller_for(7);
    await caller.setMine({ entrantKind: "advocate" });
    await expect(caller.getMine()).resolves.toMatchObject({ entrantKind: "advocate" });
  });
});

describe("entrance.setMine validation matrix", () => {
  it("saves a non-government kind with every gov field cleared", async () => {
    const saved = await caller_for(7).setMine({ entrantKind: "advocate" });
    expect(saved).toMatchObject({
      entrantKind: "advocate",
      govBranch: null,
      agencyCanonicalId: null,
      agencyDisplayName: null,
      agencyTextUnverified: null,
    });
  });

  it("clears gov fields supplied alongside a non-government kind", async () => {
    const saved = await caller_for(7).setMine({
      entrantKind: "legal",
      govBranch: "agency",
      agencyCanonicalId: KNOWN_AGENCY.canonical_id,
      agencyText: "Some typed agency",
    });
    expect(saved.govBranch).toBeNull();
    expect(saved.agencyCanonicalId).toBeNull();
    expect(saved.agencyDisplayName).toBeNull();
    expect(saved.agencyTextUnverified).toBeNull();
  });

  it("saves education with no gov fields", async () => {
    const saved = await caller_for(7).setMine({ entrantKind: "education" });
    expect(saved.entrantKind).toBe("education");
    expect(saved.govBranch).toBeNull();
  });

  it("rejects government without a branch", async () => {
    await expect(caller_for(7).setMine({ entrantKind: "government" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.writes).toHaveLength(0);
  });

  it("saves the legislative branch with agency fields cleared", async () => {
    const saved = await caller_for(7).setMine({
      entrantKind: "government",
      govBranch: "legislative",
      agencyCanonicalId: KNOWN_AGENCY.canonical_id,
      agencyText: "Some typed agency",
    });
    expect(saved.govBranch).toBe("legislative");
    expect(saved.agencyCanonicalId).toBeNull();
    expect(saved.agencyDisplayName).toBeNull();
    expect(saved.agencyTextUnverified).toBeNull();
  });

  it("saves an agency pick with the canonical id and the directory's own display name", async () => {
    const saved = await caller_for(7).setMine({
      entrantKind: "government",
      govBranch: "agency",
      agencyCanonicalId: KNOWN_AGENCY.canonical_id,
    });
    expect(saved.agencyCanonicalId).toBe(KNOWN_AGENCY.canonical_id);
    expect(saved.agencyDisplayName).toBe(KNOWN_AGENCY.display_name);
    expect(saved.agencyTextUnverified).toBeNull();
  });

  it("rejects a canonical id the directory cannot see", async () => {
    await expect(caller_for(7).setMine({
      entrantKind: "government",
      govBranch: "agency",
      agencyCanonicalId: "canon-not-in-the-view",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.writes).toHaveLength(0);
  });

  it("rejects the agency branch with both a pick and typed text", async () => {
    await expect(caller_for(7).setMine({
      entrantKind: "government",
      govBranch: "agency",
      agencyCanonicalId: KNOWN_AGENCY.canonical_id,
      agencyText: "Some typed agency",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.writes).toHaveLength(0);
  });

  it("rejects the agency branch with neither a pick nor typed text", async () => {
    await expect(caller_for(7).setMine({
      entrantKind: "government",
      govBranch: "agency",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.writes).toHaveLength(0);
  });

  it("stores typed agency text as unverified and never touches the canonical fields", async () => {
    const saved = await caller_for(7).setMine({
      entrantKind: "government",
      govBranch: "agency",
      agencyText: "  Tiny Town Water Office  ",
    });
    expect(saved.agencyTextUnverified).toBe("Tiny Town Water Office");
    expect(saved.agencyCanonicalId).toBeNull();
    expect(saved.agencyDisplayName).toBeNull();
  });

  it("upserts: a second save replaces the caller's declaration", async () => {
    const caller = caller_for(7);
    await caller.setMine({ entrantKind: "advocate" });
    const saved = await caller.setMine({ entrantKind: "government", govBranch: "legislative" });
    expect(saved.entrantKind).toBe("government");
    expect(state.profiles.size).toBe(1);
    await expect(caller.getMine()).resolves.toMatchObject({ entrantKind: "government" });
  });

  it("writes only the caller's own row, never another user's", async () => {
    await caller_for(7).setMine({ entrantKind: "advocate" });
    await caller_for(8).setMine({ entrantKind: "legal" });
    // Every insert carried the id of the user who made the call.
    expect(state.writes.map((params) => params[0])).toEqual([7, 8]);
    // And one caller's profile is invisible to the other.
    await expect(caller_for(8).getMine()).resolves.toMatchObject({ entrantKind: "legal" });
    await expect(caller_for(9).getMine()).resolves.toBeNull();
  });
});

describe("entrance.searchAgencies", () => {
  it("returns canonical directory rows for the query", async () => {
    const rows = await caller_for(7).searchAgencies({ query: "examples" });
    expect(rows).toEqual([
      {
        canonical_id: KNOWN_AGENCY.canonical_id,
        display_name: KNOWN_AGENCY.display_name,
        jurisdiction_code: KNOWN_AGENCY.jurisdiction_code,
      },
    ]);
  });

  it("returns an empty list when the directory has no match", async () => {
    await expect(caller_for(7).searchAgencies({ query: "no such agency" })).resolves.toEqual([]);
  });
});
