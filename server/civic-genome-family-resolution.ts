import type { PoolClient } from "pg";
import { getPool } from "./db";
import { resolveFamily } from "./civic-genome/assembly-engine";
import type {
  CivicGenomeFamily,
  CivicGenomeTrait,
  CivicGenomeTraitClass,
  FamilySimilarityBreakdown,
  TraitSignalStatus,
} from "./civic-genome/assembly-contract";

export const FAMILY_RESOLUTION_METHOD_VERSION = "weighted-confirmed-traits-v2";
export const FAMILY_RESOLUTION_THRESHOLD = 0.7;
export const FAMILY_RESOLUTION_MINIMUM_SHARED_TRAITS = 3;

type resolution_reason =
  | "missing_structural_traits"
  | "no_candidates"
  | "below_threshold"
  | "insufficient_confirmed_traits"
  | "hard_contradiction"
  | "ambiguous_above_threshold";

export type family_resolution_result =
  | {
      status: "assigned";
      genome_bill_id: string;
      prior_family_id: string;
      family_id: string;
      score: number;
      candidate_count: number;
      similarity_breakdown: FamilySimilarityBreakdown;
      methodology_version: string;
    }
  | {
      status: "unresolved";
      genome_bill_id: string;
      prior_family_id: string;
      reason: resolution_reason;
      best_candidate_family_id: string | null;
      best_candidate_score: number;
      candidate_family_ids: string[];
      similarity_breakdown: FamilySimilarityBreakdown | null;
      methodology_version: string;
    };

type bill_identity = {
  genome_bill_id: string;
  family_id: string;
  policy_domain: string;
};

type persisted_trait = {
  trait_id: string;
  genome_bill_id: string;
  trait_class: string;
  trait_key: string;
  normalized_value_json: unknown;
  source_object_type: string;
  source_object_id: string;
  source_block_id: string | null;
  extraction_run_id: string | null;
  confidence_score: number;
  signal_status: string;
  trait_fingerprint: string;
};

type candidate_row = persisted_trait & {
  family_id: string;
  family_key: string;
  policy_domain: string;
};

async function refresh_family_rollup(
  client: PoolClient,
  family_id: string,
): Promise<void> {
  await client.query(
    `with rollup as (
       select
         count(distinct state_code) filter (where current_state_position <> 'failed')::int as active_state_count,
         count(distinct state_code) filter (
           where current_state_position in (
             'introduced',
             'active_in_committee',
             'advanced_one_chamber',
             'advanced_two_chambers'
           )
         )::int as introduced_state_count,
         count(distinct state_code) filter (where current_state_position = 'enacted')::int as enacted_state_count,
         count(distinct state_code) filter (where current_state_position = 'failed')::int as failed_state_count,
         max(coalesce(last_action_at, introduced_at, updated_at)) as last_event_at
       from public.civic_genome_bill
       where family_id = $1
     )
     update public.civic_genome_family family
        set active_state_count = coalesce(rollup.active_state_count, 0),
            introduced_state_count = coalesce(rollup.introduced_state_count, 0),
            enacted_state_count = coalesce(rollup.enacted_state_count, 0),
            failed_state_count = coalesce(rollup.failed_state_count, 0),
            last_event_at = rollup.last_event_at,
            momentum_score = least(1, coalesce(rollup.active_state_count, 0)::numeric / 50),
            acceleration_score = 0,
            collapse_score = least(
              1,
              coalesce(rollup.failed_state_count, 0)::numeric
                / greatest(
                    coalesce(rollup.active_state_count, 0)
                      + coalesce(rollup.failed_state_count, 0),
                    1
                  )
            ),
            updated_at = now()
       from rollup
      where family.family_id = $1`,
    [family_id],
  );
  await client.query(
    `insert into public.family_momentum_snapshot (
       family_id, snapshot_date, active_state_count,
       introduced_state_count, enacted_state_count, failed_state_count,
       new_state_count, velocity_score, acceleration_score, collapse_score
     )
     select family_id, current_date, active_state_count,
            introduced_state_count, enacted_state_count, failed_state_count,
            0, momentum_score, acceleration_score, collapse_score
       from public.civic_genome_family
      where family_id = $1
     on conflict (family_id, snapshot_date) do update set
       active_state_count = excluded.active_state_count,
       introduced_state_count = excluded.introduced_state_count,
       enacted_state_count = excluded.enacted_state_count,
       failed_state_count = excluded.failed_state_count,
       velocity_score = excluded.velocity_score,
       acceleration_score = excluded.acceleration_score,
       collapse_score = excluded.collapse_score`,
    [family_id],
  );
}

