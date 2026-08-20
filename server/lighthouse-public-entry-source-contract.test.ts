import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const app = read("../client/src/App.tsx");
const login = read("../client/src/pages/Login.tsx");
const client_const = read("../client/src/const.ts");
const case_context = read("../client/src/contexts/CaseContext.tsx");

describe("Lighthouse public entry source contract", () => {
  it("keeps Lighthouse directly public and bridges the default login route to it", () => {
    expect(app).toContain('<Route path="/lighthouse" component={Lighthouse} />');
    expect(login).toContain('const PUBLIC_ENTRY_PATH = "/lighthouse";');
    expect(login).toContain('get("interactive") === "1"');
    expect(login).toContain('navigate(PUBLIC_ENTRY_PATH, { replace: true });');
    expect(login).toContain('if (!interactiveLogin) return null;');
  });

  it("preserves explicit credential login for deliberate sign-in actions", () => {
    expect(client_const).toContain('new URLSearchParams({ interactive: "1" })');
    expect(client_const).toContain('return `/login?${params.toString()}`;');
    expect(login).toContain('supabase.auth.signInWithPassword');
    expect(login).toContain('navigate(getSafeRedirectPath(), { replace: true });');
  });

  it("does not turn anonymous browsing into anonymous case access", () => {
    expect(case_context).toContain('enabled: isAuthenticated');
    expect(case_context).toContain('/lighthouse, /civic-map, /viewfinder');
  });
});
