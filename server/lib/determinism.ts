/**
 * Determinism helpers: ordering, stable sort, canonical serialization
 * Ensures reproducible interpretation across identical snapshots
 */

/**
 * Stable sort comparator for deterministic ordering
 */
export function stableSort<T>(
  array: T[],
  compareFn: (a: T, b: T) => number
): T[] {
  return array
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const cmp = compareFn(a.item, b.item);
      return cmp !== 0 ? cmp : a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * Canonical serialization for hashing
 */
export function canonicalSerialize(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return "null";
  }
  
  if (typeof obj === "string") {
    return JSON.stringify(obj);
  }
  
  if (typeof obj === "number" || typeof obj === "boolean") {
    return String(obj);
  }
  
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalSerialize).join(",")}]`;
  }
  
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map(
      (k) => `"${k}":${canonicalSerialize((obj as Record<string, unknown>)[k])}`
    );
    return `{${pairs.join(",")}}`;
  }
  
  return String(obj);
}

/**
 * Compute canonical hash for determinism verification
 */
export function computeCanonicalHash(obj: unknown): string {
  const crypto = require("crypto");
  const serialized = canonicalSerialize(obj);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Sort array of objects by multiple fields
 */
export function sortByFields<T extends Record<string, unknown>>(
  array: T[],
  fields: (keyof T)[]
): T[] {
  return stableSort(array, (a, b) => {
    for (const field of fields) {
      const aVal = a[field];
      const bVal = b[field];
      
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
    }
    return 0;
  });
}

/**
 * Verify determinism: same inputs should produce same output
 */
export function verifyDeterminism(
  input1: unknown,
  output1: unknown,
  input2: unknown,
  output2: unknown
): boolean {
  const hash1 = computeCanonicalHash({ input: input1, output: output1 });
  const hash2 = computeCanonicalHash({ input: input2, output: output2 });
  
  return hash1 === hash2;
}
