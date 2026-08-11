/**
 * Cryptographic Snapshot Signing (Gate 9)
 *
 * Provides Ed25519 asymmetric key management, signing, and verification
 * for sealed corpus snapshots.
 */

import { createHash, sign, verify, createPublicKey, createPrivateKey, KeyObject } from "crypto";
import { canonicalStringify, sha256 } from "./export-manifest";

let _privateKey: KeyObject | null = null;
let _publicKey: KeyObject | null = null;
let _publicKeyPem: string = "";
let _publicKeyFingerprint: string = "";

function normalizePem(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("-----BEGIN") && trimmed.includes("\n")) {
    const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length >= 3 && lines[0].startsWith("-----BEGIN") && lines[lines.length - 1].startsWith("-----END")) {
      return lines.join("\n") + "\n";
    }
  }

  const beginMatch = trimmed.match(/-----BEGIN ([A-Z ]+)-----/);
  const endMatch = trimmed.match(/-----END ([A-Z ]+)-----/);
  if (!beginMatch || !endMatch) {
    throw new Error("[Gate 9] Invalid PEM format in SNAPSHOT_SIGNING_KEY: missing BEGIN/END headers");
  }

  const label = beginMatch[1];
  const beginHeader = `-----BEGIN ${label}-----`;
  const endHeader = `-----END ${label}-----`;
  let body = trimmed
    .replace(beginHeader, "")
    .replace(endHeader, "")
    .replace(/\s/g, "");

  if (body.length > 64) body = body.slice(-64);
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `${beginHeader}\n${wrapped}\n${endHeader}\n`;
}

export function initSigningKeys(): { publicKeyPem: string; fingerprint: string } {
  if (_privateKey && _publicKey) {
    return { publicKeyPem: _publicKeyPem, fingerprint: _publicKeyFingerprint };
  }

  const rawEnvKey = process.env.SNAPSHOT_SIGNING_KEY;
  if (!rawEnvKey) {
    throw new Error(
      "[Gate 9] FATAL: SNAPSHOT_SIGNING_KEY environment variable is not set. " +
      "The server cannot start without a stable Ed25519 signing key. " +
      "Generate one with: node -e \"const c=require('crypto');console.log(c.generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}))\" " +
      "and set it in your environment or secrets manager."
    );
  }

  const envKey = normalizePem(rawEnvKey);
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

export function getPublicKeyPem(): string {
  initSigningKeys();
  return _publicKeyPem;
}

export function getPublicKeyFingerprint(): string {
  initSigningKeys();
  return _publicKeyFingerprint;
}

export function getPrivateKeyPemForTesting(): string {
  initSigningKeys();
  return _privateKey!.export({ type: "pkcs8", format: "pem" }) as string;
}

export interface SnapshotSigningPayload {
  snapshotId: number;
  snapshotVersion: number;
  engineVersion: string;
  documentIds: number[];
  documentHashes: Record<string, string>;
}

/**
 * Governance snapshots historically used the generic snapshot signer with a
 * chain-root payload instead of document identities. Keep that historical
 * calling contract explicit and deterministic rather than silently defaulting
 * arbitrary malformed snapshot payloads.
 */
export type GovernanceChainSigningPayload = {
  snapshotId: `gov-snapshot-${number}`;
  documentHashes: { chainRoot: string };
};

function normalizeSigningPayload(payload: SnapshotSigningPayload | GovernanceChainSigningPayload): SnapshotSigningPayload {
  if (
    typeof payload.snapshotId === "number"
    && Number.isSafeInteger(payload.snapshotId)
    && payload.snapshotId >= 0
    && "snapshotVersion" in payload
    && Number.isSafeInteger(payload.snapshotVersion)
    && payload.snapshotVersion >= 1
    && "engineVersion" in payload
    && typeof payload.engineVersion === "string"
    && payload.engineVersion.trim().length > 0
    && "documentIds" in payload
    && Array.isArray(payload.documentIds)
    && payload.documentIds.every(id => Number.isSafeInteger(id) && id >= 0)
    && payload.documentHashes
    && typeof payload.documentHashes === "object"
  ) {
    return payload;
  }

  if (
    typeof payload.snapshotId === "string"
    && /^gov-snapshot-[1-9][0-9]*$/.test(payload.snapshotId)
    && payload.documentHashes
    && typeof payload.documentHashes.chainRoot === "string"
    && /^[0-9a-f]{64}$/.test(payload.documentHashes.chainRoot)
  ) {
    const sequence = Number(payload.snapshotId.slice("gov-snapshot-".length));
    if (!Number.isSafeInteger(sequence) || sequence <= 0) {
      throw new Error("[Gate 9] Governance snapshot sequence is outside the deterministic signing range");
    }
    return {
      snapshotId: sequence,
      snapshotVersion: 1,
      engineVersion: "governance-log-chain-v1",
      documentIds: [],
      documentHashes: { chainRoot: payload.documentHashes.chainRoot },
    };
  }

  throw new Error("[Gate 9] Snapshot signing payload does not satisfy the canonical or governance-chain contract");
}

export function computeManifestHash(payload: SnapshotSigningPayload | GovernanceChainSigningPayload): string {
  const canonicalPayload = normalizeSigningPayload(payload);
  const normalized = {
    snapshotId: canonicalPayload.snapshotId,
    snapshotVersion: canonicalPayload.snapshotVersion,
    engineVersion: canonicalPayload.engineVersion,
    documentIds: [...canonicalPayload.documentIds].sort((a, b) => a - b),
    documentHashes: canonicalPayload.documentHashes,
  };
  return sha256(canonicalStringify(normalized));
}

export function signManifestHash(manifestHash: string): string {
  initSigningKeys();
  const data = Buffer.from(manifestHash, "utf-8");
  const signature = sign(null, data, _privateKey!);
  return signature.toString("hex");
}

export function signSnapshot(payload: SnapshotSigningPayload | GovernanceChainSigningPayload): {
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
  payload: SnapshotSigningPayload | GovernanceChainSigningPayload,
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
    manifestHashMatch: signatureValid,
    signatureValid,
    fingerprintMatch,
    recomputedManifestHash: recomputedHash,
    storedSignature,
    currentFingerprint,
    storedFingerprint,
    details,
  };
}

export function _resetKeysForTesting(): void {
  _privateKey = null;
  _publicKey = null;
  _publicKeyPem = "";
  _publicKeyFingerprint = "";
}
