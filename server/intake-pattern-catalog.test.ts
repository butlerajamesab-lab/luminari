import { beforeEach, expect, it, vi } from "vitest";
import pg from "pg";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db-legacy", () => ({ query_with_diagnostics: query }));
import {
  INTAKE_PATTERN_CATALOG_SQL,
  read_intake_pattern_catalog,
} from "./intake-pattern-catalog";
import {
  RULE_MANIFEST,
  RULE_VERSION,
} from "./engines/intake-spine/layer-10-pattern_registry";

beforeEach(() => query.mockReset());

it("uses the engine's actual rule conditions and returns only aggregate history", async () => {
  query.mockResolvedValue({
    rows: [
      {
        retained_records: 6019,
        chronology_observations: 6019,
        distinct_pattern_occurrences: 0,
        source_case_id: 123,
        private_text: "Do not disclose",
        history: [
          {
            rule_id: "retaliation_v1",
            rule_version: "older",
            breakpoint_type: "retaliation_structural_match",
            recorded_versions: 3,
            distinct_occurrence_keys: 1,
            unresolved_identity_records: 0,
            source_case_id: 123,
            matching_entities: ["private person"],
          },
        ],
      },
    ],
  });
  const result = await read_intake_pattern_catalog();
  expect(result.rules).toEqual(
    RULE_MANIFEST.rules.map((rule) => ({
      ...rule,
      rule_version: RULE_VERSION,
    })),
  );
  expect(result.chronology_observations).toBe(6019);
  expect(result.distinct_pattern_occurrences).toBe(0);
  expect(result.history[0].rule_version).toBe("older");
  expect(JSON.stringify(result)).not.toMatch(
    /source_case_id|private_text|private person|Do not disclose/,
  );
});

it("reports database failures instead of inventing an empty history", async () => {
  query.mockRejectedValue(new Error("Database unavailable"));
  await expect(read_intake_pattern_catalog()).rejects.toThrow(
    "Database unavailable",
  );
  query.mockResolvedValue({ rows: [] });
  await expect(read_intake_pattern_catalog()).rejects.toThrow(
    "snapshot_missing",
  );
});

// This read-only fixture runs against CI's schema-guard Postgres. All records
// live in a VALUES CTE; no production or test tables are created or modified.
export const HISTORY_FIXTURE_SQL = `with source_signals as (
  select * from (values
    ('chrono', 'session-a', 'chronology_reconstruction', '2.3.0', 'chronology_event', true, '[{"type":"chronology_event"}]'::jsonb),
    ('old', 'session-a', 'retaliation_v1', '1.0.0', 'retaliation_structural_match', false, '[{"type":"structural_pattern","pattern_id":"pattern-a"}]'::jsonb),
    ('replay', 'session-a', 'retaliation_v1', '1.0.0', 'retaliation_structural_match', true, '[{"type":"structural_pattern","pattern_id":"pattern-a"},{"type":"structural_pattern","pattern_id":"pattern-a"}]'::jsonb),
    ('new-version', 'session-a', 'retaliation_v1', '2.2.0', 'retaliation_structural_match', true, '[{"type":"structural_pattern","pattern_id":"pattern-a"}]'::jsonb),
    ('historical-only', 'session-b', 'retaliation_v1', '1.0.0', 'retaliation_structural_match', false, '[{"type":"structural_pattern","pattern_id":"pattern-b"}]'::jsonb),
    ('unknown', 'session-c', 'retaliation_v1', '1.0.0', 'retaliation_structural_match', true, '[{"type":"structural_pattern"}]'::jsonb),
    ('cascade', 'session-a', 'cascade_v1', '1.0.0', 'cascade', true, '[{"type":"structural_cascade","pattern_id":"pattern-c"}]'::jsonb)
  ) s(signal_id, source_intake_session_id, rule_id, rule_version, breakpoint_type, is_current, source_record_refs)
)
${INTAKE_PATTERN_CATALOG_SQL.replace(/^\s*with /, ", ").replaceAll("public.intake_signals", "source_signals")}`;

it.skipIf(!process.env.SCHEMA_GUARD_DB_URL)(
  "retains historical-only patterns and deduplicates replayed identities without counting events or cascades",
  async () => {
    const client = new pg.Client({
      connectionString: process.env.SCHEMA_GUARD_DB_URL,
    });
    await client.connect();
    try {
      const {
        rows: [result],
      } = await client.query(HISTORY_FIXTURE_SQL);
      expect(result).toEqual({
        retained_records: 7,
        chronology_observations: 1,
        distinct_pattern_occurrences: 2,
        history: [
          {
            rule_id: "retaliation_v1",
            rule_version: "1.0.0",
            breakpoint_type: "retaliation_structural_match",
            recorded_versions: 4,
            distinct_occurrence_keys: 2,
            unresolved_identity_records: 1,
          },
          {
            rule_id: "retaliation_v1",
            rule_version: "2.2.0",
            breakpoint_type: "retaliation_structural_match",
            recorded_versions: 1,
            distinct_occurrence_keys: 1,
            unresolved_identity_records: 0,
          },
        ],
      });
    } finally {
      await client.end();
    }
  },
);
