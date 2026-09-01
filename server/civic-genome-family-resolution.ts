import type { PoolClient } from "pg";
import { getPool } from "./db";
import { resolveFamily, stableStringify } from "./civic-genome/assembly-engine";
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

export type CivicGenomeCandidateFamilyRow = {
  family_id: string;
  family_key: string;
  policy_domain: string;
};

export type CivicGenomeCandidateTraitRow = persisted_trait &
  CivicGenomeCandidateFamilyRow;

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
         min(enacted_at) as first_enacted_at,
         max(coalesce(last_action_at, introduced_at, updated_at)) as last_event_at
       from public.civic_genome_bill
       where family_id = $1
     )
     update public.civic_genome_family family
        set active_state_count = coalesce(rollup.active_state_count, 0),
            introduced_state_count = coalesce(rollup.introduced_state_count, 0),
            enacted_state_count = coalesce(rollup.enacted_state_count, 0),
            failed_state_count = coalesce(rollup.failed_state_count, 0),
            first_enacted_at = rollup.first_enacted_at,
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

/**
 * Reconstructs the complete candidate universe from lightweight family rows and
 * full traits only for families with at least one exact confirmed-trait match.
 *
 * A family with no exact normalized-trait match has the resolver's fixed
 * policy-domain-only score (0.25) and zero shared traits. Keeping that family
 * as an empty placeholder therefore preserves candidate count, deterministic
 * tie-breaking, and unresolved-candidate receipts without transferring its
 * unrelated trait payload through the pooled application connection.
 */
export function materialize_civic_genome_family_candidates(
  family_rows: CivicGenomeCandidateFamilyRow[],
  trait_rows: CivicGenomeCandidateTraitRow[],
): CivicGenomeFamily[] {
  const candidates = new Map<string, CivicGenomeFamily>();
  for (const row of family_rows) {
    candidates.set(row.family_id, {
      familyId: row.family_id,
      familyKey: row.family_key,
      policyDomain: row.policy_domain,
      confirmedTraits: [],
    });
  }

  for (const row of trait_rows) {
    const family = candidates.get(row.family_id);
    if (!family)
      throw new Error("civic_genome_candidate_trait_without_family_metadata");
    family.confirmedTraits.push(to_trait(row));
  }

  return [...candidates.values()].sort((left, right) =>
    left.familyId.localeCompare(right.familyId),
  );
}

function build_exact_confirmed_trait_matches(
  confirmed_traits: CivicGenomeTrait[],
): Array<{ trait_key: string; normalized_value_json: unknown }> {
  const matches = new Map<
    string,
    { trait_key: string; normalized_value_json: unknown }
  >();
  for (const trait of confirmed_traits) {
    const key = `${trait.traitKey}\u0000${stableStringify(trait.normalizedValue)}`;
    matches.set(key, {
      trait_key: trait.traitKey,
      normalized_value_json: trait.normalizedValue,
    });
  }
  return [...matches.values()];
}

export async function resolve_civic_genome_family(
  genome_bill_id: string,
): Promise<family_resolution_result> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await resolve_civic_genome_family_with_client(
      client,
      genome_bill_id,
    );
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
  const confirmed_traits = traits.filter(
    (trait) => trait.signalStatus === "confirmed",
  );

  if (confirmed_traits.length === 0) {
    return record_unresolved(client, bill, {
      reason: "missing_structural_traits",
      best_candidate_family_id: null,
      best_candidate_score: 0,
      candidate_family_ids: [],
      similarity_breakdown: null,
    });
  }

  const candidate_family_result =
    await client.query<CivicGenomeCandidateFamilyRow>(
      `select family.family_id, family.family_key, family.policy_domain
       from public.civic_genome_family family
       join public.civic_genome_bill bill on bill.family_id = family.family_id
       join public.civic_genome_trait trait on trait.genome_bill_id = bill.genome_bill_id
      where family.policy_domain = $1
        and family.family_id <> $2
        and trait.signal_status = 'confirmed'
      group by family.family_id, family.family_key, family.policy_domain
      order by family.family_id`,
      [bill.policy_domain, bill.family_id],
    );

  const exact_confirmed_trait_matches =
    build_exact_confirmed_trait_matches(confirmed_traits);
  const candidate_trait_result =
    await client.query<CivicGenomeCandidateTraitRow>(
      `with input_traits as materialized (
       select distinct input.trait_key, input.normalized_value_json
       from jsonb_to_recordset($3::jsonb) as input(
         trait_key text,
         normalized_value_json jsonb
       )
     ), matching_families as materialized (
       select candidate_family.family_id
       from input_traits source_trait
       join public.civic_genome_trait candidate_trait
         on candidate_trait.trait_key = source_trait.trait_key
        and jsonb_hash_extended(candidate_trait.normalized_value_json, 0)
            = jsonb_hash_extended(source_trait.normalized_value_json, 0)
        and candidate_trait.normalized_value_json = source_trait.normalized_value_json
        and candidate_trait.signal_status = 'confirmed'
       join public.civic_genome_bill candidate_bill
         on candidate_bill.genome_bill_id = candidate_trait.genome_bill_id
       join public.civic_genome_family candidate_family
         on candidate_family.family_id = candidate_bill.family_id
       where candidate_family.policy_domain = $1
         and candidate_family.family_id <> $2
       group by candidate_family.family_id
       having count(distinct (candidate_trait.trait_key, candidate_trait.normalized_value_json)) > 0
     )
     select family.family_id, family.family_key, family.policy_domain,
            trait.trait_id, trait.genome_bill_id, trait.trait_class,
            trait.trait_key, trait.normalized_value_json,
            trait.source_object_type, trait.source_object_id,
            trait.source_block_id, trait.extraction_run_id,
            trait.confidence_score, trait.signal_status,
            trait.trait_fingerprint
       from matching_families matching_family
       join public.civic_genome_family family on family.family_id = matching_family.family_id
       join public.civic_genome_bill candidate_bill on candidate_bill.family_id = family.family_id
       join public.civic_genome_trait trait on trait.genome_bill_id = candidate_bill.genome_bill_id
      where trait.signal_status = 'confirmed'
      order by family.family_id, trait.trait_fingerprint`,
      [
        bill.policy_domain,
        bill.family_id,
        JSON.stringify(exact_confirmed_trait_matches),
      ],
    );
  const candidates = materialize_civic_genome_family_candidates(
    candidate_family_result.rows,
    candidate_trait_result.rows,
  );

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
      candidate_family_ids: candidates.map((candidate) => candidate.familyId),
      similarity_breakdown: resolution.breakdown,
    });
  }

  if (resolution.competingFamilyIds.length > 0) {
    return record_unresolved(client, bill, {
      reason: "ambiguous_above_threshold",
      best_candidate_family_id: resolution.familyId,
      best_candidate_score: resolution.score,
      candidate_family_ids: [
        resolution.familyId,
        ...resolution.competingFamilyIds,
      ],
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
