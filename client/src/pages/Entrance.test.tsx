import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: null as any,
  agency_rows: [] as any[],
  mutate: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/entrance", state.navigate],
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
