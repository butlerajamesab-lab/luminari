import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Prism verification bridge source guardrails", () => {
  const contract = readFileSync(
    resolve(process.cwd(), "server/services/prism-verification-contract.ts"),
    "utf8",
  );
  const client = readFileSync(
    resolve(process.cwd(), "server/services/prism-verification-client.ts"),
    "utf8",
  );
  const router = readFileSync(
    resolve(process.cwd(), "server/routes/prism-verification-router.ts"),
    "utf8",
  );
  const source = `${contract}\n${client}\n${router}`;

  it("uses a bounded timeout and bounded retry count", () => {
    expect(client).toContain("PRISM_REQUEST_TIMEOUT_MS = 5_000");
    expect(client).toContain("PRISM_MAX_ATTEMPTS = 3");
  });

  it("authenticates server-to-server requests without exposing a service role key", () => {
    expect(source).toContain("x-prism-signature");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("preserves the complete verification state vocabulary", () => {
    for (const state of [
      "user_reported",
      "document_stated",
      "supported_by_one_source",
      "supported_by_multiple_sources",
      "contradicted",
      "disputed",
      "incomplete",
      "unresolved",
      "verified",
    ]) {
      expect(contract).toContain(state);
    }
  });

  it("contains the six controlled boundary scenarios", () => {
    expect(router).toContain("support_request");
    expect(router).toContain("contradiction_request");
    expect(router).toContain("incomplete_request");
    expect(router).toContain("duplicate_receipt_reused");
    expect(router).toContain("modified_input_rejected");
    expect(router).toContain("outage_visible_as_degraded");
  });
});
