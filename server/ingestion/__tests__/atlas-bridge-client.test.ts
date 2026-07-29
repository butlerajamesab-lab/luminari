import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { create_client_mock, pool_query_mock, rpc_mock } = vi.hoisted(() => ({
  create_client_mock: vi.fn(),
  pool_query_mock: vi.fn(),
  rpc_mock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: create_client_mock,
}));

vi.mock("../../db", () => ({
  getPool: () => ({ query: pool_query_mock }),
}));

import {
  fetch_atlas_signal_events,
  fetch_atlas_stream_definition,
  get_atlas_bridge_client,
} from "../atlas-bridge-client";

const original_environment = {
  url: process.env.ATLAS_SUPABASE_URL,
  service_key: process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY,
  anon_key: process.env.ATLAS_SUPABASE_ANON_KEY,
};

function clear_atlas_environment(): void {
  delete process.env.ATLAS_SUPABASE_URL;
  delete process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.ATLAS_SUPABASE_ANON_KEY;
}

beforeEach(() => {
  clear_atlas_environment();
  create_client_mock.mockReset();
  pool_query_mock.mockReset();
  rpc_mock.mockReset();
  create_client_mock.mockReturnValue({ rpc: rpc_mock });
});

afterEach(() => {
  clear_atlas_environment();
  if (original_environment.url !== undefined) {
    process.env.ATLAS_SUPABASE_URL = original_environment.url;
  }
  if (original_environment.service_key !== undefined) {
    process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY = original_environment.service_key;
  }
  if (original_environment.anon_key !== undefined) {
    process.env.ATLAS_SUPABASE_ANON_KEY = original_environment.anon_key;
  }
});

describe("Atlas bridge client configuration", () => {
  it("uses environment configuration before querying Vault", async () => {
    process.env.ATLAS_SUPABASE_URL = "https://atlas.example.test";
    process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY = "test-service-key-with-sufficient-length";

    const result = await get_atlas_bridge_client();

    expect(result).toMatchObject({
      configured: true,
      configuration_source: "environment",
    });
    expect(pool_query_mock).not.toHaveBeenCalled();
    expect(create_client_mock).toHaveBeenCalledWith(
      "https://atlas.example.test",
      "test-service-key-with-sufficient-length",
      expect.objectContaining({ auth: expect.any(Object) }),
    );
  });

  it("falls back to the protected Lighthouse Vault reader", async () => {
    pool_query_mock.mockResolvedValue({
      rows: [
        {
          atlas_supabase_url: "https://atlas-vault.example.test",
          atlas_supabase_key: "test-publishable-key-with-sufficient-length",
        },
      ],
    });

    const result = await get_atlas_bridge_client();

    expect(result).toMatchObject({
      configured: true,
      configuration_source: "vault",
    });
    expect(pool_query_mock).toHaveBeenCalledWith(
      expect.stringContaining("get_atlas_bridge_runtime_config()"),
    );
    expect(create_client_mock).toHaveBeenCalledWith(
      "https://atlas-vault.example.test",
      "test-publishable-key-with-sufficient-length",
      expect.objectContaining({ auth: expect.any(Object) }),
    );
  });

  it("fails closed when neither configuration source is usable", async () => {
    pool_query_mock.mockResolvedValue({
      rows: [{ atlas_supabase_url: null, atlas_supabase_key: null }],
    });

    const result = await get_atlas_bridge_client();

    expect(result).toMatchObject({
      configured: false,
      client: null,
      configuration_source: null,
    });
  });

  it("returns a bounded configuration error without logging credential data", async () => {
    const console_spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    pool_query_mock.mockRejectedValue(new Error("Vault reader unavailable"));

    const result = await get_atlas_bridge_client();

    expect(result).toMatchObject({ configured: false });
    if (!result.configured) {
      expect(result.error_message).toContain("Vault reader unavailable");
      expect(result.error_message).not.toContain("test-publishable-key");
    }
    expect(console_spy).not.toHaveBeenCalled();
    console_spy.mockRestore();
  });
});

describe("Atlas bridge export RPCs", () => {
  const client = { rpc: rpc_mock } as any;

  it("returns one allowlisted stream definition", async () => {
    rpc_mock.mockResolvedValue({
      data: [{ stream_id: "usda_snap", source_id: "usda_fns" }],
      error: null,
    });

    const result = await fetch_atlas_stream_definition(client, "usda_snap");

    expect(result).toMatchObject({ stream_id: "usda_snap" });
    expect(rpc_mock).toHaveBeenCalledWith(
      "get_lighthouse_stream_definition",
      { p_stream_id: "usda_snap" },
    );
  });

  it("propagates stream-definition RPC failures", async () => {
    rpc_mock.mockResolvedValue({
      data: null,
      error: { message: "definition unavailable" },
    });

    await expect(
      fetch_atlas_stream_definition(client, "usda_snap"),
    ).rejects.toThrow("definition unavailable");
  });

  it("bounds event page size to the Atlas export contract", async () => {
    rpc_mock.mockResolvedValue({ data: [], error: null });

    await fetch_atlas_signal_events(client, {
      stream_id: "pro_publica",
      offset: 10,
      limit: 50_000,
    });

    expect(rpc_mock).toHaveBeenCalledWith(
      "get_lighthouse_signal_events",
      {
        p_stream_id: "pro_publica",
        p_offset: 10,
        p_limit: 1_000,
      },
    );
  });

  it("raises event RPC errors without returning partial fake data", async () => {
    rpc_mock.mockResolvedValue({
      data: [{ stream_id: "usda_snap" }],
      error: { message: "events unavailable" },
    });

    await expect(
      fetch_atlas_signal_events(client, {
        stream_id: "usda_snap",
        offset: 0,
        limit: 10,
      }),
    ).rejects.toThrow("events unavailable");
  });
});
