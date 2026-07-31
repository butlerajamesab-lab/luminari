import { createHash } from "crypto";
import { getPool } from "./db";
import { classify_docket_event } from "./civic-genome-event-classifier";
import type { legiscan_master_bill } from "./services/legiscan";

type docket_state_cache_row = {
  state: string;
  session_id: number;
  session_title: string | null;
  bills: legiscan_master_bill[];
  bill_count: number;
  fetched_at: string;
  source: string;
};

type projected_bill_result = {
  state_code: string;
  source_bill_id: number;
  source_bill_number: string;
  source_offset: number;
  bill_id: string;
  family_id: string;
  genome_bill_id: string;
  event_type: string;
  action: "inserted" | "updated" | "unchanged";
};

export type civic_genome_projection_result = {
  ok: true;
  source: "docket_room_cache";
  states_scanned: number;
  total_candidate_count: number;
  batch_offset: number;
  batch_size: number | null;
  next_offset: number | null;
  remaining_count: number;
  has_more: boolean;
  bills_seen: number;
  inserted_count: number;
  updated_count: number;
  unchanged_count: number;
  event_count: number;
  family_count: number;
  results: projected_bill_result[];
};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

const stable_uuid = (value: string): string => {
  const hash = sha256(value);
  const variant = ((parseInt(hash[16] ?? "8", 16) & 0x3) | 0x8).toString(16);

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variant}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "unclassified_bill_family";

const normalize_state_code = (value: string): string => value.trim().toUpperCase();

const normalize_bill_text = (bill: legiscan_master_bill): string =>
  bill.title ?? bill.description ?? bill.number ?? `bill_${bill.bill_id}`;

const normalize_projection_offset = (offset: number | undefined): number => {
  if (offset === undefined) {
    return 0;
  }

  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("invalid_civic_genome_projection_offset");
  }

  return offset;
};

const normalize_projection_batch_size = (batch_size: number | undefined): number | null => {
  if (batch_size === undefined) {
    return null;
  }

  if (!Number.isSafeInteger(batch_size) || batch_size <= 0) {
    throw new Error("invalid_civic_genome_projection_batch_size");
  }

  return batch_size;
};

const infer_policy_domain = (bill: legiscan_master_bill): string => {
  const text = `${bill.title ?? ""} ${bill.description ?? ""}`.toLowerCase();

  if (/medicaid|medicare|health|hospital|mental health|behavioral health/.test(text)) return "health";
  if (/housing|tenant|landlord|eviction|homeless/.test(text)) return "housing";
  if (/education|school|student|teacher|university/.test(text)) return "education";
  if (/tax|revenue|appropriation|budget|funding|grant/.test(text)) return "finance";
  if (/criminal|court|sentence|probation|police|jail|prison/.test(text)) return "justice";
  if (/labor|wage|employment|worker|unemployment/.test(text)) return "labor";
  if (/election|voter|ballot|campaign/.test(text)) return "elections";
  if (/tribal|tribe|indian nation|native/.test(text)) return "tribal_governance";
  if (/commend|memorial|celebrat|honor|recogniz/.test(text)) return "commending_resolution";

  return "unclassified_legislation";
};

const infer_state_position = (bill: legiscan_master_bill): string => {
  const text = `${bill.title ?? ""} ${bill.description ?? ""} ${bill.last_action ?? ""}`.toLowerCase();

  if (/chapter|enacted|signed by governor|became law/.test(text)) return "enacted";
  if (/failed|withdrawn|dead|vetoed|postponed indefinitely/.test(text)) return "failed";
  if (/passed house and senate|passed both/.test(text)) return "advanced_two_chambers";
  if (/passed house|passed senate/.test(text)) return "advanced_one_chamber";
  if (/committee|referred|reported/.test(text)) return "active_in_committee";

  return "introduced";
};

const build_family_key = (bill: legiscan_master_bill): string => {
  const policy_domain = infer_policy_domain(bill);
  const basis = normalize_bill_text(bill);
  return `${policy_domain}:${slugify(basis)}`;
};

