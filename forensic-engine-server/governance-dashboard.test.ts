/**
 * Governance Dashboard Tests
 * 
 * Validates:
 * 1. Dashboard router procedures exist and are properly typed
 * 2. Dashboard feed supports cursor-based pagination with filters
 * 3. Entry detail normalizes JSON fields
 * 4. Chain status includes real verification
 * 5. Snapshot history returns all snapshots
 * 6. Event types and components are available for filter dropdowns
 * 7. Export produces JSONL format
 * 8. UI page exists and imports correctly
 * 9. Route is wired in App.tsx
 * 10. Constitutional articles are displayed
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const projectRoot = path.resolve(__dirname, "..");

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf-8");
}

describe("Governance Dashboard: Router Procedures", () => {
  const routerCode = readFile("server/routers/governance-router.ts");

  it("exposes dashboardFeed with cursor-based pagination", () => {
    expect(routerCode).toContain("dashboardFeed:");
    expect(routerCode).toContain("cursor: z.number().optional()");
    expect(routerCode).toContain("limit: z.number().min(1).max(100)");
    expect(routerCode).toContain("nextCursor");
    expect(routerCode).toContain("hasMore");
  });

  it("dashboardFeed supports eventType filter", () => {
    expect(routerCode).toContain("eventType: z.string().optional()");
    expect(routerCode).toContain("eq(governanceLog.eventType, eventType)");
  });

  it("dashboardFeed supports componentType filter", () => {
    expect(routerCode).toContain("componentType: z.string().optional()");
    expect(routerCode).toContain("eq(governanceLog.component, componentType)");
  });

  it("dashboardFeed supports scope filtering", () => {
    expect(routerCode).toContain("scopeType: z.string().optional()");
    expect(routerCode).toContain("scopeId: z.string().optional()");
  });

  it("dashboardFeed uses deterministic ordering (seq_no DESC)", () => {
    expect(routerCode).toContain("desc(governanceLog.seqNo)");
  });

  it("dashboardFeed returns total count", () => {
    expect(routerCode).toContain("total: countResult.count");
  });

  it("exposes dashboardEntry with normalized JSON", () => {
    expect(routerCode).toContain("dashboardEntry:");
    expect(routerCode).toContain("normalizeJson");
    expect(routerCode).toContain("JSON.parse(val)");
  });

  it("exposes dashboardChainStatus with real verification", () => {
    expect(routerCode).toContain("dashboardChainStatus:");
    expect(routerCode).toContain("verifyGovernanceChain(db)");
    expect(routerCode).toContain("totalEntries: countResult.count");
    expect(routerCode).toContain("lastEntryAt");
    expect(routerCode).toContain("lastSeqNo");
  });

  it("exposes dashboardVerifyChain as mutation", () => {
    expect(routerCode).toContain("dashboardVerifyChain:");
    expect(routerCode).toContain(".mutation(async");
  });

  it("exposes dashboardSnapshots listing all snapshots", () => {
    expect(routerCode).toContain("dashboardSnapshots:");
    expect(routerCode).toContain("governanceSnapshots");
    expect(routerCode).toContain("desc(governanceSnapshots.createdAt)");
  });

  it("exposes dashboardEventTypes for filter dropdown", () => {
    expect(routerCode).toContain("dashboardEventTypes:");
    expect(routerCode).toContain("GOVERNANCE_EVENT_TYPES");
  });

  it("exposes dashboardComponents for filter dropdown", () => {
    expect(routerCode).toContain("dashboardComponents:");
    expect(routerCode).toContain("selectDistinct");
  });

  it("all dashboard procedures use adminProcedure (not public)", () => {
    // Dashboard procedures should be admin-only
    const dashboardProcedures = [
      "dashboardFeed:", "dashboardEntry:", "dashboardChainStatus:",
      "dashboardVerifyChain:", "dashboardSnapshots:",
      "dashboardEventTypes:", "dashboardComponents:",
    ];
    for (const proc of dashboardProcedures) {
      const idx = routerCode.indexOf(proc);
      expect(idx).toBeGreaterThan(-1);
      // Find the line containing this procedure and verify it uses adminProcedure
      const lineStart = routerCode.lastIndexOf("\n", idx) + 1;
      const lineEnd = routerCode.indexOf("\n", idx);
      const line = routerCode.substring(lineStart, lineEnd);
      // The procedure definition line should contain adminProcedure
      // Check within the same block (up to 5 lines after the key)
      const block = routerCode.substring(idx, idx + 300);
      expect(block).toContain("adminProcedure");
    }
  });
});

describe("Governance Dashboard: UI Page", () => {
  const uiCode = readFile("client/src/pages/GovernanceDashboard.tsx");

  it("exists as a page component", () => {
    expect(uiCode).toContain("export default function GovernanceDashboard");
  });

  it("has ChainStatusPanel with real verification", () => {
    expect(uiCode).toContain("function ChainStatusPanel");
    expect(uiCode).toContain("governance.dashboardChainStatus");
    expect(uiCode).toContain("governance.dashboardVerifyChain");
    expect(uiCode).toContain("VALID");
    expect(uiCode).toContain("BROKEN");
  });

  it("has FeedPanel with cursor pagination", () => {
    expect(uiCode).toContain("function FeedPanel");
    expect(uiCode).toContain("governance.dashboardFeed");
    expect(uiCode).toContain("cursorStack");
    expect(uiCode).toContain("handleNextPage");
    expect(uiCode).toContain("handlePrevPage");
  });

  it("has EntryDetailPanel with full metadata display", () => {
    expect(uiCode).toContain("function EntryDetailPanel");
    expect(uiCode).toContain("governance.dashboardEntry");
    expect(uiCode).toContain("Entry Hash");
    expect(uiCode).toContain("Previous Hash");
    expect(uiCode).toContain("Previous State");
    expect(uiCode).toContain("New State");
    expect(uiCode).toContain("Rationale");
  });

  it("has copy verification payload functionality", () => {
    expect(uiCode).toContain("copyVerificationPayload");
    expect(uiCode).toContain("navigator.clipboard.writeText");
    expect(uiCode).toContain("Verification payload copied");
  });

  it("has SnapshotHistoryPanel", () => {
    expect(uiCode).toContain("function SnapshotHistoryPanel");
    expect(uiCode).toContain("governance.dashboardSnapshots");
    expect(uiCode).toContain("governance.createSnapshot");
  });

  it("has ExportPanel with JSONL download", () => {
    expect(uiCode).toContain("function ExportPanel");
    expect(uiCode).toContain("governance.exportLog");
    expect(uiCode).toContain("application/x-ndjson");
    expect(uiCode).toContain(".jsonl");
  });

  it("displays all 12 Constitutional Articles", () => {
    expect(uiCode).toContain("Art. 1");
    expect(uiCode).toContain("Art. 2");
    expect(uiCode).toContain("Art. 3");
    expect(uiCode).toContain("Art. 4");
    expect(uiCode).toContain("Art. 5");
    expect(uiCode).toContain("Art. 6");
    expect(uiCode).toContain("Art. 7");
    expect(uiCode).toContain("Art. 8");
    expect(uiCode).toContain("Art. 9");
    expect(uiCode).toContain("Art. 10");
    expect(uiCode).toContain("Art. 11");
    expect(uiCode).toContain("Art. 12");
  });

  it("has filter dropdowns for event type and component", () => {
    expect(uiCode).toContain("governance.dashboardEventTypes");
    expect(uiCode).toContain("governance.dashboardComponents");
    expect(uiCode).toContain("eventTypeFilter");
    expect(uiCode).toContain("componentFilter");
  });

  it("displays JSON as-is (no interpretation layer)", () => {
    // Raw JSON display, not interpreted
    expect(uiCode).toContain("JSON.stringify(entry.previousState, null, 2)");
    expect(uiCode).toContain("JSON.stringify(entry.newState, null, 2)");
    expect(uiCode).toContain("JSON.stringify(entry, null, 2)");
  });

  it("shows hash chain visualization in entry detail", () => {
    expect(uiCode).toContain("Entry Hash (SHA-256)");
    expect(uiCode).toContain("chains to");
    expect(uiCode).toContain("Previous Hash");
  });

  it("has back navigation to Mission Control", () => {
    expect(uiCode).toContain("/mission-control");
    expect(uiCode).toContain("Mission Control");
  });
});

describe("Governance Dashboard: Route Wiring", () => {
  const appCode = readFile("client/src/App.tsx");

  it("GovernanceDashboard is imported in App.tsx", () => {
    expect(appCode).toContain('import GovernanceDashboard from "./pages/GovernanceDashboard"');
  });

  it("route /mission-control/governance is registered", () => {
    expect(appCode).toContain('/mission-control/governance');
    expect(appCode).toContain("GovernanceDashboard");
  });
});

describe("Governance Dashboard: Mission Control Integration", () => {
  const mcCode = readFile("client/src/pages/MissionControl.tsx");

  it("has link to Constitutional Governance Dashboard from governance tab", () => {
    expect(mcCode).toContain("/mission-control/governance");
    expect(mcCode).toContain("Constitutional Governance Dashboard");
  });
});
