import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  buildCorrelationGraph,
  computeAggregates,
  computeHotspots,
  correlationsForInstance,
  normalizeJurisdictionLevel,
  type PrismBatch,
} from "./prism-v2-data";

const encodedBatch = Array.from({ length: 10 }, (_, part) =>
  fs.readFileSync(
    path.resolve(process.cwd(), `client/public/data/prism-v2-batch.${part}.b64`),
    "utf8",
  ).trim(),
).join("");

const batch = JSON.parse(
  gunzipSync(Buffer.from(encodedBatch, "base64")).toString("utf8"),
) as PrismBatch;

describe("Prism V2 frontend data contract", () => {
  it("loads the complete 56-record batch", () => {
    expect(batch.schema_version).toBe("2.0");
    expect(batch.instances).toHaveLength(56);
    expect(computeAggregates(batch.instances).totalInstances).toBe(56);
  });

  it("reproduces the reference deterministic graph", () => {
    const forward = buildCorrelationGraph(batch.instances);
    const reverse = buildCorrelationGraph([...batch.instances].reverse());

    expect(forward).toEqual(reverse);
    expect(forward).toHaveLength(365);
    expect(forward.every((edge) => edge.source < edge.target)).toBe(true);
  });

  it("reproduces the 17 jurisdiction-system hotspots", () => {
    const hotspots = computeHotspots(batch.instances);
    expect(hotspots).toHaveLength(17);
    expect(hotspots.every((hotspot) => hotspot.instanceCount > 0)).toBe(true);
  });

  it("keeps jurisdiction normalization and record matches deterministic", () => {
    expect(normalizeJurisdictionLevel("Federal")).toBe("federal");
    expect(normalizeJurisdictionLevel("Washington")).toBe("state");

    const selected = batch.instances.find(
      (instance) => instance.record_id === "PI-0035CO",
    );
    expect(selected).toBeDefined();
    expect(correlationsForInstance(selected!, batch.instances)).toHaveLength(13);
  });
});