const to_trait = (row: persisted_trait): CivicGenomeTrait => ({
  traitId: row.trait_id,
  genomeBillId: row.genome_bill_id,
  traitClass: row.trait_class as CivicGenomeTraitClass,
  traitKey: row.trait_key,
  normalizedValue: row.normalized_value_json,
  sourceObjectType: row.source_object_type,
  sourceObjectId: row.source_object_id,
  sourceBlockId: row.source_block_id,
  extractionRunId: row.extraction_run_id ?? "unknown",
  confidence: Number(row.confidence_score),
  signalStatus: row.signal_status as TraitSignalStatus,
  traitFingerprint: row.trait_fingerprint,
});

export async function resolve_civic_genome_family(
  genome_bill_id: string,
): Promise<family_resolution_result> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await resolve_civic_genome_family_with_client(client, genome_bill_id);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function resolve_civic_genome_family_with_client(
  client: PoolClient,
  genome_bill_id: string,
): Promise<family_resolution_result> {
  const bill_result = await client.query<bill_identity>(
    `select bill.genome_bill_id, bill.family_id, family.policy_domain
       from public.civic_genome_bill bill
       join public.civic_genome_family family on family.family_id = bill.family_id
      where bill.genome_bill_id = $1
      for update of bill`,
    [genome_bill_id],
  );
  const bill = bill_result.rows[0];
  if (!bill) throw new Error("civic_genome_bill_not_found");

  const trait_result = await client.query<persisted_trait>(
    `select trait_id, genome_bill_id, trait_class, trait_key,
            normalized_value_json, source_object_type, source_object_id,
            source_block_id, extraction_run_id, confidence_score,
            signal_status, trait_fingerprint
       from public.civic_genome_trait
      where genome_bill_id = $1
      order by trait_fingerprint`,
    [genome_bill_id],
  );
  const traits = trait_result.rows.map(to_trait);
  const confirmed_traits = traits.filter(trait => trait.signalStatus === "confirmed");

  if (confirmed_traits.length === 0) {
    return record_unresolved(client, bill, {
      reason: "missing_structural_traits",
      best_candidate_family_id: null,
      best_candidate_score: 0,
      candidate_family_ids: [],
      similarity_breakdown: null,
    });
  }

  const candidate_result = await client.query<candidate_row>(
    `select family.family_id, family.family_key, family.policy_domain,
            trait.trait_id, trait.genome_bill_id, trait.trait_class,
            trait.trait_key, trait.normalized_value_json,
            trait.source_object_type, trait.source_object_id,
            trait.source_block_id, trait.extraction_run_id,
            trait.confidence_score, trait.signal_status,
            trait.trait_fingerprint
       from public.civic_genome_family family
       join public.civic_genome_bill bill on bill.family_id = family.family_id
       join public.civic_genome_trait trait on trait.genome_bill_id = bill.genome_bill_id
      where family.policy_domain = $1
        and family.family_id <> $2
        and trait.signal_status = 'confirmed'
      order by family.family_id, trait.trait_fingerprint`,
    [bill.policy_domain, bill.family_id],
  );

  const grouped = new Map<string, CivicGenomeFamily>();
  for (const row of candidate_result.rows) {
    const family = grouped.get(row.family_id) ?? {
      familyId: row.family_id,
      familyKey: row.family_key,
      policyDomain: row.policy_domain,
      confirmedTraits: [],
    };
    family.confirmedTraits.push(to_trait(row));
    grouped.set(row.family_id, family);
  }
  const candidates = [...grouped.values()].sort((left, right) => left.familyId.localeCompare(right.familyId));

  const resolution = resolveFamily(
    bill.policy_domain,
    traits,
    candidates,
    FAMILY_RESOLUTION_THRESHOLD,
    FAMILY_RESOLUTION_MINIMUM_SHARED_TRAITS,
  );

  if (resolution.state === "unresolved_family_candidate") {
    return record_unresolved(client, bill, {
      reason: resolution.reason,
      best_candidate_family_id: resolution.bestCandidateFamilyId,
      best_candidate_score: resolution.score,
      candidate_family_ids: candidates.map(candidate => candidate.familyId),
      similarity_breakdown: resolution.breakdown,
    });
  }

  if (resolution.competingFamilyIds.length > 0) {
    return record_unresolved(client, bill, {
      reason: "ambiguous_above_threshold",
      best_candidate_family_id: resolution.familyId,
      best_candidate_score: resolution.score,
      candidate_family_ids: [resolution.familyId, ...resolution.competingFamilyIds],
      similarity_breakdown: resolution.breakdown,
    });
  }

  await client.query(
    `update public.civic_genome_bill
        set family_id = $2,
            updated_at = now()
      where genome_bill_id = $1`,
    [genome_bill_id, resolution.familyId],
  );
  await client.query(
    `update public.civic_genome_event
        set family_id = $2
      where genome_bill_id = $1
        and family_id <> $2`,
    [genome_bill_id, resolution.familyId],
  );
  await client.query(
    `update public.civic_genome_unresolved_family_candidate
        set resolved_at = now(),
            resolution_family_id = $2,
            updated_at = now()
      where genome_bill_id = $1
        and resolved_at is null`,
    [genome_bill_id, resolution.familyId],
  );
  await client.query(
    `insert into public.civic_genome_unresolved_family_candidate (
       genome_bill_id, policy_domain, resolution_reason,
       best_candidate_family_id, best_candidate_score,
       similarity_breakdown_json, competing_family_ids,
       methodology_version, observed_at, resolved_at,
       resolution_family_id
     ) values (
       $1,$2,'structural_match',$3,$4,$5::jsonb,'{}'::uuid[],
       $6,clock_timestamp(),clock_timestamp(),$3
     )`,
    [
      genome_bill_id,
      bill.policy_domain,
      resolution.familyId,
      resolution.score,
      JSON.stringify(resolution.breakdown),
      FAMILY_RESOLUTION_METHOD_VERSION,
    ],
  );
  await refresh_family_rollup(client, bill.family_id);
  if (resolution.familyId !== bill.family_id) {
    await refresh_family_rollup(client, resolution.familyId);
  }

  return {
    status: "assigned",
    genome_bill_id,
    prior_family_id: bill.family_id,
    family_id: resolution.familyId,
    score: resolution.score,
    candidate_count: candidates.length,
    similarity_breakdown: resolution.breakdown,
    methodology_version: FAMILY_RESOLUTION_METHOD_VERSION,
  };
}

