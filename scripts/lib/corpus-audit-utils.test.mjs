import { describe, expect, it } from "vitest";
import { audit_database_pool_options } from "./corpus-audit-utils.mjs";

describe("standalone audit PostgreSQL TLS", () => {
  it("strips URI-supplied TLS overrides and verifies the connection peer", () => {
    const options = audit_database_pool_options(
      "postgresql://postgres:fake@example.test:6543/postgres?sslmode=no-verify&sslrootcert=/tmp/fake&pgbouncer=true",
      {},
    );
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(options.connectionTimeoutMillis).toBe(10000);
    expect(options.max).toBe(3);
    const url = new URL(options.connectionString);
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.has("sslrootcert")).toBe(false);
    expect(url.searchParams.has("pgbouncer")).toBe(false);
  });

  it("reads an optional newline-normalized trusted CA without disabling verification", () => {
    const ca = "-----BEGIN CERTIFICATE-----\\nZmFrZQ==\\n-----END CERTIFICATE-----";
    const options = audit_database_pool_options(
      "postgresql://postgres:fake@example.test:6543/postgres",
      { DATABASE_SSL_CA_PEM: ca },
    );
    expect(options.ssl).toEqual({ rejectUnauthorized: true, ca: ca.replace(/\\n/g, "\n") });
  });

  it("fails on invalid CA configuration rather than downgrading security", () => {
    expect(() => audit_database_pool_options(
      "postgresql://postgres:fake@example.test:6543/postgres",
      { DATABASE_SSL_CA_PEM: "not a PEM" },
    )).toThrow("DATABASE_SSL_CA_PEM");
  });
});
