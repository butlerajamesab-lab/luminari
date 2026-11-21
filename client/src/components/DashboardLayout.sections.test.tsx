import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// DashboardLayout.tsx imports several data/auth modules at module scope.
// The section components under test are purely props-driven, so those
// modules are stubbed out (same isolation approach as
// CaseMetadataEditor.access.test.tsx).
vi.mock("wouter", () => ({
  useLocation: () => ["/nowhere", vi.fn()],
}));
vi.mock("@/core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false, logout: vi.fn() }),
}));
vi.mock("@/contexts/CaseContext", () => ({
  useCase: () => ({ currentCaseId: null, setCurrentCaseId: vi.fn() }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    cases: { list: { useQuery: () => ({ data: [] }) } },
  },
}));
vi.mock("@/const", () => ({ getLoginUrl: () => "/login" }));
vi.mock("@/lib/caseIntakeContinuity", () => ({
  related_subject_for_case_path: () => null,
}));
vi.mock("./PlainLanguageToggle", () => ({ default: () => null }));
vi.mock("./NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("./OnboardingTour", () => ({ resetTour: vi.fn(), OnboardingTour: () => null }));
vi.mock("./CaseIntakeContinuityPanel", () => ({ CaseIntakeContinuityPanel: () => null }));

import { SidebarProvider } from "@/components/ui/sidebar";
import { CollapsibleNavSection, IntegritySection } from "./DashboardLayout";
import type { NavSection } from "./navigation";

const StubIcon = () => null;

function makeSection(id: string, label: string, items: Array<[string, string]>): NavSection {
  return {
    id,
    label,
    items: items.map(([itemLabel, path]) => ({ icon: StubIcon, label: itemLabel, path })),
  };
}

const sectionAlpha = makeSection("alpha", "Alpha Section", [
  ["Alpha One", "/alpha-one"],
  ["Alpha Two", "/alpha-two"],
]);
const sectionBeta = makeSection("beta", "Beta Section", [
  ["Beta One", "/beta-one"],
  ["Beta Two", "/beta-two"],
  ["Beta Three", "/beta-three"],
]);

function renderSections(sections: Array<{ section: NavSection; isOpen: boolean }>, isCollapsed = false) {
  return renderToStaticMarkup(
    <SidebarProvider>
      {sections.map(({ section, isOpen }) => (
        <CollapsibleNavSection
          key={section.id}
          section={section}
          isOpen={isOpen}
          onToggle={() => {}}
          location="/nowhere"
          setLocation={() => {}}
          isCollapsed={isCollapsed}
          intakeExecutionComplete
        />
      ))}
    </SidebarProvider>,
  );
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe("CollapsibleNavSection — single-render regression (sidebar pile-up)", () => {
  it("renders every item exactly once across multiple open sections", () => {
    const markup = renderSections([
      { section: sectionAlpha, isOpen: true },
      { section: sectionBeta, isOpen: true },
    ]);

    // Items render as buttons (onClick navigation), so the item's label span
    // is the render marker: each label must appear exactly once, and the
    // total menu-item count must equal the total fixture item count.
    for (const label of ["Alpha One", "Alpha Two", "Beta One", "Beta Two", "Beta Three"]) {
      expect(countOccurrences(markup, label), label).toBe(1);
    }
    expect(markup.match(/data-slot="sidebar-menu-item"/g)?.length).toBe(5);
  });

  it("gives every section list shrink-0 so the flex column cannot compress it", () => {
    const markup = renderSections([
      { section: sectionAlpha, isOpen: true },
      { section: sectionBeta, isOpen: true },
    ]);

    const menuTags = markup.match(/<ul[^>]*data-slot="sidebar-menu"[^>]*>/g) ?? [];
    expect(menuTags.length).toBe(2);
    for (const tag of menuTags) {
      expect(tag).toContain("shrink-0");
    }
  });

  it("renders no items for a closed section, but keeps its header and count badge", () => {
    const markup = renderSections([
      { section: sectionAlpha, isOpen: true },
      { section: sectionBeta, isOpen: false },
    ]);

    expect(countOccurrences(markup, "Alpha One")).toBe(1);
    expect(countOccurrences(markup, "Beta One")).toBe(0);
    expect(markup.match(/data-slot="sidebar-menu-item"/g)?.length).toBe(2);
    // The closed section itself is still present: header label + count badge (3).
    expect(markup).toContain("Beta Section");
    expect(markup).toContain(">3<");
  });

  it("still renders items in collapsed icon mode even when the section is closed", () => {
    const markup = renderSections([{ section: sectionBeta, isOpen: false }], true);

    for (const label of ["Beta One", "Beta Two", "Beta Three"]) {
      expect(countOccurrences(markup, label), label).toBe(1);
    }
  });
});

describe("IntegritySection — duplicate /integrity regression", () => {
  it("renders the /integrity item exactly once alongside its sibling items", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <IntegritySection
          isOpen
          onToggle={() => {}}
          location="/nowhere"
          setLocation={() => {}}
          isCollapsed={false}
          lifecycle={null}
        />
      </SidebarProvider>,
    );

    // Exactly three menu items: the hardcoded "Integrity & Resolutions"
    // (/integrity) plus Extraction Failures and Audit Trail filtered from
    // the Investigate items. The filter used to also include /integrity,
    // rendering that path a second time as "Integrity Dashboard".
    expect(markup.match(/data-slot="sidebar-menu-item"/g)?.length).toBe(3);
    // (Rendered markup escapes the ampersand: "Integrity &amp; Resolutions".)
    expect(countOccurrences(markup, "Integrity &amp; Resolutions")).toBe(1);
    expect(countOccurrences(markup, "Extraction Failures")).toBe(1);
    expect(countOccurrences(markup, "Audit Trail")).toBe(1);
    expect(markup).not.toContain("Integrity Dashboard");
  });
});
