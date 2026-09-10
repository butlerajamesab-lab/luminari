import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public read-only Lighthouse access", () => {
  it("keeps the bare-domain welcome mat separate from the explicit platform catalog", () => {
    const app = read("client/src/App.tsx");
    const layout = read("client/src/components/DashboardLayout.tsx");
    const catalog = read("client/src/pages/PlatformDashboard.tsx");
    const auth = read("client/src/core/hooks/useAuth.ts");

    expect(app).toContain('<Route path="/" component={PublicEntry} />');
    expect(app).toContain('const PUBLIC_ROOT_SEEN_KEY = "luminari-public-root-seen";');
    expect(app).toContain('setLocation("/lighthouse", { replace: true });');
    expect(app).toContain("if (isFirstVisit) return <Welcome />;");
    expect(app).toContain('<Route path="/dashboard"><DashboardRouter /></Route>');
    expect(app).toContain('<Route path="/" component={PlatformDashboard} />');
    expect(app).not.toContain('navigate("/login", { replace: true })');
    expect(layout).not.toContain("Authenticate\n          </Button>");
    expect(layout).toContain("Public browsing");
    expect(catalog).toContain("[...allNavSections, adminSection]");
    expect(catalog).toContain("Public Platform Dashboard");
    expect(auth).not.toContain("previewUser");
    expect(auth).not.toContain("inspection");
  });

  it("does not turn a protected background read into a login wall", () => {
    const entry = read("client/src/main.tsx");
    const queryStart = entry.indexOf("queryClient.getQueryCache().subscribe");
    const mutationStart = entry.indexOf("queryClient.getMutationCache().subscribe");
    const queryBoundary = entry.slice(queryStart, mutationStart);
    const mutationBoundary = entry.slice(mutationStart, entry.indexOf("// Helper: get a fresh Supabase session token"));

    expect(queryBoundary).not.toContain("redirectToLoginIfUnauthorized(error)");
    expect(mutationBoundary).toContain("redirectToLoginIfUnauthorized(error)");
  });

  it("clears private query data when the owner signs out", () => {
    const auth = read("client/src/core/hooks/useAuth.ts");
    const queryCache = read("client/src/core/privateQueryCache.ts");

    expect(auth).toContain("clearPrivateQueryCache(queryClient)");
    expect(auth).toContain('event === "SIGNED_OUT"');
    expect(queryCache).toContain("query.reset()");
    expect(queryCache).toContain("queryClient.clear()");
  });

  it("opens public review hubs while withholding unapproved deep records", () => {
    const publicReviewHubs = [
      "client/src/pages/NativeNationsHub.tsx",
      "client/src/pages/RecognitionAtlas.tsx",
    ];
    const protectedDeepRecords = [
      "client/src/pages/RecognitionAtlasTribe.tsx",
      "client/src/pages/RecognitionAtlasLayer.tsx",
      "client/src/pages/RecognitionGideon.tsx",
    ];

    for (const path of publicReviewHubs) {
      const source = read(path);
      expect(source).not.toContain('user?.role !== "admin"');
      expect(source).not.toContain("requires admin access");
    }
    for (const path of protectedDeepRecords) {
      const source = read(path);
      expect(source).toContain('user?.role === "admin"');
      expect(source).toContain("route is open for navigation");
    }

    expect(read("server/_core/trpc.ts")).toContain("export const adminProcedure = t.procedure.use(requireAdmin)");
    expect(read("server/_core/express-admin-middleware.ts")).toContain('user.role !== "admin"');
  });

  it("does not start private workspace reads or deadline actions for a guest", () => {
    const foia = read("client/src/pages/FoiaTracking.tsx");
    const signals = read("client/src/pages/SignalRegistry.tsx");
    const provenance = read("client/src/pages/Provenance.tsx");
    const templates = read("client/src/pages/CaseTemplates.tsx");

    for (const source of [foia, signals, provenance, templates]) {
      expect(source).toContain("PublicWalkthroughShell");
      expect(source).toContain("enabled: Boolean(user)");
    }

    expect(foia).toContain("if (!user) return;");
    expect(foia).toContain("refetchInterval: user ? 30000 : false");
    expect(signals).toContain("refetchInterval: user ? 60_000 : false");
    expect(provenance).toContain("refetchInterval: user && batchPolling ? 2000 : false");
  });

  it("keeps case-bearing workspaces behind guest wrappers without dropping direct URL IDs", () => {
    const workbench = read("client/src/pages/WorkbenchDashboard.tsx");
    const controlRoom = read("client/src/pages/ControlRoom.tsx");

    const workbenchWrapper = workbench.slice(
      workbench.indexOf("export default function WorkbenchDashboard()"),
      workbench.indexOf("function AuthenticatedWorkbenchDashboard()"),
    );
    const controlRoomWrapper = controlRoom.slice(
      controlRoom.indexOf("export default function ControlRoom()"),
      controlRoom.indexOf("function AuthenticatedControlRoom()"),
    );

    for (const wrapper of [workbenchWrapper, controlRoomWrapper]) {
      expect(wrapper).toContain("const { user } = useAuth()");
      expect(wrapper).toContain("if (!user)");
      expect(wrapper).toContain("PublicWalkthroughShell");
      expect(wrapper).not.toContain("useCase()");
      expect(wrapper).not.toContain("trpc.");
    }

    expect(workbenchWrapper).toContain("return <AuthenticatedWorkbenchDashboard />");
    expect(workbench).toContain("params.caseId ? parseInt(params.caseId, 10) : null");
    expect(controlRoomWrapper).toContain("return <AuthenticatedControlRoom />");
    expect(controlRoom).toContain("matched && params?.id ? parseInt(params.id, 10) : null");
  });

  it("keeps protected deep-detail hooks below authenticated-only component boundaries", () => {
    const protectedPages = [
      ["client/src/pages/Patterns.tsx", "Patterns", "patterns.summary.useQuery"],
      ["client/src/pages/ProvenanceHistory.tsx", "ProvenanceHistory", "provenance.listBatchRuns.useQuery"],
      ["client/src/pages/DocumentDetail.tsx", "DocumentDetail", "documents.get.useQuery"],
      ["client/src/pages/EntityDetail.tsx", "EntityDetail", "entities.get.useQuery"],
      ["client/src/pages/PresentationEditor.tsx", "PresentationEditor", "presentations.get.useQuery"],
    ] as const;

    for (const [path, componentName, protectedRead] of protectedPages) {
      const source = read(path);
      const wrapperStart = source.indexOf(`export default function ${componentName}()`);
      const innerStart = source.indexOf(`function Authenticated${componentName}()`);
      const wrapper = source.slice(wrapperStart, innerStart);
      const authenticatedImplementation = source.slice(innerStart);

      expect(wrapperStart).toBeGreaterThanOrEqual(0);
      expect(innerStart).toBeGreaterThan(wrapperStart);
      expect(wrapper).toContain("useAuth()");
      expect(wrapper).toContain("if (!user)");
      expect(wrapper).toContain("PublicWalkthroughShell");
      expect(wrapper).toContain(`<Authenticated${componentName} />`);
      expect(wrapper).not.toContain("trpc.");
      expect(authenticatedImplementation).toContain(protectedRead);
    }
  });
});
