/**
 * Tests for Mission Control features added in this session:
 * 1. findingsBySeverity procedure in adminDashboardRouter
 * 2. data_stream_registry column alignment
 * 3. KnowledgePopulationPanel onNavigateToKB prop (structural)
 */
import { describe, it, expect } from "vitest";
import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── 1. findingsBySeverity procedure exists in the router ───
describe("adminDashboardRouter.findingsBySeverity", () => {
  it("should be exported from admin-dashboard router", async () => {
    const { adminDashboardRouter } = await import("./routers/admin-dashboard");
    expect(adminDashboardRouter).toBeDefined();
    // The router object should have a findingsBySeverity key
    expect(Object.keys(adminDashboardRouter)).toContain("findingsBySeverity");
  });
});

// ─── 2. data_stream_registry column alignment ───
describe("data_stream_registry schema alignment", () => {
  it("should have stream_id_dsr column", async () => {
    const [rows] = await (db as any).$client.execute(
      "SHOW COLUMNS FROM data_stream_registry LIKE 'stream_id_dsr'"
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("should have enabled_dsr column", async () => {
    const [rows] = await (db as any).$client.execute(
      "SHOW COLUMNS FROM data_stream_registry LIKE 'enabled_dsr'"
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("should have consecutive_failures_dsr column", async () => {
    const [rows] = await (db as any).$client.execute(
      "SHOW COLUMNS FROM data_stream_registry LIKE 'consecutive_failures_dsr'"
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("should have api_url_dsr column", async () => {
    const [rows] = await (db as any).$client.execute(
      "SHOW COLUMNS FROM data_stream_registry LIKE 'api_url_dsr'"
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("should have field_mapping_dsr column", async () => {
    const [rows] = await (db as any).$client.execute(
      "SHOW COLUMNS FROM data_stream_registry LIKE 'field_mapping_dsr'"
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("should have at least 30 columns total", async () => {
    const [rows] = await (db as any).$client.execute(
      "SHOW COLUMNS FROM data_stream_registry"
    );
    expect(rows.length).toBeGreaterThanOrEqual(30);
  });
});

// ─── 3. KnowledgePopulationPanel prop shape (structural check) ───
describe("KnowledgePopulationPanel component", () => {
  it("should accept onNavigateToKB as an optional prop in source", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      "client/src/pages/MissionControl.tsx",
      "utf8"
    );
    // Check the function signature has the prop
    expect(source).toContain("onNavigateToKB?: () => void");
    // Check the prop is used in the component
    expect(source).toContain("onNavigateToKB && (");
    // Check the ArrowRight button is rendered
    expect(source).toContain("<ArrowRight className=\"h-3 w-3\" />");
  });

  it("should have controlled Tabs with mainTab state", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      "client/src/pages/MissionControl.tsx",
      "utf8"
    );
    expect(source).toContain('const [mainTab, setMainTab] = useState("operations")');
    expect(source).toContain("value={mainTab} onValueChange={setMainTab}");
  });
});

// ─── 4. StructuralSignalsPanel drill-through ───
describe("StructuralSignalsPanel drill-through", () => {
  it("should have selectedSeverity state and findingsBySeverity query in source", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      "client/src/pages/MissionControl.tsx",
      "utf8"
    );
    expect(source).toContain("const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null)");
    expect(source).toContain("findingsBySeverity.useQuery");
    expect(source).toContain("enabled: selectedSeverity !== null");
  });
});
