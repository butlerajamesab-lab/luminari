/**
 * Cryptographic Snapshot Signing (Gate 9)
 *
 * Provides Ed25519 asymmetric key management, signing, and verification
 * for sealed corpus snapshots.
 *
 * Architecture:
 * - Single keypair per deployment environment (not per-tenant)
 * - Private key stored in SNAPSHOT_SIGNING_KEY env variable (PEM format)
 * - If no key is configured, a transient keypair is generated at startup
 *   (suitable for development; production must set the env variable)
 * - Public key exposed via API for offline verification
 * - Signatures cover: deterministic manifest hash of snapshot content
 *
 * Signing flow:
 * 1. Snapshot is sealed (status → 'sealed')
 * 2. Deterministic manifest hash is computed from snapshot metadata + document hashes
 * 3. Manifest hash is signed with Ed25519 private key
 * 4. Signature, algorithm, and public key fingerprint are stored on the snapshot row
 *
 * Verification flow:
 * 1. Recompute deterministic manifest hash from current snapshot data
 * 2. Verify Ed25519 signature against the public key
 * 3. Compare stored fingerprint against current public key fingerprint
 */

import { createHash, generateKeyPairSync, sign, verify, createPublicKey, createPrivateKey, KeyObject } from "crypto";
import { canonicalStringify, sha256 } from "./export-manifest";

// ─── Key Management ───

let _privateKey: KeyObject | null = null;
let _publicKey: KeyObject | null = null;
let _publicKeyPem: string = "";
let _publicKeyFingerprint: string = "";

/**
 * Normalize a PEM string that may have been mangled by environment variable storage.
 * Handles: missing newlines, concatenated headers, whitespace issues.
 */
