import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

/**
 * Every same-origin REST mount that the server guards with an admin/session
 * middleware must be allowlisted by the client transport, otherwise the
 * browser sends the request without the Supabase session header and the
 * page shows a 401 (Mission Control corpus footprint, 2026-09-17).
 */
describe("protected REST transport covers every admin-guarded mount", () => {
  const server_index = read("../../../server/_core/index.ts");
  const main_tsx = read("../main.tsx");
  // Read the allowlist from source: importing the module would instantiate the
  // Supabase client, which needs VITE_* env at load time.
  const lib_source = read("./protected-rest-auth.ts");
  const lib_block = lib_source.slice(
    lib_source.indexOf("const PROTECTED_REST_PREFIXES = ["),
    lib_source.indexOf("] as const;"),
  );
  const protectedRestPrefixes = Array.from(lib_block.matchAll(/"(\/api\/[^"]+)"/g), m => m[1]);

  const guarded_mounts = Array.from(
    server_index.matchAll(/app\.use\("(\/api\/[^"]+)",\s*require\w+/g),
    match => match[1],
  );

  it("finds the admin-guarded mounts in the server entrypoint", () => {
    expect(guarded_mounts).toContain("/api/corpus-footprint");
    expect(guarded_mounts.length).toBeGreaterThanOrEqual(4);
    expect(protectedRestPrefixes).toContain("/api/system");
  });

  it("allowlists each guarded mount in at least one client transport", () => {
    for (const mount of guarded_mounts) {
      const in_lib = protectedRestPrefixes.some(
        prefix => mount === prefix || mount.startsWith(`${prefix}/`),
      );
      const in_main =
        main_tsx.includes(`"${mount}"`) || main_tsx.includes(`"${mount}/"`);
      expect(in_lib || in_main, `${mount} is guarded server-side but never receives the session header`).toBe(true);
    }
  });
});