const build_structural_dna_json = (state_row: docket_state_cache_row, bill: legiscan_master_bill) => ({
  source_layer: "docket_room_cache",
  source_provider: state_row.source,
  state_code: state_row.state,
  session_id: state_row.session_id,
  session_title: state_row.session_title,
  source_bill_id: bill.bill_id,
  source_bill_number: bill.number,
  source_bill_title: bill.title ?? null,
  source_bill_description: bill.description ?? null,
  source_bill_url: bill.url ?? null,
  source_change_hash: bill.change_hash ?? null,
  source_status: bill.status ?? null,
  source_status_date: bill.status_date ?? null,
  source_last_action: bill.last_action ?? null,
  source_last_action_date: bill.last_action_date ?? null,
});

const should_append_change_event = (existing_hash: string | null, next_hash: string): boolean =>
  existing_hash === null || existing_hash !== next_hash;

const upsert_family = async (family_key: string, bill: legiscan_master_bill): Promise<string> => {
  const pool = getPool();
  const policy_domain = infer_policy_domain(bill);
  const family_label = normalize_bill_text(bill).slice(0, 240);
  const signature_json = {
    assignment_method: "docket_title_policy_domain_signature_v1",
    policy_domain,
    family_key,
  };

  const { rows } = await pool.query<{ family_id: string }>(
    `insert into public.civic_genome_family (
       family_key,
       family_label,
       policy_domain,
       family_status,
       first_seen_at,
       last_seen_at,
       signature_json
     ) values ($1, $2, $3, 'active', now(), now(), $4::jsonb)
     on conflict (family_key) do update set
       family_label = excluded.family_label,
       policy_domain = excluded.policy_domain,
       last_seen_at = now(),
       updated_at = now(),
       signature_json = public.civic_genome_family.signature_json || excluded.signature_json
     returning family_id`,
    [family_key, family_label, policy_domain, JSON.stringify(signature_json)],
  );

  return rows[0].family_id;
};

