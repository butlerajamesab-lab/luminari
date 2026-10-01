import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { decode_legislative_html_bytes } from "./legislative-html-byte-decoder";

const queue_worker = fs.readFileSync(
  new URL("./civic-genome-legislative-version-queue-worker.ts", import.meta.url),
  "utf8",
);
const legiscan = fs.readFileSync(
  new URL("./services/legiscan.ts", import.meta.url),
  "utf8",
);
const pipeline = fs.readFileSync(
  new URL("./civic-genome-legislative-version-pipeline.ts", import.meta.url),
  "utf8",
);
const docket_route = fs.readFileSync(
  new URL("./routes/docket.ts", import.meta.url),
  "utf8",
);
const authority_migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20260930170000_docket_operational_authority_lock.sql",
    import.meta.url,
  ),
  "utf8",
);

const lineage_handoff_migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261001022607_restore_docket_lineage_authority_handoff.sql",
    import.meta.url,
  ),
  "utf8",
);

const predecessor_index_migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261001030640_civic_genome_predecessor_claim_index.sql",
    import.meta.url,
  ),
  "utf8",
);

const lineage_final_migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20261001230000_finalize_docket_lineage_authority_handoff.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Docket operational authority lock", () => {
  it("decodes Windows-1252 bytes before legislative HTML normalization", () => {
    const bytes = Buffer.from([
      0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e,
      0x93, 0x74, 0x65, 0x73, 0x74, 0x94,
      0x3c, 0x2f, 0x68, 0x74, 0x6d, 0x6c, 0x3e,
    ]);
    const decoded = decode_legislative_html_bytes(bytes, "text/html");

    expect(decoded.charset).toBe("windows-1252");
    expect(decoded.charset_source).toBe("utf8_replacement_fallback");
    expect(decoded.text).toContain("“test”");
    expect(decoded.text).not.toContain("\uFFFD");
  });

  it("does not truncate the live master list to an arbitrary 100-bill window", () => {
    expect(legiscan).not.toContain(".slice(0, 100)");
    expect(legiscan).not.toContain(".slice(0,100)");
  });

  it("makes Docket authority a hard current-source claim predicate", () => {
    expect(queue_worker).toContain(
      "join public.docket_current_authoritative_source_v1 current_authority",
    );
    expect(queue_worker).toContain(
      "or current_authority.source_document_key is not null",
    );
  });

  it("resolves operational currentness through the existing predecessor graph", () => {
    expect(authority_migration).toContain(
      "create trigger enqueue_docket_current_authoritative_version_v1",
    );
    expect(lineage_handoff_migration).toContain(
      "successor.predecessor_bill_version_id = candidate.bill_version_id",
    );
    expect(lineage_handoff_migration).toContain(
      "from lineage_leaf leaf",
    );
    expect(lineage_handoff_migration).not.toContain(
      "order by\n        document.stage_rank desc",
    );
    expect(lineage_handoff_migration).toContain(
      "extract(year from cache.fetched_at at time zone 'UTC')",
    );
  });

  it("probes the indexed physical predecessor table instead of rescanning eligible", () => {
    expect(predecessor_index_migration).toContain(
      "idx_civic_genome_bill_version_predecessor",
    );
    expect(predecessor_index_migration).toContain(
      "predecessor_bill_version_id",
    );
    expect(lineage_final_migration).toContain(
      "from public.civic_genome_bill_version successor",
    );
    expect(lineage_final_migration).toContain(
      "successor.predecessor_bill_version_id = candidate.bill_version_id",
    );
    expect(lineage_final_migration).toContain(
      "successor.genome_bill_id = candidate.genome_bill_id",
    );
    expect(lineage_final_migration).not.toContain(
      "from eligible successor",
    );
    expect(lineage_final_migration).not.toContain(
      "join public.docket_bill_source_document successor_document",
    );
    expect(lineage_final_migration).toContain(
      "update of version_fingerprint, provider_sequence, stage_rank, predecessor_bill_version_id",
    );
    expect(lineage_final_migration).toContain(
      "update public.civic_genome_legislative_version_queue queue",
    );
  });

  it("does not recompute stage-rank currentness inside the queue claim", () => {
    expect(queue_worker).not.toContain("currency.is_current");
    expect(queue_worker).not.toContain(
      "newer.stage_rank > version.stage_rank",
    );
    expect(queue_worker).not.toContain(
      "newer.provider_sequence > version.provider_sequence",
    );
  });

  it("renews authority for verified sources without rerunning unchanged semantics", () => {
    expect(pipeline).toContain(
      "export async function refresh_verified_docket_operational_authority",
    );
    expect(pipeline).toContain(
      "const source_changed = prior_source_content_hash !== source.source_content_hash",
    );
    expect(queue_worker).toContain(
      "refresh_verified_docket_operational_authority",
    );
    expect(queue_worker).toContain(
      "or current_authority.source_document_key is null",
    );
  });

  it("treats a prior-calendar-year cache as stale instead of leaving current authority empty", () => {
    expect(docket_route).toContain(
      "fetched.getUTCFullYear() !== now.getUTCFullYear()",
    );
  });
});
