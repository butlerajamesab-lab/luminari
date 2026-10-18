import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pool_mock = vi.hoisted(() => ({
  construct: vi.fn(),
  on: vi.fn(),
  install_guard: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: class MockPool {
    constructor(options: unknown) { pool_mock.construct(options); }
    on(...args: unknown[]) { pool_mock.on(...args); }
  },
}));
vi.mock("./database-pool-lease-guard", () => ({
  install_database_pool_lease_guard: pool_mock.install_guard,
}));

const { create_database_pool, get_database_tls_options, sanitize_database_url_for_pg } =
  await import("./pg-config");

describe("canonical Postgres TLS peer verification", () => {
  const old_url = process.env.DATABASE_URL;
  const old_ca = process.env.DATABASE_SSL_CA_PEM;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgresql://postgres:pw@db.example.com:6543/postgres?sslmode=no-verify";
    delete process.env.DATABASE_SSL_CA_PEM;
  });

  afterEach(() => {
    if (old_url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = old_url;
    if (old_ca === undefined) delete process.env.DATABASE_SSL_CA_PEM;
    else process.env.DATABASE_SSL_CA_PEM = old_ca;
  });

  it("always enables CA and hostname verification, even when URL requests no-verify", () => {
    create_database_pool();
    expect(pool_mock.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { rejectUnauthorized: true },
        connectionString: expect.not.stringContaining("sslmode"),
      }),
    );
  });

  it("accepts a provisioned PEM CA without disabling verification", () => {
    const ca = "-----BEGIN CERTIFICATE-----\\nZmFrZQ==\\n-----END CERTIFICATE-----";
    process.env.DATABASE_SSL_CA_PEM = ca;
    const ssl = get_database_tls_options();
    expect(ssl).toEqual({
      rejectUnauthorized: true,
      ca: ca.replace(/\\n/g, "\n"),
    });
    create_database_pool();
    expect(pool_mock.construct).toHaveBeenCalledWith(
      expect.objectContaining({ ssl }),
    );
  });

  it("rejects invalid custom CA configuration rather than disabling verification", () => {
    process.env.DATABASE_SSL_CA_PEM = "not-a-certificate";
    expect(() => create_database_pool()).toThrow("DATABASE_SSL_CA_PEM");
    expect(pool_mock.construct).not.toHaveBeenCalled();
  });

  it("strips URL TLS parameters so node-postgres cannot overwrite verified SSL config", () => {
    const parsed = new URL(sanitize_database_url_for_pg(
      "postgresql://u:p@db.example.com:6543/postgres?sslmode=no-verify&sslrootcert=/tmp/ca.pem&pgbouncer=true",
    ));
    expect(parsed.searchParams.has("sslmode")).toBe(false);
    expect(parsed.searchParams.has("sslrootcert")).toBe(false);
    expect(parsed.searchParams.has("pgbouncer")).toBe(false);
  });
});
