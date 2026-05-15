#!/usr/bin/env node
/**
 * Luminari Governance Chain Verifier
 * 
 * Usage:
 *   node verify.js governance-log.jsonl
 * 
 * Reads a JSONL export of the governance log and verifies:
 * 1. Each entry_hash matches the SHA-256 of its canonical payload
 * 2. Each previous_hash matches the prior entry's entry_hash
 * 3. Genesis entry has previous_hash of 64 zeros
 * 
 * Output:
 *   VALID — if the entire chain is intact
 *   BROKEN at seq_no X — if any entry fails verification
 */
const crypto = require("crypto");
const fs = require("fs");

// Canonical JSON stringify — recursive key sorting
function canonicalStringify(obj) {
  return JSON.stringify(obj, (_key, value) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const sorted = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = value[k];
      }
      return sorted;
    }
    return value;
  });
}

// Compute entry hash — must match backend exactly
function computeEntryHash(entry) {
  const canonical = canonicalStringify({
    actorHash: entry.actor_hash,
    actorRole: entry.actor_role,
    component: entry.component,
    createdAt: entry.created_at,
    eventType: entry.event_type,
    newState: typeof entry.new_state === "object" ? canonicalStringify(entry.new_state) : entry.new_state,
    previousHash: entry.previous_hash,
    previousState: entry.previous_state === null ? null : (typeof entry.previous_state === "object" ? canonicalStringify(entry.previous_state) : entry.previous_state),
    rationale: entry.rationale,
    scope: entry.scope,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

const GENESIS_HASH = "0".repeat(64);

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node verify.js <governance-log.jsonl>");
    process.exit(1);
  }

  const content = fs.readFileSync(file, "utf-8").trim();
  if (!content) {
    console.log("VALID (empty log)");
    process.exit(0);
  }

  const lines = content.split("\n");
  const entries = lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.error(`BROKEN — parse error at line ${i + 1}: ${e.message}`);
      process.exit(1);
    }
  });

  // Sort by seq_no ascending
  entries.sort((a, b) => a.seq_no - b.seq_no);

  let lastHash = GENESIS_HASH;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Verify previous_hash linkage
    if (entry.previous_hash !== lastHash) {
      console.log(`BROKEN at seq_no ${entry.seq_no} — previous_hash mismatch`);
      console.log(`  expected: ${lastHash}`);
      console.log(`  actual:   ${entry.previous_hash}`);
      process.exit(1);
    }

    // Recompute and verify entry_hash
    const recomputed = computeEntryHash(entry);
    if (recomputed !== entry.entry_hash) {
      console.log(`BROKEN at seq_no ${entry.seq_no} — entry_hash mismatch`);
      console.log(`  expected: ${recomputed}`);
      console.log(`  actual:   ${entry.entry_hash}`);
      process.exit(1);
    }

    lastHash = entry.entry_hash;
  }

  console.log(`VALID — ${entries.length} entries verified`);
  process.exit(0);
}

main();
