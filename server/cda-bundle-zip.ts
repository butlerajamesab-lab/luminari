/**
 * CDA v1.0-PATCH3 — ZIP Bundle Packaging
 *
 * Produces cda-run-{run_id}.zip with exact directory layout:
 *   manifest.json
 *   data/S1–S8 JSON
 *   artifacts/O1–O4 markdown
 *   t7/t7_transcripts.jsonl
 *
 * No additional files. No renaming. No nesting changes.
 */

import archiver from "archiver";
import type { CdaRunBundleFiles } from "./cda-bundle";

/**
 * Package a CdaRunBundleFiles into a ZIP buffer.
 * Returns the raw Buffer suitable for streaming to HTTP response or writing to disk.
 */
export async function packageBundleZip(bundle: CdaRunBundleFiles): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", (err: Error) => reject(err));

    // manifest.json
    archive.append(JSON.stringify(bundle.manifest, null, 2), { name: "manifest.json" });

    // data/S1–S8
    const dataFiles: Array<{ name: string; content: unknown }> = [
      { name: "S1_document_index.json", content: bundle.data.S1_document_index },
      { name: "S2_quote_ledger.json", content: bundle.data.S2_quote_ledger },
      { name: "S3_claim_ledger.json", content: bundle.data.S3_claim_ledger },
      { name: "S4_denial_reason_ledger.json", content: bundle.data.S4_denial_reason_ledger },
      { name: "S5_policy_clause_ledger.json", content: bundle.data.S5_policy_clause_ledger },
      { name: "S6_comparison_matrix.json", content: bundle.data.S6_comparison_matrix },
      { name: "S7_evidence_gap_register.json", content: bundle.data.S7_evidence_gap_register },
      { name: "S8_contradiction_register.json", content: bundle.data.S8_contradiction_register },
    ];

    for (const file of dataFiles) {
      archive.append(JSON.stringify(file.content, null, 2), { name: `data/${file.name}` });
    }

    // artifacts/O1–O4
    archive.append(bundle.artifacts.O1_structured_claim_ledger, {
      name: "artifacts/O1_structured_claim_ledger.md",
    });
    archive.append(bundle.artifacts.O2_policy_denial_comparison_matrix, {
      name: "artifacts/O2_policy_denial_comparison_matrix.md",
    });
    archive.append(bundle.artifacts.O3_evidence_gaps_contradictions, {
      name: "artifacts/O3_evidence_gaps_contradictions.md",
    });
    archive.append(bundle.artifacts.O4_advocacy_packet_outline, {
      name: "artifacts/O4_advocacy_packet_outline.md",
    });

    // t7/t7_transcripts.jsonl
    archive.append(bundle.t7_transcripts_jsonl || "", { name: "t7/t7_transcripts.jsonl" });

    archive.finalize();
  });
}
