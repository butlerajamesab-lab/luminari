import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const compat = read("server/signal-governance-audit-compat.ts");
const router = read("server/routers/signal-governance.ts");

describe("signal governance audit compatibility", () => {
  it("reads PostgreSQL QueryResult rows instead of direct numeric result indexing", () => {
    expect(compat).toContain("native_rows");
    expect(compat).toContain("rows_from_execute_result(signal_result)");
    expect(compat).toContain("rows_from_execute_result(log_result)");
    expect(compat).not.toContain("signal_result[0]");
    expect(compat).not.toContain("log_result[0]");
  });

  it("uses the live snake_case signal_generation_log contract", () => {
    expect(compat).toContain("step_name, template_used, parameters, verification_result");
    expect(compat).toContain("factor_breakdown, created_at");
    expect(compat).not.toContain("generation_step");
    expect(compat).not.toContain("template_id");
    expect(compat).not.toContain("input_parameters");
    expect(compat).not.toContain("verification_results");
    expect(compat).not.toContain("confidence_factors");
  });

  it("fails soft on absent historical signal rows and malformed JSON fields", () => {
    expect(compat).toContain("signal_rows.length > 0 ? parse_detected_signal(signal_rows[0]) : null");
    expect(compat).toContain("try {\n    return JSON.parse(value);");
    expect(compat).toContain("return fallback;");
  });

  it("routes only the legacy auditTrail procedure through the compatibility reader", () => {
    expect(router).toContain('import { get_signal_audit_trail } from "../signal-governance-audit-compat"');
    expect(router).toContain("return get_signal_audit_trail(input.signalId)");
    expect(router).toContain("getEscalationSummary");
    expect(router).toContain("getProvenance");
  });
});
