import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: null as any,
  agency_rows: [] as any[],
  mutate: vi.fn(),
  navigate: vi.fn(),
  // The page's existing render tests were written against the always-form
  // page; their faithful precondition is a signed-in visitor, so the auth
  // mock defaults to signed in and the gate tests below flip it.
  auth: { isAuthenticated: true, loading: false } as { isAuthenticated: boolean; loading: boolean },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/entrance", state.navigate],
}));

vi.mock("@/core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: state.auth.isAuthenticated ? { id: "worker-1" } : null,
    isAuthenticated: state.auth.isAuthenticated,
    loading: state.auth.loading,
    error: null,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    entrance: {
      getMine: { useQuery: () => ({ data: state.profile, isLoading: false }) },
      searchAgencies: { useQuery: () => ({ data: state.agency_rows, isLoading: false }) },
      setMine: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: null }) },
    },
  },
}));

import Entrance, {
  EMPTY_SELECTION,
  build_setmine_input,
  entrance_save,
  entrance_seeker_continue,
  entrance_skip,
  entrance_worker_gate,
  entrance_worker_signin_href,
  selection_from_profile,
  type EntranceSelection,
} from "./Entrance";

const selection = (patch: Partial<EntranceSelection>): EntranceSelection => ({
  ...EMPTY_SELECTION,
  ...patch,
});

beforeEach(() => {
  state.profile = null;
  state.agency_rows = [];
  state.auth = { isAuthenticated: true, loading: false };
  state.mutate.mockReset();
  state.navigate.mockReset();
});