function normalizePem(raw: string): string {
  // If it already has proper newlines and structure, return as-is
  const trimmed = raw.trim();
  if (trimmed.startsWith("-----BEGIN") && trimmed.includes("\n")) {
    // Quick validation: try to split and check structure
    const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length >= 3 && lines[0].startsWith("-----BEGIN") && lines[lines.length - 1].startsWith("-----END")) {
      return lines.join("\n") + "\n";
    }
  }

  // Extract the base64 body between PEM headers
  const beginMatch = trimmed.match(/-----BEGIN ([A-Z ]+)-----/);
  const endMatch = trimmed.match(/-----END ([A-Z ]+)-----/);
  if (!beginMatch || !endMatch) {
    throw new Error("[Gate 9] Invalid PEM format in SNAPSHOT_SIGNING_KEY: missing BEGIN/END headers");
  }

  const label = beginMatch[1];
  const beginHeader = `-----BEGIN ${label}-----`;
  const endHeader = `-----END ${label}-----`;

  // Strip headers and extract base64 content
  let body = trimmed
    .replace(beginHeader, "")
    .replace(endHeader, "")
    .replace(/\s/g, "");

  // If there are duplicate keys concatenated, take only the last one (most recent)
  // Ed25519 PKCS#8 private keys are exactly 48 bytes = 64 base64 chars
  if (body.length > 64) {
    // Take the last 64 chars as the valid key body
    body = body.slice(-64);
  }

  // Reconstruct proper PEM with 64-char line wrapping
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${beginHeader}\n${wrapped}\n${endHeader}\n`;
}

/**
 * Initialize the signing keypair.
 * - SNAPSHOT_SIGNING_KEY env must be set (PEM-encoded PKCS#8 Ed25519 private key).
 * - If not present, the server will fail fast at startup.
 *
 * This function is idempotent — subsequent calls return the cached keypair.
 */
export function initSigningKeys(): { publicKeyPem: string; fingerprint: string } {
  if (_privateKey && _publicKey) {
    return { publicKeyPem: _publicKeyPem, fingerprint: _publicKeyFingerprint };
  }

  const rawEnvKey = process.env.SNAPSHOT_SIGNING_KEY;
  if (!rawEnvKey) {
    throw new Error(
      "[Gate 9] FATAL: SNAPSHOT_SIGNING_KEY environment variable is not set. "
      + "The server cannot start without a stable Ed25519 signing key. "
      + "Generate one with: node -e \"const c=require('crypto');console.log(c.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}))\" "
      + "and set it in your environment or secrets manager."
    );
  }

  // Normalize PEM: env vars may strip newlines. Reconstruct proper PEM format.
  const envKey = normalizePem(rawEnvKey);

  // Import from environment (PEM-encoded PKCS#8 private key)
  _privateKey = createPrivateKey({
    key: envKey,
    format: "pem",
    type: "pkcs8",
  });
  _publicKey = createPublicKey(_privateKey);
  console.log("[Gate 9] Loaded signing key from SNAPSHOT_SIGNING_KEY environment variable");

  _publicKeyPem = _publicKey.export({ type: "spki", format: "pem" }) as string;
  const pubDer = _publicKey.export({ type: "spki", format: "der" });
  _publicKeyFingerprint = createHash("sha256").update(pubDer).digest("hex");

  return { publicKeyPem: _publicKeyPem, fingerprint: _publicKeyFingerprint };
}

/**
 * Get the public key in PEM format.
 */
export function getPublicKeyPem(): string {
  initSigningKeys();
  return _publicKeyPem;
}

/**
 * Get the SHA-256 fingerprint of the public key (DER-encoded SPKI).
 */
export function getPublicKeyFingerprint(): string {
  initSigningKeys();
  return _publicKeyFingerprint;
}

/**
 * Export the private key PEM (for testing/backup only — never expose via API).
 */
export function getPrivateKeyPemForTesting(): string {
  initSigningKeys();
  return _privateKey!.export({ type: "pkcs8", format: "pem" }) as string;
}

// ─── Deterministic Manifest Hash ───

/**
 * Compute the deterministic manifest hash for a snapshot.
 *
 * The hash covers:
 * - snapshotId
 * - snapshotVersion
 * - engineVersion
 * - documentIds (sorted)
 * - documentHashes (sorted by key)
 *
 * All fields are serialized using canonical JSON (sorted keys, no whitespace)
 * and then SHA-256 hashed.
 */
export interface SnapshotSigningPayload {
  snapshotId: number;
  snapshotVersion: number;
  engineVersion: string;
  documentIds: number[];
  documentHashes: Record<string, string>;
}

export function computeManifestHash(payload: SnapshotSigningPayload): string {
  // Normalize: sort documentIds, documentHashes keys are sorted by canonicalStringify
  const normalized = {
    snapshotId: payload.snapshotId,
    snapshotVersion: payload.snapshotVersion,
    engineVersion: payload.engineVersion,
    documentIds: [...payload.documentIds].sort((a, b) => a - b),
    documentHashes: payload.documentHashes, // canonicalStringify handles key sorting
  };
  return sha256(canonicalStringify(normalized));
}

// ─── Signing ───

/**
 * Sign a manifest hash with the Ed25519 private key.
 * Returns the signature as a hex-encoded string.
 */
export function signManifestHash(manifestHash: string): string {
  initSigningKeys();
  const data = Buffer.from(manifestHash, "utf-8");
  const signature = sign(null, data, _privateKey!);
  return signature.toString("hex");
}

/**
 * Sign a snapshot's manifest and return all signing metadata.
 *
 * This is the main entry point called during snapshot sealing.
 */
export function signSnapshot(payload: SnapshotSigningPayload): {
  manifestHash: string;
  signature: string;
  signatureAlgorithm: string;
  publicKeyFingerprint: string;
} {
  const manifestHash = computeManifestHash(payload);
  const signature = signManifestHash(manifestHash);
  const fingerprint = getPublicKeyFingerprint();

  return {
    manifestHash,
    signature,
    signatureAlgorithm: "Ed25519",
    publicKeyFingerprint: fingerprint,
  };
}

// ─── Verification ───

/**
 * Verify a snapshot signature.
 *
 * @param manifestHash - The recomputed manifest hash
 * @param signatureHex - The stored hex-encoded signature
 * @param publicKeyPem - The public key PEM to verify against (optional; uses current key if not provided)
 * @returns true if the signature is valid
 */
export function verifySignature(
  manifestHash: string,
  signatureHex: string,
  publicKeyPem?: string
): boolean {
  const pubKey = publicKeyPem
    ? createPublicKey({ key: publicKeyPem, format: "pem", type: "spki" })
    : (() => { initSigningKeys(); return _publicKey!; })();

  const data = Buffer.from(manifestHash, "utf-8");
  const signature = Buffer.from(signatureHex, "hex");

  return verify(null, data, pubKey, signature);
}

/**
 * Full verification of a snapshot: recompute manifest hash, verify signature,
 * and check fingerprint consistency.
 *
 * Returns a structured verification result.
 */
export interface VerificationResult {
  valid: boolean;
  manifestHashMatch: boolean;
  signatureValid: boolean;
  fingerprintMatch: boolean;
  recomputedManifestHash: string;
  storedSignature: string;
  currentFingerprint: string;
  storedFingerprint: string;
  details: string;
}

export function verifySnapshot(
  payload: SnapshotSigningPayload,
  storedSignature: string,
  storedFingerprint: string,
  storedAlgorithm: string
): VerificationResult {
  const currentFingerprint = getPublicKeyFingerprint();
  const recomputedHash = computeManifestHash(payload);
  const fingerprintMatch = currentFingerprint === storedFingerprint;
  let signatureValid = false;

  if (storedAlgorithm !== "Ed25519") {
    return {
      valid: false,
      manifestHashMatch: false,
      signatureValid: false,
      fingerprintMatch,
      recomputedManifestHash: recomputedHash,
      storedSignature,
      currentFingerprint,
      storedFingerprint,
      details: `Unsupported signature algorithm: ${storedAlgorithm}`,
    };
  }

  try {
    signatureValid = verifySignature(recomputedHash, storedSignature);
  } catch (err: any) {
    return {
      valid: false,
      manifestHashMatch: false,
      signatureValid: false,
      fingerprintMatch,
      recomputedManifestHash: recomputedHash,
      storedSignature,
      currentFingerprint,
      storedFingerprint,
      details: `Signature verification error: ${err.message}`,
    };
  }

  const valid = signatureValid && fingerprintMatch;
  const details = valid
    ? "Snapshot signature verified successfully. Manifest hash matches, signature is valid, and key fingerprint is consistent."
    : [
        !signatureValid && "Signature verification failed — data may have been tampered with.",
        !fingerprintMatch && `Key fingerprint mismatch — stored: ${storedFingerprint.substring(0, 16)}..., current: ${currentFingerprint.substring(0, 16)}...`,
      ].filter(Boolean).join(" ");

  return {
    valid,
    manifestHashMatch: signatureValid, // If signature verifies, the hash implicitly matches
    signatureValid,
    fingerprintMatch,
    recomputedManifestHash: recomputedHash,
    storedSignature,
    currentFingerprint,
    storedFingerprint,
    details,
  };
}

// ─── Reset (for testing only) ───

/**
 * Reset the cached keypair. Used only in tests to simulate key rotation.
 */
export function _resetKeysForTesting(): void {
  _privateKey = null;
  _publicKey = null;
  _publicKeyPem = "";
  _publicKeyFingerprint = "";
}
