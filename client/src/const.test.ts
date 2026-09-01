import { afterEach, describe, expect, it, vi } from "vitest";
import { getLoginUrl } from "./const";

describe("getLoginUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the current Mission Control path when no return path is supplied", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/mission-control/full",
        search: "?tab=health",
        hash: "#queues",
      },
    });

    expect(getLoginUrl()).toBe(
      "/login?interactive=1&redirect=%2Fmission-control%2Ffull%3Ftab%3Dhealth%23queues",
    );
  });

  it("accepts an explicit internal return path", () => {
    expect(getLoginUrl("/mission-control")).toBe(
      "/login?interactive=1&redirect=%2Fmission-control",
    );
  });

  it("rejects protocol-relative return paths", () => {
    expect(getLoginUrl("//example.com/steal-session")).toBe(
      "/login?interactive=1",
    );
  });
});
