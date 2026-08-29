import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260815072854_legislative_version_queue_state_monotonicity.sql", import.meta.url),
  "utf8",
);
const priorityMigration = readFileSync(
  new URL("../supabase/migrations/20260815073854_legislative_version_queue_priority_monotonicity.sql", import.meta.url),
  "utf8",
);

describe("legislative version queue state monotonicity", () => {
  it("preserves worker leases, retry backoff, and permanent failures across activation sweeps", () => {
    expect(migration).toContain("old.queue_state in ('submitted','degraded','permanent_failure')");
    expect(migration).toContain("new.next_attempt_at:=old.next_attempt_at");
    expect(migration).toContain("new.locked_at:=old.locked_at");
    expect(migration).toContain("new.last_error_code is not distinct from old.last_error_code");
  });

  it("leaves an explicit replay path that clears prior failure fields", () => {
    expect(migration).toContain("new.last_failure_class is not distinct from old.last_failure_class");
    expect(migration).toContain("Intentional replay must clear prior failure fields");
  });

  it("does not let activation erase an explicit repair priority", () => {
    expect(priorityMigration).toContain("new.priority:=least(old.priority,new.priority)");
    expect(priorityMigration).toContain("must not erase a lower repair/backfill priority");
  });
});
