/**
 * Bundle Generator — compiles the offline intake HTML bundle
 *
 * Reads the HTML template, injects domain module data and the Luminari version,
 * and returns a self-contained HTML string ready for download.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { ENGINE_VERSION } from "../shared/const";
import { DOMAIN_MODULES } from "../bundle-src/domains";

// Cache the template in memory after first read
let templateCache: string | null = null;

function getTemplate(): string {
  if (templateCache) return templateCache;
  const templatePath = join(import.meta.dirname, "..", "bundle-src", "intake-bundle.html");
  templateCache = readFileSync(templatePath, "utf-8");
  return templateCache;
}

/**
 * Generates a self-contained HTML bundle with embedded domain data.
 *
 * @param options.syncUrl - Pre-filled Luminari URL for the upload tab
 * @returns Complete HTML string
 */
export function generateBundle(options?: { syncUrl?: string }): string {
  let html = getTemplate();

  // Inject domain modules as JSON
  const domainsJson = JSON.stringify(
    DOMAIN_MODULES.map(d => ({
      id: d.id,
      label: d.label,
      icon: d.icon,
      description: d.description,
      safetyNote: d.safetyNote || null,
      questions: d.questions,
      suggestedDocuments: d.suggestedDocuments,
    })),
    null,
    0, // minified
  );
  html = html.replace("{{DOMAINS_JSON}}", domainsJson);

  // Inject Luminari version
  html = html.replace("{{LUMINARI_VERSION}}", ENGINE_VERSION);

  // Pre-fill sync URL if provided
  if (options?.syncUrl) {
    html = html.replace(
      'value=""',
      `value="${options.syncUrl.replace(/"/g, "&quot;")}"`,
    );
  }

  return html;
}

/**
 * Returns the bundle as a Buffer for streaming download.
 */
export function generateBundleBuffer(options?: { syncUrl?: string }): Buffer {
  return Buffer.from(generateBundle(options), "utf-8");
}

/**
 * Invalidates the template cache (useful for development).
 */
export function clearTemplateCache(): void {
  templateCache = null;
}
