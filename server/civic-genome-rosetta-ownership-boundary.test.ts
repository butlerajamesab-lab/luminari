import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration_root = path.resolve(process.cwd(), "supabase/migrations");

const forbidden_rosetta_ownership = [
  /create\s+or\s+replace\s+function\s+public\.run_rosetta_v3_extraction\b/i,
  /create\s+(?:table\s+if\s+not\s+exists\s+|table\s+)public\.rosetta_structural_repair_queue\b/i,
  /create\s+(?:table\s+if\s+not\s+exists\s+|table\s+)public\.rosetta_canonical_clause\b/i,
  /create\s+(?:table\s+if\s+not\s+exists\s+|table\s+)public\.rosetta_clause_occurrence\b/i,
  /create\s+or\s+replace\s+function\s+public\.rosetta_reconcile_structural_correctness\b/i,
  /create\s+or\s+replace\s+function\s+public\.rosetta_v\d+_.*(?:extract|reconcil|canonical_output)\b/i,
];

describe("Civic Genome / Rosetta ownership boundary", () => {
  it("does not define Rosetta's canonical decomposition engine or reconciliation schema", () => {
    const violations: string[] = [];
    for (const name of fs.readdirSync(migration_root).filter(name => name.endsWith(".sql"))) {
      const sql = fs.readFileSync(path.join(migration_root, name), "utf8");
      for (const pattern of forbidden_rosetta_ownership) {
        if (pattern.test(sql)) {
          violations.push(`${name}: ${pattern.source}`);
        }
      }
    }

    expect(
      violations,
      "Rosetta owns decomposition, canonical Rosetta tables, reconciliation, validation, and publication semantics. Civic Genome may invoke/read Rosetta contracts but must not migrate Rosetta's engine.",
    ).toEqual([]);
  });
});
