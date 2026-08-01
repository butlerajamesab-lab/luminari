import { createHash } from "node:crypto";
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

type PayloadManifest = {
  format: string;
  compact_json_sha256: string;
  parts: Array<{
    part: number;
    filename: string;
    length: number;
    sha256: string;
  }>;
};

const dataDirectory = path.resolve(process.cwd(), "client/public/data");
const manifest = JSON.parse(
  fs.readFileSync(path.join(dataDirectory, "prism-v2-batch.manifest.json"), "utf8"),
) as PayloadManifest;
const segmentContents = manifest.parts.map((part) =>
  fs.readFileSync(path.join(dataDirectory, part.filename), "utf8"),
);
const encodedBatch = segmentContents.map((content) => content.trim()).join("");
const compactJson = gunzipSync(Buffer.from(encodedBatch, "base64")).toString("utf8");
const batch = JSON.parse(compactJson) as PrismBatch;
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

describe("Prism V2 frontend data contract", () => {
  it("verifies every static payload segment against the manifest", () => {
    expect(manifest.format).toBe("gzip+base64-segments");
    expect(manifest.parts).toHaveLength(10);
    manifest.parts.forEach((part, index) => {
      expect(segmentContents[index].length).toBe(part.length);
      expect(sha256(segmentContents[index])).toBe(part.sha256);
    });
    expect(sha256(compactJson)).toBe(manifest.compact_json_sha256);
  });

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
