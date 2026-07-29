import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetch_mock, pool_query_mock } = vi.hoisted(() => ({
  fetch_mock: vi.fn(),
  pool_query_mock: vi.fn(),
}));

vi.mock("../../db", () => ({
  getPool: () => ({ query: pool_query_mock }),
}));

import {
  fetch_atlas_signal_events,
  fetch_atlas_stream_definition,
  get_atlas_bridge_client,
  type atlas_bridge_client,
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
  pool_query_mock.mockReset();
  fetch_mock.mockReset();
  vi.stubGlobal("fetch", fetch_mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    process.env.ATLAS_SUPABASE_URL = "https://atlas.example.test/";
    process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY = "test-service-key-with-sufficient-length";

    const result = await get_atlas_bridge_client();

    expect(result).toMatchObject({
      configured: true,
      configuration_source: "environment",
      client: {
        atlas_supabase_url: "https://atlas.example.test",
        atlas_supabase_key: "test-service-key-with-sufficient-length",
      },
    });
    expect(pool_query_mock).not.toHaveBeenCalled();
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
      client: {
        atlas_supabase_url: "https://atlas-vault.example.test",
        atlas_supabase_key: "test-publishable-key-with-sufficient-length",
      },
    });
    expect(pool_query_mock).toHaveBeenCalledWith(
      expect.stringContaining("get_atlas_bridge_runtime_config()"),
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

describe("Atlas bridge native RPC transport", () => {
  const client: atlas_bridge_client = {
    atlas_supabase_url: "https://atlas.example.test",
    atlas_supabase_key: "test-publishable-key-with-sufficient-length",
  };

  it("returns one allowlisted stream definition", async () => {
    fetch_mock.mockResolvedValue(
      new Response(
        JSON.stringify([{ stream_id: "usda_snap", source_id: "usda_fns" }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await fetch_atlas_stream_definition(client, "usda_snap");

    expect(result).toMatchObject({ stream_id: "usda_snap" });
    expect(fetch_mock).toHaveBeenCalledWith(
      "https://atlas.example.test/rest/v1/rpc/get_lighthouse_stream_definition",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          apikey: "test-publishable-key-with-sufficient-length",
          Authorization: "Bearer test-publishable-key-with-sufficient-length",
        }),
        body: JSON.stringify({ p_stream_id: "usda_snap" }),
      }),
    );
  });

  it("propagates bounded HTTP failures without exposing the API key", async () => {
    const console_spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetch_mock.mockResolvedValue(
      new Response("definition unavailable", { status: 503 }),
    );

    await expect(
      fetch_atlas_stream_definition(client, "usda_snap"),
    ).rejects.toThrow("status 503: definition unavailable");
    expect(console_spy).not.toHaveBeenCalled();
    console_spy.mockRestore();
  });

  it("bounds event page size to the Atlas export contract", async () => {
    fetch_mock.mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await fetch_atlas_signal_events(client, {
      stream_id: "pro_publica",
      offset: 10,
      limit: 50_000,
    });

    const request = fetch_mock.mock.calls[0];
    expect(request[0]).toBe(
      "https://atlas.example.test/rest/v1/rpc/get_lighthouse_signal_events",
    );
    expect(JSON.parse(request[1].body)).toEqual({
      p_stream_id: "pro_publica",
      p_offset: 10,
      p_limit: 1_000,
    });
  });

  it("requires no WebSocket or Supabase JS client", async () => {
    fetch_mock.mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await fetch_atlas_signal_events(client, {
      stream_id: "usda_snap",
      offset: 0,
      limit: 10,
    });

    expect(fetch_mock).toHaveBeenCalledTimes(1);
  });
});
