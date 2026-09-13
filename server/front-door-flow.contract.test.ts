import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public front-door flow", () => {
  it("keeps deterministic intake matching public and case creation authenticated", () => {
    const routers = read("server/routers.ts");
    const intakeStart = routers.indexOf("const intakeRouter = router({");
    const benefitsStart = routers.indexOf(
      "// ─── Benefits Navigator Router",
      intakeStart,
    );
    const intakeRouter = routers.slice(intakeStart, benefitsStart);

    expect(intakeRouter).toContain("autoDetect: publicProcedure");
    expect(intakeRouter).toContain("smartDetect: publicProcedure");
    expect(intakeRouter).not.toContain("autoDetect: protectedProcedure");
    expect(intakeRouter).not.toContain("smartDetect: protectedProcedure");
    expect(intakeRouter).toContain(
      "combined_text: z.string().trim().max(10_000).optional()",
    );

    const guidedIntake = read("client/src/pages/GuidedIntake.tsx");
    expect(guidedIntake).toContain(
      'const GUIDED_INTAKE_DRAFT_KEY = "luminari-guided-intake-draft-v1";',
    );
    expect(guidedIntake).toMatch(
      /window\.sessionStorage\.setItem\(\s*GUIDED_INTAKE_DRAFT_KEY/,
    );
    expect(guidedIntake).toContain(
      'setLocation(getLoginUrl("/guided-intake"));',
    );
    expect(guidedIntake).toContain("Sign in to save my case");
    expect(guidedIntake).toContain(
      "window.sessionStorage.removeItem(GUIDED_INTAKE_DRAFT_KEY)",
    );
  });

  it("offers the first-visit tour without placing an automatic page-wide overlay", () => {
    const tour = read("client/src/components/OnboardingTour.tsx");
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

  it("gives the primary help action and every architecture layer a visible destination", () => {
    const welcome = read("client/src/pages/Welcome.tsx");
    const architecture = read("client/src/pages/ArchitectureMap.tsx");

    expect(welcome).toContain('onClick={() => setLocation("/guided-intake")}');
    expect(welcome).toContain("<span>I Need Help</span>");
    expect(architecture).toContain('claim_elements: "/claim-elements"');
    expect(architecture).toContain('proof_frameworks: "/proof-frameworks"');
    expect(architecture).not.toContain(
      'claim_elements: "/litigation-barriers"',
    );
    expect(architecture).not.toContain(
      'proof_frameworks: "/enforcement-intel"',
    );
  });
});
