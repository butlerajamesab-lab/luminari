import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPool } from "../db";

export type atlas_stream_definition = {
  stream_id: string;
  source_id: string;
  jurisdiction_id: string;
  module_hint: string;
  throughput_profile: string;
  safety_profile: string;
  governance_contract_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type atlas_signal_event = {
  stream_id: string;
  offset: number | string;
  timestamp: string;
  signal_type: string;
  spacetime: Record<string, unknown>;
  provenance: Record<string, unknown>;
  payload: Record<string, unknown>;
  source_id: string;
  jurisdiction_id: string;
  module_hint: string;
  ingested_at: string;
};

export type atlas_bridge_client_result =
  | { configured: true; client: SupabaseClient; configuration_source: "environment" | "vault" }
  | { configured: false; client: null; configuration_source: null; error_message: string };

type atlas_bridge_runtime_config_row = {
  atlas_supabase_url: string | null;
  atlas_supabase_key: string | null;
};

type valid_atlas_config = {
  atlas_supabase_url: string;
  atlas_supabase_key: string;
};

function create_atlas_client(
  atlas_supabase_url: string,
  atlas_supabase_key: string,
): SupabaseClient {
  return createClient(atlas_supabase_url, atlas_supabase_key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalize_atlas_config(
  atlas_supabase_url: unknown,
  atlas_supabase_key: unknown,
): valid_atlas_config | null {
  if (
    typeof atlas_supabase_url !== "string" ||
    !atlas_supabase_url.startsWith("https://") ||
    typeof atlas_supabase_key !== "string" ||
    atlas_supabase_key.length < 20
  ) {
    return null;
  }

  return {
    atlas_supabase_url,
    atlas_supabase_key,
  };
}

async function read_atlas_config_from_vault(): Promise<atlas_bridge_runtime_config_row | null> {
  const result = await getPool().query(
    `select atlas_supabase_url, atlas_supabase_key
       from public.get_atlas_bridge_runtime_config()
      limit 1`,
  );
  const row = result.rows[0] as atlas_bridge_runtime_config_row | undefined;
  return row ?? null;
}

export async function get_atlas_bridge_client(): Promise<atlas_bridge_client_result> {
  const environment_config = normalize_atlas_config(
    process.env.ATLAS_SUPABASE_URL,
    process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY ??
      process.env.ATLAS_SUPABASE_ANON_KEY,
  );

  if (environment_config) {
    return {
      configured: true,
      client: create_atlas_client(
        environment_config.atlas_supabase_url,
        environment_config.atlas_supabase_key,
      ),
      configuration_source: "environment",
    };
  }

  try {
    const vault_config_row = await read_atlas_config_from_vault();
    const vault_config = normalize_atlas_config(
      vault_config_row?.atlas_supabase_url,
      vault_config_row?.atlas_supabase_key,
    );

    if (vault_config) {
      return {
        configured: true,
        client: create_atlas_client(
          vault_config.atlas_supabase_url,
          vault_config.atlas_supabase_key,
        ),
        configuration_source: "vault",
      };
    }
  } catch (error) {
    const error_message = error instanceof Error ? error.message : String(error);
    return {
      configured: false,
      client: null,
      configuration_source: null,
      error_message: `Atlas bridge Vault configuration could not be read: ${error_message}`,
    };
  }

  return {
    configured: false,
    client: null,
    configuration_source: null,
    error_message:
      "Atlas bridge configuration is missing from both Render environment variables and Lighthouse Vault",
  };
}

export async function fetch_atlas_stream_definition(
  client: SupabaseClient,
  stream_id: string,
): Promise<atlas_stream_definition | null> {
  const { data, error } = await client.rpc("get_lighthouse_stream_definition", {
    p_stream_id: stream_id,
  });

  if (error) {
    throw new Error(`Atlas stream definition RPC failed: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  return (rows[0] as atlas_stream_definition | undefined) ?? null;
}

export async function fetch_atlas_signal_events(
  client: SupabaseClient,
  input: { stream_id: string; offset: number; limit: number },
): Promise<atlas_signal_event[]> {
  const bounded_limit = Math.min(1_000, Math.max(1, Math.floor(input.limit)));
  const { data, error } = await client.rpc("get_lighthouse_signal_events", {
    p_stream_id: input.stream_id,
    p_offset: input.offset,
    p_limit: bounded_limit,
  });

  if (error) {
    throw new Error(`Atlas signal event RPC failed: ${error.message}`);
  }

  return (Array.isArray(data) ? data : []) as atlas_signal_event[];
}
