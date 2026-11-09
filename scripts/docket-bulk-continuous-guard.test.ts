import { describe, expect, it } from "vitest";
import {
  DOCKET_ACTIVE_MARKER, DOCKET_DONE_MARKER, markerPresentFromHttpStatus, runOneArchiveGuarded,
  type DocketGuardStore
} from "./docket-bulk-continuous-guard";
import { readFileSync } from "node:fs";

function fakeStore(existing: string[] = []) {
  const markers = new Set(existing);
  const events: string[] = [];
  const store: DocketGuardStore = {
    async exists(path) { events.push("exists:" + path); return markers.has(path); },
    async create(path) {
      events.push("create:" + path);
      if (markers.has(path)) throw new Error("object_exists");
      markers.add(path);
    },
    async remove(path) {
      events.push("remove:" + path);
      if (!markers.delete(path)) throw new Error("not_found");
    },
  };
  return { store, events, markers };
}

describe("Docket one-archive durable stop latch", () => {
  it("classifies Supabase missing-object HEAD statuses 400 and 404 as absent", () => {
    expect(markerPresentFromHttpStatus(200)).toBe(true);
    expect(markerPresentFromHttpStatus(400)).toBe(false);
    expect(markerPresentFromHttpStatus(404)).toBe(false);
  });
  it("fails closed on invalid credentials, permissions and Storage outages", () => {
    for (const status of [0, 201, 301, 401, 403, 409, 429, 500, 502, 503]) {
      expect(() => markerPresentFromHttpStatus(status)).toThrow(
        "docket_continuous_marker_read_failed_HTTP_" + status
      );
    }
  });
  it("halts every subsequent run on a stranded guard without starting an import", async () => {
    const f = fakeStore([DOCKET_ACTIVE_MARKER]);
    let calls = 0;
    expect(await runOneArchiveGuarded(f.store, async () => { calls++; return {complete:false}; })).toBe("paused");
    expect(calls).toBe(0);
    expect(f.events).toEqual(["exists:" + DOCKET_ACTIVE_MARKER]);
  });
  it("does nothing after all 60 sources are recorded complete", async () => {
    const f = fakeStore([DOCKET_DONE_MARKER]);
    let calls = 0;
    expect(await runOneArchiveGuarded(f.store, async () => { calls++; return {complete:false}; })).toBe("complete");
    expect(calls).toBe(0);
  });
  it("creates marker BEFORE import and clears only after verified success", async () => {
    const f = fakeStore();
    expect(await runOneArchiveGuarded(f.store, async () => {
      expect(f.markers.has(DOCKET_ACTIVE_MARKER)).toBe(true);
      expect(f.markers.has(DOCKET_DONE_MARKER)).toBe(false);
      return {complete:false};
    })).toBe("processed");
    expect(f.events.filter(x => x.startsWith("create:"))).toEqual(["create:" + DOCKET_ACTIVE_MARKER]);
    expect(f.markers.size).toBe(0);
  });
  it("never retries after failing importer, leaving the marker persistent", async () => {
    const f = fakeStore();
    await expect(runOneArchiveGuarded(f.store, async () => {
      throw new Error("canonical_member_failure");
    })).rejects.toThrow("canonical_member_failure");
    expect(f.markers.has(DOCKET_ACTIVE_MARKER)).toBe(true);
    let calls = 0;
    expect(await runOneArchiveGuarded(f.store, async () => { calls++; return {complete:false}; })).toBe("paused");
    expect(calls).toBe(0);
  });
  it("stops on marker creation collision before running importer", async () => {
    const f = fakeStore();
    f.store.create = async () => { throw new Error("already_present"); };
    let calls = 0;
    await expect(runOneArchiveGuarded(f.store, async () => { calls++; return {complete:false}; })).rejects.toThrow("already_present");
    expect(calls).toBe(0);
  });
  it("records all-done marker before removing final active marker", async () => {
    const f = fakeStore();
    expect(await runOneArchiveGuarded(f.store, async () => ({complete:true}))).toBe("complete");
    expect(f.markers.has(DOCKET_DONE_MARKER)).toBe(true);
    expect(f.markers.has(DOCKET_ACTIVE_MARKER)).toBe(false);
    const createdDone = f.events.indexOf("create:" + DOCKET_DONE_MARKER);
    const released = f.events.indexOf("remove:" + DOCKET_ACTIVE_MARKER);
    expect(createdDone).toBeLessThan(released);
  });
  it("continues to block after a failure while releasing the marker", async () => {
    const f = fakeStore();
    f.store.remove = async () => { throw new Error("storage_unavailable"); };
    await expect(runOneArchiveGuarded(f.store, async () => ({complete:false}))).rejects.toThrow("storage_unavailable");
    expect(f.markers.has(DOCKET_ACTIVE_MARKER)).toBe(true);
  });
  it("only allows canonical source runner in apply mode and one-archive bound", () => {
    const runner = readFileSync("scripts/docket-bulk-storage-continuous.ts", "utf8");
    expect(runner).toContain("scripts/docket-bulk-storage-runner.ts");
    expect(runner).toContain('"--apply", "--acknowledge-docket-triggers", "--max-archives=1"');
    expect(runner).toContain("DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256");
    expect(runner).toContain('LEGISCAN_API_KEY: ""');
    expect(runner).not.toMatch(/(?:triggerDeploy|cron\.schedule|run_docket_bill_activation_queue_cycle)/);
  });
});
