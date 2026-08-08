import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const compat = readFileSync(resolve(here, "provenance-alert-runtime-compat.ts"), "utf8");
const alerting = readFileSync(resolve(here, "provenance-alerting.ts"), "utf8");
const facade = readFileSync(resolve(here, "db.ts"), "utf8");

describe("provenance alert live-Postgres contract", () => {
  it("uses explicit Postgres RETURNING identity instead of MySQL insertId semantics", () => {
    expect(compat).toContain("returning id");
    expect(compat).toContain("result.rows[0]?.id");
    expect(alerting).not.toContain("insertId");
    expect(alerting).not.toContain("db.insert(provenanceAlertEvents)");
  });

  it("preserves the physical snake_case alert schema while returning camelCase API fields", () => {
    expect(compat).toContain("alert_type");
    expect(compat).toContain("cooldown_until");
    expect(compat).toContain("notification_sent");
    expect(compat).toContain("created_at");
    expect(compat).toContain("alertType,");
    expect(compat).toContain("cooldownUntil:");
    expect(compat).toContain("notificationSent:");
    expect(compat).toContain("createdAt:");
  });

  it("implements cooldown and history directly on the production alert store", () => {
    expect(compat).toContain("from public.provenance_alert_events");
    expect(compat).toContain("cooldown_until > $2");
    expect(compat).toContain("order by created_at desc, id desc");
    expect(alerting).toContain("isProvenanceAlertInCooldown");
    expect(alerting).toContain("listProvenanceAlertEvents");
  });

  it("does not create alert events from an empty finding denominator", () => {
    expect(alerting).toContain("if (m.totalFindings === 0)");
    expect(alerting).toContain("no alert event is fabricated from an empty denominator");
  });

  it("routes persistence helpers through the bounded compatibility facade", () => {
    expect(facade).toContain('from "./provenance-alert-runtime-compat"');
    expect(facade).toContain("isProvenanceAlertInCooldown");
    expect(facade).toContain("createProvenanceAlertEvent");
    expect(facade).toContain("listProvenanceAlertEvents");
  });
});
