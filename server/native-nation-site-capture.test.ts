import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  INSERT_CAPTURE_SQL,
  NEXT_NATION_SQL,
  normalize_site_url,
  parse_robots,
  robots_allows,
  select_linked_pages,
} from "./native-nation-site-capture";

const migration = readFileSync(new URL(
  "../supabase/migrations/20261124110000_native_nation_site_capture_v1.sql",
  import.meta.url,
), "utf8");
let database: PGlite;

beforeAll(async () => {
  database = new PGlite();
  // Two real BIA directory rows as stored in public.tribal_leaders on
  // 2026-10-28: Agdaagux (scheme'd URL) and Akiak (scheme-less URL).
  await database.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.tribal_leaders (
      member_key text primary key, tribe_full_name text, website_url text, fetched_date text
    );
    insert into public.tribal_leaders values
      ('2f4a48ba-eb3b-493a-ab0d-4975d52360b9', 'Agdaagux Tribe of King Cove', 'https://agdaagux.com/', '2026-10-28'),
      ('akiak', 'Akiak Native Community', 'www.akiaknativecommunity.com', '2026-10-28');
  `);
  await database.exec(migration);
  await database.exec(migration);
});

afterAll(async () => {
  await database.close();
});

describe("native nation registry", () => {
  it("holds recognized and not-recognized nations in one list", async () => {
    const rows = (await database.query<{ federal_status: string; n: number }>(`
      select federal_status, count(*)::int as n from public.native_nation_registry_v1
      group by 1 order by 1
    `)).rows;
    expect(rows).toEqual([
      { federal_status: "federally_recognized", n: 2 },
      { federal_status: "not_federally_recognized", n: 3 },
    ]);
  });

  it("walks nations alphabetically and skips one captured within 30 days", async () => {
    const first = (await database.query<{ nation_key: string }>(NEXT_NATION_SQL)).rows[0];
    expect(first.nation_key).toBe("bia:2f4a48ba-eb3b-493a-ab0d-4975d52360b9");
    await database.query(INSERT_CAPTURE_SQL, [
      first.nation_key, "https://agdaagux.com/", "https://agdaagux.com/", "home", null,
      200, "text/html", null, null, null, true, null,
    ]);
    const second = (await database.query<{ nation_key: string }>(NEXT_NATION_SQL)).rows[0];
    expect(second.nation_key).toBe("bia:akiak");
  });
});

describe("capture helpers", () => {
  it("normalizes the directory's real website values", () => {
    expect(normalize_site_url("www.akiaknativecommunity.com")).toBe("https://www.akiaknativecommunity.com/");
    expect(normalize_site_url("https://www.duwamishtribe.org")).toBe("https://www.duwamishtribe.org/");
    expect(normalize_site_url("  ")).toBeNull();
  });

  it("honors robots.txt: longest match wins, our group beats *", () => {
    const rules = parse_robots([
      "User-agent: *",
      "Disallow: /wp-admin/",
      "Allow: /wp-admin/admin-ajax.php",
      "",
      "User-agent: LuminariNativeNationsCapture",
      "Disallow: /members/",
    ].join("\n"));
    expect(robots_allows(rules, "/members/roll")).toBe(false);
    expect(robots_allows(rules, "/wp-admin/")).toBe(true);
    expect(robots_allows(parse_robots("User-agent: *\nDisallow: /wp-admin/"), "/wp-admin/x")).toBe(false);
    expect(robots_allows(parse_robots("User-agent: *\nDisallow: /"), "/history")).toBe(false);
  });

  it("keeps only same-site links that name the nation's own account or asks", () => {
    // Paths are the Duwamish pages the Recognition Atlas source packet cites.
    const html = [
      '<a href="/history">History</a>',
      '<a href="/federal-recognition">Federal Recognition</a>',
      '<a href="/stand-with-the-duwamish">Stand with the Duwamish</a>',
      '<a href="https://www.duwamishtribe.org/history#top">History</a>',
      '<a href="https://www.facebook.com/duwamishtribe">About</a>',
      '<a href="/visit-longhouse">Visit</a>',
    ].join("");
    expect(select_linked_pages(html, "https://www.duwamishtribe.org/").map(link => link.url)).toEqual([
      "https://www.duwamishtribe.org/history",
      "https://www.duwamishtribe.org/federal-recognition",
      "https://www.duwamishtribe.org/stand-with-the-duwamish",
    ]);
  });
});
