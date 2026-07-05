import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MissionControlSchemaLedgerPanel } from "@/components/mission/MissionControlSchemaLedgerPanel";
import { normalizeMissionControlPayload } from "./missionControlPayload";

describe("MissionControl schema ledger normalization", () => {
  it("renders with a full payload", () => {
    const payload = normalizeMissionControlPayload({
      timestamp: "2026-01-01T00:00:00.000Z",
      tables: { total: 1, items: [{ table_name: "action_steps", column_count: 5 }] },
      views: { total: 1, items: [{ view_name: "critical_files_verification" }] },
      foreign_keys: {
        total: 1,
        items: [
          {
            source_table: "action_steps",
            source_column: "strategy_path_id",
            target_table: "strategy_paths",
            target_column: "id",
          },
        ],
      },
    });

    expect(() => renderToStaticMarkup(<MissionControlSchemaLedgerPanel payload={payload} />)).not.toThrow();
  });

  it("renders when views section is missing", () => {
    const payload = normalizeMissionControlPayload({
      timestamp: "2026-01-01T00:00:00.000Z",
      tables: { total: 1, items: [{ table_name: "action_steps", column_count: 5 }] },
      foreign_keys: {
        total: 1,
        items: [
          {
            source_table: "action_steps",
            source_column: "strategy_path_id",
            target_table: "strategy_paths",
            target_column: "id",
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<MissionControlSchemaLedgerPanel payload={payload} />);
    expect(html).toContain("Views");
    expect(html).toContain(">0<");
  });
});
