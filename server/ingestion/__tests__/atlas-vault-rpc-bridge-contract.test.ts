import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(
    fileURLToPath(new URL(relative_path, import.meta.url)),
    "utf8",
  );
}

describe("Atlas Vault-backed RPC bridge contract", () => {
  const adapter = read("../atlas-stream-adapter.ts");
  const client = read("../atlas-bridge-client.ts");
  const lighthouse_migration = read(
    "../../../supabase/migrations/20260729151500_atlas_bridge_vault_config.sql",
  );
  const atlas_migration = read(
    "../../../atlas/supabase/migrations/20260729151000_lighthouse_stream_export_contract.sql",
  );

  it("uses the Vault-backed Atlas client and read-only RPCs", () => {
    expect(adapter).toContain("get_atlas_bridge_client");
    expect(adapter).toContain("await get_atlas_bridge_client()");
    expect(adapter).toContain("fetch_atlas_stream_definition");
    expect(adapter).toContain("fetch_atlas_signal_events");
    expect(adapter).not.toContain('.from("streams")');
    expect(adapter).not.toContain('.from("signal_events")');
  });

  it("prefers environment configuration and falls back to Lighthouse Vault", () => {
    expect(client).toContain("ATLAS_SUPABASE_URL");
    expect(client).toContain("ATLAS_SUPABASE_SERVICE_ROLE_KEY");
    expect(client).toContain("ATLAS_SUPABASE_ANON_KEY");
    expect(client).toContain("get_atlas_bridge_runtime_config()");
    expect(client).toContain('configuration_source: "vault"');
  });

  it("calls only the Atlas export RPC contract", () => {
    expect(client).toContain('client.rpc("get_lighthouse_stream_definition"');
    expect(client).toContain('client.rpc("get_lighthouse_signal_events"');
    expect(client).not.toContain('.from("streams")');
    expect(client).not.toContain('.from("signal_events")');
  });

  it("keeps all credential values out of source control", () => {
    for (const source of [client, lighthouse_migration, atlas_migration]) {
      expect(source).not.toContain("sb_publishable_");
      expect(source).not.toMatch(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
    }
    expect(lighthouse_migration).toContain("vault.decrypted_secrets");
    expect(lighthouse_migration).toContain("atlas_supabase_publishable_key");
  });

  it("does not open Atlas tables directly and requires an explicit stream allowlist", () => {
    expect(atlas_migration).toContain("lighthouse_stream_export_allowlist");
    expect(atlas_migration).toContain("security definer");
    expect(atlas_migration).toContain("least(greatest(coalesce(p_limit, 1000), 1), 1000)");
    expect(atlas_migration).not.toContain("create policy");
    expect(atlas_migration).not.toContain("grant select on public.streams");
    expect(atlas_migration).not.toContain("grant select on public.signal_events");
  });
});
