import { renderToStaticMarkup as render_markup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({ path: "/civic-map" }));

vi.mock("wouter", async () => {
  const React = await import("react");
  return {
    useLocation: () => [ui.path, () => {}],
    Link: ({ href, children }: { href: string; children: unknown }) =>
      React.createElement("a", { href }, children as React.ReactNode),
  };
});

import { REGISTERED_CLIENT_ROUTE_PATTERNS } from "@shared/client-route-registry";
import { STATION_LINKS, StationNav } from "./station-nav";

const registered_routes = new Set<string>(
  REGISTERED_CLIENT_ROUTE_PATTERNS as readonly string[],
);

describe("STATION_LINKS", () => {
  it("points every station at a registered client route", () => {
    for (const link of STATION_LINKS) {
      expect(registered_routes.has(link.href), `${link.label} (${link.href})`).toBe(true);
    }
  });

  it("includes Find an Office and Legislators on the Community Board", () => {
    const byHref = new Map(STATION_LINKS.map((link) => [link.href, link]));
    expect(byHref.get("/find-an-office")?.label).toBe("Find an Office");
    expect(byHref.get("/find-an-office")?.station).toBe("Community Board");
    expect(byHref.get("/legislators")?.label).toBe("Legislators");
    expect(byHref.get("/legislators")?.station).toBe("Community Board");
  });

  it("has no duplicate station hrefs", () => {
    expect(new Set(STATION_LINKS.map((link) => link.href)).size).toBe(STATION_LINKS.length);
  });
});

describe("StationNav", () => {
  beforeEach(() => {
    ui.path = "/civic-map";
  });

  it("renders a link for every station", () => {
    const html = render_markup(<StationNav />);
    for (const link of STATION_LINKS) {
      expect(html).toContain(`href="${link.href}"`);
      expect(html).toContain(link.label);
    }
    expect(html).toContain("Workshop Floor navigation");
    expect(html).toContain("Pick a station. Move freely. Every station connects to the others.");
  });

  it("marks the current station aria-current with the active style", () => {
    const html = render_markup(<StationNav />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const currentIndex = html.indexOf('aria-current="page"');
    const hrefIndex = html.lastIndexOf('href="', currentIndex);
    expect(html.slice(hrefIndex, hrefIndex + 24)).toContain('href="/civic-map"');
    expect(html.slice(currentIndex, currentIndex + 220)).toContain("border-primary/60");
  });

  it("marks nothing current on a page that is not itself a station", () => {
    ui.path = "/benefits";
    const html = render_markup(<StationNav />);
    expect(html).not.toContain('aria-current="page"');
  });
});
