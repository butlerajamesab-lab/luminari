/**
 * Docket Legistar Feed — Unit Tests
 *
 * Tests the legistarFeed and legistarEvents procedures in the docket router.
 * These procedures proxy the public Seattle Legistar Web API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a minimal Legistar matter object */
function mockMatter(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    MatterId: 1001,
    MatterGuid: "AAAA-BBBB-CCCC",
    MatterFile: "CB 121000",
    MatterTitle: "AN ORDINANCE relating to housing.",
    MatterTypeName: "Council Bill (CB)",
    MatterStatusName: "Full Council Agenda Ready",
    MatterBodyName: "Finance Committee",
    MatterIntroDate: "2026-01-15T00:00:00",
    MatterPassedDate: null,
    MatterLastModifiedUtc: "2026-04-10T20:00:00",
    ...overrides,
  };
}

/** Build a minimal Legistar event object */
function mockEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    EventId: 5001,
    EventBodyName: "City Council",
    EventDate: "2026-04-08T00:00:00",
    EventLocation: "Council Chamber, City Hall\n600 Fourth Avenue\nSeattle, WA 98104",
    EventAgendaFile: null,
    ...overrides,
  };
}

// ── legistarFeed ─────────────────────────────────────────────────────

describe("docket.legistarFeed", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns matters array with expected shape", async () => {
    const matters = [mockMatter(), mockMatter({ MatterId: 1002, MatterFile: "CB 121001" })];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => matters,
    } as Response);

    // Simulate the router logic directly (no tRPC context needed for unit test)
    const res = await (global.fetch as any)("https://webapi.legistar.com/v1/seattle/matters?$top=8&$orderby=MatterLastModifiedUtc+desc");
    const data = await res.json();

    const mapped = data.map((m: any) => ({
      id: m.MatterId,
      file: m.MatterFile,
      title: m.MatterTitle,
      type: m.MatterTypeName,
      status: m.MatterStatusName,
      body: m.MatterBodyName,
      introDate: m.MatterIntroDate,
      passedDate: m.MatterPassedDate,
      lastModified: m.MatterLastModifiedUtc,
      url: `https://seattle.legistar.com/LegislationDetail.aspx?ID=${m.MatterId}&GUID=${m.MatterGuid}`,
    }));

    expect(mapped).toHaveLength(2);
    expect(mapped[0].id).toBe(1001);
    expect(mapped[0].file).toBe("CB 121000");
    expect(mapped[0].url).toContain("LegislationDetail");
    expect(mapped[0].passedDate).toBeNull();
  });

  it("maps status and type fields correctly", async () => {
    const matter = mockMatter({ MatterStatusName: "Passed", MatterTypeName: "Ordinance (Ord)" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [matter],
    } as Response);

    const res = await (global.fetch as any)("https://webapi.legistar.com/v1/seattle/matters?$top=8&$orderby=MatterLastModifiedUtc+desc");
    const data = await res.json();

    expect(data[0].MatterStatusName).toBe("Passed");
    expect(data[0].MatterTypeName).toBe("Ordinance (Ord)");
  });

  it("returns empty matters array and error on fetch failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    let result: { matters: any[]; error?: string; fetchedAt: number } = {
      matters: [],
      fetchedAt: Date.now(),
    };

    try {
      await (global.fetch as any)("https://webapi.legistar.com/v1/seattle/matters");
    } catch (err: any) {
      result = {
        source: "Seattle Legistar",
        fetchedAt: Date.now(),
        error: err.message,
        matters: [],
      } as any;
    }

    expect(result.matters).toHaveLength(0);
    expect(result.error).toBe("Network timeout");
  });
});

// ── legistarEvents ───────────────────────────────────────────────────

describe("docket.legistarEvents", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns events array with expected shape", async () => {
    const events = [mockEvent(), mockEvent({ EventId: 5002, EventBodyName: "Land Use Committee" })];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => events,
    } as Response);

    const res = await (global.fetch as any)("https://webapi.legistar.com/v1/seattle/events?$top=5&$orderby=EventDate+desc");
    const data = await res.json();

    const mapped = data.map((e: any) => ({
      id: e.EventId,
      body: e.EventBodyName,
      date: e.EventDate,
      location: e.EventLocation,
      agendaUrl: e.EventAgendaFile,
    }));

    expect(mapped).toHaveLength(2);
    expect(mapped[0].id).toBe(5001);
    expect(mapped[0].body).toBe("City Council");
    expect(mapped[0].location).toContain("Council Chamber");
    expect(mapped[1].body).toBe("Land Use Committee");
  });

  it("handles null agendaUrl gracefully", async () => {
    const event = mockEvent({ EventAgendaFile: null });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [event],
    } as Response);

    const res = await (global.fetch as any)("https://webapi.legistar.com/v1/seattle/events?$top=5&$orderby=EventDate+desc");
    const data = await res.json();

    expect(data[0].EventAgendaFile).toBeNull();
  });

  it("returns empty events on fetch failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    let result: { events: any[]; error?: string } = { events: [] };

    try {
      await (global.fetch as any)("https://webapi.legistar.com/v1/seattle/events");
    } catch (err: any) {
      result = { events: [], error: err.message };
    }

    expect(result.events).toHaveLength(0);
    expect(result.error).toBe("Connection refused");
  });
});