describe("Entrance page", () => {
  it("renders both paths and the four worker toggles, Advocate with its sub-line", () => {
    const html = renderToStaticMarkup(<Entrance />);
    expect(html).toContain("I’m here for help");
    expect(html).toContain("Continue");
    expect(html).toContain("I’m here to work");
    expect(html).toContain("Advocate");
    expect(html).toContain("volunteers, caseworkers, community helpers");
    expect(html).toContain("Legal");
    expect(html).toContain("Education");
    expect(html).toContain("Government");
    expect(html).toContain("Skip for now");
    // Rendering alone never writes anything.
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("shows an existing profile pre-selected, changeable", () => {
    state.profile = {
      entrantKind: "government",
      govBranch: "agency",
      agencyCanonicalId: "canon-dept-examples",
      agencyDisplayName: "Department of Examples",
      agencyTextUnverified: null,
    };
    const html = renderToStaticMarkup(<Entrance />);
    expect(html).toContain("Your agency:");
    expect(html).toContain("Department of Examples");
    expect(html).toContain('aria-pressed="true"');
  });
});

describe("the worker path authenticates first", () => {
  it("gates on loading first, then on having a session", () => {
    expect(entrance_worker_gate({ loading: true, isAuthenticated: false })).toBe("loading");
    expect(entrance_worker_gate({ loading: true, isAuthenticated: true })).toBe("loading");
    expect(entrance_worker_gate({ loading: false, isAuthenticated: false })).toBe("account");
    expect(entrance_worker_gate({ loading: false, isAuthenticated: true })).toBe("form");
  });

  it("sends the worker through Login with a redirect back to this door", () => {
    expect(entrance_worker_signin_href()).toBe("/login?interactive=1&redirect=%2Fentrance");
  });

  it("signed out: the seeker path is unchanged and anonymous", () => {
    state.auth = { isAuthenticated: false, loading: false };
    const html = renderToStaticMarkup(<Entrance />);
    expect(html).toContain("I’m here for help");
    expect(html).toContain("You don’t have to say who you are");
    expect(html).toContain("Continue");
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("signed out: the worker path shows the account step and no declaration form", () => {
    state.auth = { isAuthenticated: false, loading: false };
    const html = renderToStaticMarkup(<Entrance />);
    expect(html).toContain("I’m here to work");
    expect(html).toContain("Working here starts with an account");
    expect(html).toContain("Sign in or create an account");
    expect(html).toContain('href="/login?interactive=1&amp;redirect=%2Fentrance"');
    // No declaration is collected before a session exists: no toggles, no
    // government fork, no directory search, no save/skip.
    expect(html).not.toContain("Advocate");
    expect(html).not.toContain("volunteers, caseworkers, community helpers");
    expect(html).not.toContain("Tell us the ground you stand on");
    expect(html).not.toContain("Find your agency or department");
    expect(html).not.toContain("Save and come in");
    expect(html).not.toContain("Skip for now");
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("loading: the seeker path renders and the worker path shows neither form nor account step", () => {
    state.auth = { isAuthenticated: false, loading: true };
    const html = renderToStaticMarkup(<Entrance />);
    expect(html).toContain("I’m here for help");
    expect(html).toContain("Continue");
    expect(html).toContain("I’m here to work");
    expect(html).toContain("seeing whether you’re already signed in");
    expect(html).not.toContain("Advocate");
    expect(html).not.toContain("Sign in or create an account");
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("signed in: the declaration form renders as before", () => {
    state.auth = { isAuthenticated: true, loading: false };
    const html = renderToStaticMarkup(<Entrance />);
    expect(html).toContain("Tell us the ground you stand on");
    expect(html).toContain("Advocate");
    expect(html).toContain("Save and come in");
    expect(html).not.toContain("Sign in or create an account");
  });
});

describe("the seeker path writes nothing", () => {
  it("Continue only navigates to the Lighthouse", () => {
    entrance_seeker_continue(state.navigate);
    expect(state.navigate).toHaveBeenCalledTimes(1);
    expect(state.navigate).toHaveBeenCalledWith("/lighthouse");
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("Skip only navigates to the Lighthouse", () => {
    entrance_skip(state.navigate);
    expect(state.navigate).toHaveBeenCalledTimes(1);
    expect(state.navigate).toHaveBeenCalledWith("/lighthouse");
    expect(state.mutate).not.toHaveBeenCalled();
  });
});

describe("build_setmine_input", () => {
  it("is null until a kind is chosen", () => {
    expect(build_setmine_input(selection({}))).toBeNull();
  });

  it("passes a plain kind through with no gov fields", () => {
    expect(build_setmine_input(selection({ kind: "advocate" }))).toEqual({ entrantKind: "advocate" });
    expect(build_setmine_input(selection({ kind: "education" }))).toEqual({ entrantKind: "education" });
  });

  it("requires the government branch", () => {
    expect(build_setmine_input(selection({ kind: "government" }))).toBeNull();
  });

  it("builds the legislative payload with no agency fields", () => {
    expect(build_setmine_input(selection({ kind: "government", govBranch: "legislative" }))).toEqual({
      entrantKind: "government",
      govBranch: "legislative",
    });
  });

  it("builds the agency payload from a directory pick", () => {
    expect(
      build_setmine_input(
        selection({
          kind: "government",
          govBranch: "agency",
          agencyPick: { canonical_id: "canon-dept-examples", display_name: "Department of Examples" },
        }),
      ),
    ).toEqual({ entrantKind: "government", govBranch: "agency", agencyCanonicalId: "canon-dept-examples" });
  });

  it("builds the agency payload from typed text, trimmed", () => {
    expect(
      build_setmine_input(
        selection({ kind: "government", govBranch: "agency", notListed: true, agencyText: "  Tiny Town Water Office " }),
      ),
    ).toEqual({ entrantKind: "government", govBranch: "agency", agencyText: "Tiny Town Water Office" });
  });

  it("is null for the agency branch with neither pick nor text", () => {
    expect(build_setmine_input(selection({ kind: "government", govBranch: "agency" }))).toBeNull();
    expect(
      build_setmine_input(selection({ kind: "government", govBranch: "agency", notListed: true, agencyText: "  " })),
    ).toBeNull();
  });
});

describe("entrance_save", () => {
  it("sends the government + agency payload shape and navigates on success", () => {
    const set_mine = { mutate: state.mutate };
    const saved = entrance_save(
      selection({
        kind: "government",
        govBranch: "agency",
        agencyPick: { canonical_id: "canon-dept-examples", display_name: "Department of Examples" },
      }),
      set_mine,
      state.navigate,
    );
    expect(saved).toBe(true);
    expect(state.mutate).toHaveBeenCalledTimes(1);
    const [payload, options] = state.mutate.mock.calls[0];
    expect(payload).toEqual({
      entrantKind: "government",
      govBranch: "agency",
      agencyCanonicalId: "canon-dept-examples",
    });
    options.onSuccess();
    expect(state.navigate).toHaveBeenCalledWith("/lighthouse");
  });

  it("does not call the mutation for an incomplete selection", () => {
    const saved = entrance_save(selection({ kind: "government" }), { mutate: state.mutate }, state.navigate);
    expect(saved).toBe(false);
    expect(state.mutate).not.toHaveBeenCalled();
  });
});

describe("selection_from_profile", () => {
  it("maps a canonical agency profile to a pick", () => {
    const mapped = selection_from_profile({
      entrantKind: "government",
      govBranch: "agency",
      agencyCanonicalId: "canon-dept-examples",
      agencyDisplayName: "Department of Examples",
      agencyTextUnverified: null,
    });
    expect(mapped.agencyPick).toEqual({ canonical_id: "canon-dept-examples", display_name: "Department of Examples" });
    expect(mapped.notListed).toBe(false);
  });

  it("maps an unverified-text profile to the not-listed path", () => {
    const mapped = selection_from_profile({
      entrantKind: "government",
      govBranch: "agency",
      agencyCanonicalId: null,
      agencyDisplayName: null,
      agencyTextUnverified: "Tiny Town Water Office",
    });
    expect(mapped.notListed).toBe(true);
    expect(mapped.agencyText).toBe("Tiny Town Water Office");
    expect(mapped.agencyPick).toBeNull();
  });

  it("maps no profile to the empty selection", () => {
    expect(selection_from_profile(null)).toEqual(EMPTY_SELECTION);
  });
});