async function record_unresolved(
  client: PoolClient,
  bill: bill_identity,
  outcome: {
    reason: resolution_reason;
    best_candidate_family_id: string | null;
    best_candidate_score: number;
    candidate_family_ids: string[];
    similarity_breakdown: FamilySimilarityBreakdown | null;
  },
): Promise<family_resolution_result> {
  await client.query(
    `insert into public.civic_genome_unresolved_family_candidate (
       genome_bill_id, policy_domain, resolution_reason,
       best_candidate_family_id, best_candidate_score,
       similarity_breakdown_json, competing_family_ids,
       methodology_version, observed_at
     ) values ($1,$2,$3,$4::uuid,$5,$6::jsonb,$7::uuid[],$8,now())`,
    [
      bill.genome_bill_id,
      bill.policy_domain,
      outcome.reason,
      outcome.best_candidate_family_id,
      outcome.best_candidate_score,
      JSON.stringify(outcome.similarity_breakdown ?? {}),
      outcome.candidate_family_ids,
      FAMILY_RESOLUTION_METHOD_VERSION,
    ],
  );

  return {
    status: "unresolved",
    genome_bill_id: bill.genome_bill_id,
    prior_family_id: bill.family_id,
    reason: outcome.reason,
    best_candidate_family_id: outcome.best_candidate_family_id,
    best_candidate_score: outcome.best_candidate_score,
    candidate_family_ids: outcome.candidate_family_ids,
    similarity_breakdown: outcome.similarity_breakdown,
    methodology_version: FAMILY_RESOLUTION_METHOD_VERSION,
  };
}
