import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  caseQuery: {
    data: undefined as Record<string, unknown> | undefined,
    isLoading: false,
    isError: false,
    error: null as Error | null,
  },
}));

vi.mock("wouter", () => ({
  useRoute: () => [true, { caseId: "42" }],
  useLocation: () => ["/guide/42", vi.fn()],
}));
vi.mock("@/contexts/CaseContext", () => ({
  useCase: () => ({ currentCaseId: 42, setCurrentCaseId: vi.fn() }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    cases: { get: { useQuery: () => state.caseQuery } },
    analyze: {
      getCaseIntakeContinuity: { useQuery: () => ({ data: undefined }) },
      getIntakeSpineStatus: { useQuery: () => ({ data: undefined }) },
    },
    documents: { list: { useQuery: () => ({ data: [] }) } },
    findings: { listEnriched: { useQuery: () => ({ data: [] }) } },
  },
}));

// Exercise the actual parent gates while isolating the editor and unrelated
// dashboard sections from their mutation and data-loading dependencies.
vi.mock("@/components/CaseMetadataEditor", () => ({
  CaseMetadataEditor: () => <button>Edit details</button>,
}));
vi.mock("@/components/DocumentChecklist", () => ({ DocumentChecklist: () => null }));
vi.mock("@/components/ResourceDirectory", () => ({ ResourceDirectory: () => null }));
vi.mock("@/components/LegalResources", () => ({ LegalResources: () => null }));
vi.mock("@/components/ShareWithAdvocate", () => ({ ShareWithAdvocate: () => null }));
vi.mock("@/components/MissingRecords", () => ({ MissingRecordsSection: () => null }));
vi.mock("@/components/EnforcementSuggestions", () => ({ EnforcementSuggestions: () => null }));
vi.mock("@/components/EnforcementNextSteps", () => ({
  EnforcementNextSteps: () => null,
  CaseEnforcementNextSteps: () => null,
}));
vi.mock("@/components/SupportRecommendations", () => ({ SupportRecommendations: () => null }));
vi.mock("@/components/lighthouse/IntakeSpineControl", () => ({ IntakeSpineControl: () => null }));
vi.mock("streamdown", () => ({ Streamdown: () => null }));

import { CaseIntakeContinuityPanel } from "./CaseIntakeContinuityPanel";
import GuidedDashboard from "@/pages/GuidedDashboard";

beforeEach(() => {
  state.caseQuery = {
    data: {
      name: "Apartment repair case",
      description: "Workspace summary",
      domain: "housing",
      container: null,
      canEditMetadata: true,
    },
    isLoading: false,
    isError: false,
    error: null,
  };
});

describe.each([
  ["case continuity panel", () => <CaseIntakeContinuityPanel caseId={42} routePath="/documents" />],
  ["guided dashboard", () => <GuidedDashboard />],
] as const)("metadata access in %s", (_name, renderSurface) => {
  it("shows one editor when the server grants metadata editing", () => {
    const html = renderToStaticMarkup(renderSurface());
    expect(html.match(/Edit details/g)).toHaveLength(1);
  });

  it.each([false, undefined, null, "true"])(
    "hides the editor unless the capability is explicitly true (%s)",
    (capability) => {
      state.caseQuery.data!.canEditMetadata = capability;
      expect(renderToStaticMarkup(renderSurface())).not.toContain("Edit details");
    },
  );

  it("hides the editor while the case query is loading", () => {
    state.caseQuery.data = undefined;
    state.caseQuery.isLoading = true;
    expect(renderToStaticMarkup(renderSurface())).not.toContain("Edit details");
  });

  it("hides the editor after a failed refetch even with cached permission", () => {
    state.caseQuery.isError = true;
    state.caseQuery.error = new Error("Could not verify current case access");
    expect(renderToStaticMarkup(renderSurface())).not.toContain("Edit details");
  });
});

it("keeps the guide's continuity panel from mounting a second editor", () => {
  const html = renderToStaticMarkup(
    <CaseIntakeContinuityPanel caseId={42} routePath="/guide/42" surfaceOverride="act" />,
  );
  expect(html).toContain("Intake activity");
  expect(html).not.toContain("Edit details");
});