const refresh_family_rollups = async (family_id: string): Promise<void> => {
  const pool = getPool();

  await pool.query(
    `with rollup as (
       select
         count(distinct state_code) filter (where current_state_position not in ('failed'))::int as active_state_count,
         count(distinct state_code) filter (where current_state_position in ('introduced', 'active_in_committee', 'advanced_one_chamber', 'advanced_two_chambers'))::int as introduced_state_count,
         count(distinct state_code) filter (where current_state_position = 'enacted')::int as enacted_state_count,
         count(distinct state_code) filter (where current_state_position = 'failed')::int as failed_state_count,
         max(coalesce(last_action_at, introduced_at, updated_at)) as last_event_at
       from public.civic_genome_bill
       where family_id = $1
     )
     update public.civic_genome_family family
     set
       active_state_count = coalesce(rollup.active_state_count, 0),
       introduced_state_count = coalesce(rollup.introduced_state_count, 0),
       enacted_state_count = coalesce(rollup.enacted_state_count, 0),
       failed_state_count = coalesce(rollup.failed_state_count, 0),
       last_event_at = rollup.last_event_at,
       momentum_score = least(1, coalesce(rollup.active_state_count, 0)::numeric / 50),
       acceleration_score = 0,
       collapse_score = least(1, coalesce(rollup.failed_state_count, 0)::numeric / greatest(coalesce(rollup.active_state_count, 0) + coalesce(rollup.failed_state_count, 0), 1)),
       updated_at = now()
     from rollup
     where family.family_id = $1`,
    [family_id],
  );

  await pool.query(
    `insert into public.family_momentum_snapshot (
       family_id,
       snapshot_date,
       active_state_count,
       introduced_state_count,
       enacted_state_count,
       failed_state_count,
       new_state_count,
       velocity_score,
       acceleration_score,
       collapse_score
     )
     select
       family_id,
       current_date,
       active_state_count,
       introduced_state_count,
       enacted_state_count,
       failed_state_count,
       0,
       momentum_score,
       acceleration_score,
       collapse_score
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
};

const project_bill = async (
  state_row: docket_state_cache_row,
  bill: legiscan_master_bill,
  source_offset: number,
): Promise<projected_bill_result> => {
  const pool = getPool();
  const state_code = normalize_state_code(state_row.state);
  const source_bill_number = bill.number;
  const bill_id = stable_uuid(`docket_room:legiscan:${bill.bill_id}`);
  const family_key = build_family_key(bill);
  const family_id = await upsert_family(family_key, bill);
  const current_state_position = infer_state_position(bill);
  const docket_observation = build_structural_dna_json(state_row, bill);
  const docket_observation_hash = sha256(JSON.stringify(docket_observation));
  const structural_dna_json = {
    ...docket_observation,
    docket_observation_hash,
  };
  const bill_status = bill.status === undefined || bill.status === null ? null : `legiscan_status_${bill.status}`;

  const { rows: existing_rows } = await pool.query<{
    genome_bill_id: string;
    family_id: string;
    structural_dna_hash: string;
    structural_dna_json: Record<string, unknown>;
    rosetta_extraction_run_id: string | null;
    current_state_position: string;
    bill_status: string | null;
  }>(
    `select genome_bill_id, family_id, structural_dna_hash, structural_dna_json,
            rosetta_extraction_run_id, current_state_position, bill_status
     from public.civic_genome_bill
     where bill_id = $1
     limit 1`,
    [bill_id],
  );

  const existing = existing_rows[0] ?? null;
  const existing_docket_observation_hash = typeof existing?.structural_dna_json?.docket_observation_hash === "string"
    ? existing.structural_dna_json.docket_observation_hash
    : existing?.rosetta_extraction_run_id
      ? null
      : existing?.structural_dna_hash ?? null;
  const should_append_event = should_append_change_event(
    existing_docket_observation_hash,
    docket_observation_hash,
  );

  const { rows } = await pool.query<{ genome_bill_id: string; family_id: string }>(
    `insert into public.civic_genome_bill (
       family_id,
       bill_id,
       state_code,
       session_key,
       source_bill_number,
       source_bill_title,
       source_bill_url,
       bill_status,
       introduced_at,
       last_action_at,
       structural_dna_hash,
       structural_dna_json,
       procedural_lifecycle_json,
       jurisdiction_lineage_json,
       constitutional_dependency_json,
       fiscal_effects_json,
       enforcement_graph_json,
       downstream_impact_graph_json,
       current_state_position
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8,
       $9::timestamptz, $10::timestamptz, $11, $12::jsonb,
       $13::jsonb, $14::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $15
     )
     on conflict (bill_id) do update set
       family_id = case
         when public.civic_genome_bill.rosetta_extraction_run_id is null
           then excluded.family_id
         else public.civic_genome_bill.family_id
       end,
       state_code = excluded.state_code,
       session_key = excluded.session_key,
       source_bill_number = excluded.source_bill_number,
       source_bill_title = excluded.source_bill_title,
       source_bill_url = excluded.source_bill_url,
       bill_status = excluded.bill_status,
       last_action_at = excluded.last_action_at,
       structural_dna_hash = case
         when public.civic_genome_bill.rosetta_extraction_run_id is null
           then excluded.structural_dna_hash
         else public.civic_genome_bill.structural_dna_hash
       end,
       structural_dna_json = coalesce(public.civic_genome_bill.structural_dna_json, '{}'::jsonb)
         || excluded.structural_dna_json,
       procedural_lifecycle_json = excluded.procedural_lifecycle_json,
       jurisdiction_lineage_json = excluded.jurisdiction_lineage_json,
       current_state_position = excluded.current_state_position,
       updated_at = now()
     returning genome_bill_id, family_id`,
    [
      family_id,
      bill_id,
      state_code,
      String(state_row.session_id),
      source_bill_number,
      bill.title ?? bill.description ?? null,
      bill.url ?? null,
      bill_status,
      bill.status_date ?? bill.last_action_date ?? null,
      bill.last_action_date ?? bill.status_date ?? null,
      docket_observation_hash,
      JSON.stringify(structural_dna_json),
      JSON.stringify({
        source_status: bill.status ?? null,
        source_status_date: bill.status_date ?? null,
        last_action: bill.last_action ?? null,
        last_action_date: bill.last_action_date ?? null,
      }),
      JSON.stringify({
        state_code,
        session_id: state_row.session_id,
        session_title: state_row.session_title,
      }),
      current_state_position,
    ],
  );

  const genome_bill_id = rows[0].genome_bill_id;
  const persisted_family_id = rows[0].family_id;
  const classification = classify_docket_event(bill, existing);
  const event_type = classification.event_type;

  if (should_append_event) {
    await pool.query(
      `insert into public.civic_genome_event (
         family_id,
         genome_bill_id,
         bill_id,
         state_code,
         event_type,
         event_timestamp,
         prior_status,
         next_status,
         amendment_version,
         source_trace,
         event_payload_json
       ) values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()), $7, $8, $9, $10::jsonb, $11::jsonb)`,
      [
        persisted_family_id,
        genome_bill_id,
        bill_id,
        state_code,
        event_type,
        bill.last_action_date ?? bill.status_date ?? state_row.fetched_at ?? null,
        existing?.bill_status ?? null,
        bill_status,
        bill.change_hash ?? null,
        JSON.stringify([
          {
            source_layer: "docket_room_cache",
            source_table: "docket_bill_state_cache",
            state_code,
            session_id: state_row.session_id,
            source_bill_id: bill.bill_id,
            source_bill_number: source_bill_number,
            source_url: bill.url ?? null,
          },
        ]),
        JSON.stringify({
          event_summary: classification.event_summary,
          prior_state_position: existing?.current_state_position ?? null,
          next_state_position: current_state_position,
          docket_observation_hash,
          source_change_hash: bill.change_hash ?? null,
        }),
      ],
    );
  }

  await refresh_family_rollups(persisted_family_id);

  return {
    state_code,
    source_bill_id: bill.bill_id,
    source_bill_number,
    source_offset,
    bill_id,
    family_id: persisted_family_id,
    genome_bill_id,
    event_type,
    action: existing ? (should_append_event ? "updated" : "unchanged") : "inserted",
  };
};

export async function project_docket_cache_to_civic_genome(opts?: {
  state_code?: string;
  offset?: number;
  batch_size?: number;
  limit?: number;
}): Promise<civic_genome_projection_result> {
  const pool = getPool();
  const params: unknown[] = [];
  const conditions: string[] = [];
  const batch_offset = normalize_projection_offset(opts?.offset);
  const batch_size = normalize_projection_batch_size(opts?.batch_size ?? opts?.limit);
  const batch_end = batch_size === null ? null : batch_offset + batch_size;

  if (opts?.state_code) {
    params.push(normalize_state_code(opts.state_code));
    conditions.push(`state = $${params.length}`);
  }

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  const { rows } = await pool.query<docket_state_cache_row>(
    `select state, session_id, session_title, bills, bill_count, fetched_at, source
     from public.docket_bill_state_cache
     ${where}
     order by fetched_at desc`,
    params,
  );
  const results: projected_bill_result[] = [];
  let total_candidate_count = 0;
  let bills_seen = 0;

  for (const state_row of rows) {
    const bills = Array.isArray(state_row.bills) ? state_row.bills : [];

    for (const bill of bills) {
      if (!bill?.bill_id || !bill?.number) {
        continue;
      }

      const source_offset = total_candidate_count;
      total_candidate_count += 1;

      if (source_offset < batch_offset) {
        continue;
      }

      if (batch_end !== null && source_offset >= batch_end) {
        continue;
      }

      bills_seen += 1;
      results.push(await project_bill(state_row, bill, source_offset));
    }
  }

  const next_offset = batch_end !== null && batch_end < total_candidate_count ? batch_end : null;
  const remaining_count = next_offset === null ? 0 : total_candidate_count - next_offset;
  const family_ids = new Set(results.map(result => result.family_id));

  return {
    ok: true,
    source: "docket_room_cache",
    states_scanned: rows.length,
    total_candidate_count,
    batch_offset,
    batch_size,
    next_offset,
    remaining_count,
    has_more: next_offset !== null,
    bills_seen,
    inserted_count: results.filter(result => result.action === "inserted").length,
    updated_count: results.filter(result => result.action === "updated").length,
    unchanged_count: results.filter(result => result.action === "unchanged").length,
    event_count: results.filter(result => result.action !== "unchanged").length,
    family_count: family_ids.size,
    results,
  };
}
