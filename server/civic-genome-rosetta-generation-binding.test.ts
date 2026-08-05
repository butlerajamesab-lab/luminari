import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "supabase");
const bridge = readFileSync(
  join(root, "migrations", "20260805194900_civic_genome_pgcrypto_digest_bridge.sql"),
  "utf8",
);
const migration = readFileSync(
  join(root, "migrations", "20260805195000_civic_genome_rosetta_generation_binding.sql"),
  "utf8",
);
const verification = readFileSync(
  join(root, "verification", "20260805195000_civic_genome_rosetta_generation_binding.verify.sql"),
  "utf8",
);

describe("Civic Genome Rosetta generation binding", () => {
  it("bridges deterministic digest calls without changing pgcrypto output", () => {
    expect(bridge).toContain("select extensions.digest(p_value, p_algorithm)");
    expect(bridge).toContain("immutable");
    expect(bridge).not.toMatch(/\bdelete\s+from\b/i);
    expect(bridge).not.toMatch(/\btruncate\b/i);
  });

  it("separates stable source identity from immutable Rosetta generations", () => {
    expect(migration).toContain("civic_genome_rosetta_generation_binding");
    expect(migration).toContain("generation_fingerprint");
    expect(migration).toContain("rosetta_source_identity_binding_changed");
    expect(migration).toContain("latest compatibility mirror");
    expect(migration).toContain("on conflict (source_document_id, generation_fingerprint) do nothing");
  });

  it("preserves history and rejects mutation", () => {
    expect(migration).toContain("civic_genome_rosetta_generation_binding_is_immutable");
    expect(migration).toContain("before update or delete");
    expect(migration).not.toMatch(/drop\s+table\s+public\.civic_genome_rosetta_generation_binding/i);
    expect(migration).not.toMatch(/truncate\s+public\.civic_genome_rosetta_generation_binding/i);
  });

  it("ships executable checks for replay, identity drift, and immutability", () => {
    expect(verification).toContain("Exact Rosetta generation replay duplicated history");
    expect(verification).toContain("Rosetta source-identity drift was accepted");
    expect(verification).toContain("Rosetta generation history mutation was accepted");
  });
});
