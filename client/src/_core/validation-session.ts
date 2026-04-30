/**
 * Compatibility shim for the missing original validation-session client module.
 *
 * This file exists only to satisfy the existing import in `client/src/main.tsx`.
 * It does not perform, fake, or imply backend validation. The original source
 * file was not present in the supplied manifests or file index.
 */

export type ValidationSessionShimResult = {
  kind: "compatibility-shim";
  initialized: boolean;
  markerKey: string;
  storage: "sessionStorage" | "localStorage" | "unavailable";
  timestamp: string;
};

declare global {
  interface Window {
    __luminariValidationSessionShim?: ValidationSessionShimResult;
  }
}

const MARKER_KEY = "luminari.validationSessionShim.initialized";

function trySetStorageMarker(
  storage: Storage | undefined,
  storageName: "sessionStorage" | "localStorage",
  markerValue: string,
): "sessionStorage" | "localStorage" | undefined {
  if (!storage) return undefined;

  try {
    storage.setItem(MARKER_KEY, markerValue);
    return storageName;
  } catch {
    return undefined;
  }
}

/**
 * Initializes a client-side compatibility marker only.
 *
 * This shim intentionally avoids network calls and does not perform validation,
 * because the original expected backend behavior is unavailable.
 */
export async function initializeValidationSession(): Promise<ValidationSessionShimResult> {
  const timestamp = new Date().toISOString();
  const markerValue = JSON.stringify({ kind: "compatibility-shim", timestamp });

  const storage =
    trySetStorageMarker(globalThis.window?.sessionStorage, "sessionStorage", markerValue) ??
    trySetStorageMarker(globalThis.window?.localStorage, "localStorage", markerValue) ??
    "unavailable";

  const result: ValidationSessionShimResult = {
    kind: "compatibility-shim",
    initialized: true,
    markerKey: MARKER_KEY,
    storage,
    timestamp,
  };

  if (globalThis.window) {
    globalThis.window.__luminariValidationSessionShim = result;
  }

  console.info("[Luminari] validation-session compatibility shim initialized", result);
  return result;
}
