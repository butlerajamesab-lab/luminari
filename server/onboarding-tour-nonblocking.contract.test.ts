import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tour = readFileSync(
  fileURLToPath(new URL("../client/src/components/OnboardingTour.tsx", import.meta.url)),
  "utf8",
);

describe("Onboarding tour first-visit behavior", () => {
  it("offers a nonblocking invitation instead of opening the modal automatically", () => {
    const firstVisitEffect = tour.slice(
      tour.indexOf("useEffect(() =>"),
      tour.indexOf("const handleNext"),
    );

    expect(firstVisitEffect).toContain("setShowInvitation(true)");
    expect(firstVisitEffect).not.toContain("setIsVisible(true)");
    expect(tour).toContain("pointer-events-none fixed inset-x-4 bottom-4");
    expect(tour).toContain("Take the one-minute tour whenever you are ready");
    expect(tour).toContain("const handleStartTour");
  });

  it("preserves the explicit full tour after the person opts in", () => {
    expect(tour).toContain("setShowInvitation(false)");
    expect(tour).toContain("setIsVisible(true)");
    expect(tour).toContain('className="fixed inset-0 z-[100]');
  });
});
