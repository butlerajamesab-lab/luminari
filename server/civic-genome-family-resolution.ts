import { getPool } from "./db";

export const FAMILY_RESOLUTION_METHOD_VERSION = "exact-structural-dna-family-v1";

export type family_resolution_result =
  | {
      status: "assigned";
      genome_bill_id: string;
      prior_family_id: string;
      family_id: string;
      structural_dna_hash: string;
      candidate_count: 1;
      methodology_version: string;
    }
  | {
      status: "unresolved";
      genome_bill_id: string;
      prior_family_id: string;
      structural_dna_hash: string | null;
      reason: "missing_structural_dna" | "no_exact_family_match" | "ambiguous_exact_family_match";
      candidate_family_ids: string[];
      methodology_version: string;
    };

type bill_identity = {
  genome_bill_id: string;
  family_id: string;
  structural_dna_hash: string;
};

export async function resolve_civic_genome_family(
  genome_bill_id: string,
): Promise<family_resolution_result> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    const bill_result = await client.query<bill_identity>(
      `select genome_bill_id, family_id, structural_dna_hash
         from public.civic_genome_bill
        where genome_bill_id = $1
        for update`,
      [genome_bill_id],
    );
    const bill = bill_result.rows[0];
    if (!bill) throw new Error("civic_genome_bill_not_found");

    const structural_dna_hash = bill.structural_dna_hash?.trim() || null;
    if (!structural_dna_hash) {
      await record_unresolved(client, bill, "missing_structural_dna", [], null);
      await client.query("commit");
      return unresolved_result(bill, structural_dna_hash, "missing_structural_dna", []);
    }

    const candidates = await client.query<{ family_id: string }>(
      `select distinct family_id
         from public.civic_genome_bill
        where structural_dna_hash = $1
          and genome_bill_id <> $2
          and family_id <> $3
        order by family_id`,
      [structural_dna_hash, genome_bill_id, bill.family_id],
    );
    const family_ids = candidates.rows.map(row => row.family_id);

    if (family_ids.length !== 1) {
      const reason = family_ids.length === 0
        ? "no_exact_family_match"
        : "ambiguous_exact_family_match";
      await record_unresolved(client, bill, reason, family_ids, structural_dna_hash);
      await client.query("commit");
      return unresolved_result(bill, structural_dna_hash, reason, family_ids);
    }

    const family_id = family_ids[0];
    await client.query(
      `update public.civic_genome_bill
          set family_id = $2,
              updated_at = now()
        where genome_bill_id = $1`,
      [genome_bill_id, family_id],
    );

    await client.query(
      `update public.civic_genome_unresolved_family_candidate
          set resolved_at = now(),
              resolution_family_id = $2,
              updated_at = now()
        where genome_bill_id = $1
          and resolved_at is null`,
      [genome_bill_id, family_id],
    );

    await client.query("commit");
    return {
      status: "assigned",
      genome_bill_id,
      prior_family_id: bill.family_id,
      family_id,
      structural_dna_hash,
      candidate_count: 1,
      methodology_version: FAMILY_RESOLUTION_METHOD_VERSION,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function unresolved_result(
  bill: bill_identity,
  structural_dna_hash: string | null,
  reason: "missing_structural_dna" | "no_exact_family_match" | "ambiguous_exact_family_match",
  candidate_family_ids: string[],
): family_resolution_result {
  return {
    status: "unresolved",
    genome_bill_id: bill.genome_bill_id,
    prior_family_id: bill.family_id,
    structural_dna_hash,
    reason,
    candidate_family_ids,
    methodology_version: FAMILY_RESOLUTION_METHOD_VERSION,
  };
}

async function record_unresolved(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  bill: bill_identity,
  reason: string,
  candidate_family_ids: string[],
  structural_dna_hash: string | null,
): Promise<void> {
  await client.query(
    `insert into public.civic_genome_unresolved_family_candidate (
       genome_bill_id,
       policy_domain,
       resolution_reason,
       best_candidate_family_id,
       best_candidate_score,
       similarity_breakdown_json,
       competing_family_ids,
       methodology_version,
       observed_at
     )
     select
       $1,
       family.policy_domain,
       $2,
       $3::uuid,
       $4,
       $5::jsonb,
       $6::uuid[],
       $7,
       now()
     from public.civic_genome_family family
     where family.family_id = $8`,
    [
      bill.genome_bill_id,
      reason,
      candidate_family_ids[0] ?? null,
      candidate_family_ids.length === 1 ? 1 : 0,
      JSON.stringify({
        comparison_method: "exact_structural_dna_hash",
        structural_dna_hash,
        candidate_family_ids,
      }),
      candidate_family_ids,
      FAMILY_RESOLUTION_METHOD_VERSION,
      bill.family_id,
    ],
  );
}
