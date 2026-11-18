import { query_with_diagnostics } from "./db";

export type docket_archive_auxiliary_receipt = {
  kind: "person" | "roll_call";
  provider_record_id: number;
  state: string;
  payload: Record<string, unknown>;
  provenance: {
    archive_sha256: string;
    member_path: string;
    member_sha256: string;
    state: string;
    provider_record_id: number;
  };
};

export async function get_docket_archive_auxiliary_receipts(
  source_bill_id: number,
): Promise<{ people: docket_archive_auxiliary_receipt[]; roll_calls: docket_archive_auxiliary_receipt[] }> {
  if (!Number.isSafeInteger(source_bill_id) || source_bill_id < 1) {
    throw new Error("docket_bulk_invalid_bill_id");
  }
  const result = await query_with_diagnostics<{
    kind: "person" | "roll_call";
    provider_record_id: number;
    state: string;
    payload_json: Record<string, unknown>;
    archive_sha256: string;
    member_path: string;
    member_sha256: string;
  }>(
    `with target as (
      select c.bill_id, c.bill, br.archive_sha256, br.state
        from public.docket_bill_detail_cache c
        join public.docket_legiscan_bulk_member_receipt br
          on br.member_kind = 'bill'
         and br.bill_id = c.bill_id
         and br.provider_record_id = c.bill_id
         and br.state = c.bill->>'state'
       where c.bill_id = $1
         and c.source = 'legiscan_bulk_json'
    ), linked as (
      select r.member_kind as kind, r.provider_record_id, r.state, r.payload_json,
             r.archive_sha256, r.member_path, r.member_sha256
        from target t
        join public.docket_legiscan_bulk_member_receipt r
          on r.archive_sha256 = t.archive_sha256
         and r.state = t.state
       where r.member_kind = 'person'
         and r.payload_json->>'people_id' ~ '^[0-9]+$'
         and exists (
           select 1
             from jsonb_array_elements(
               case when jsonb_typeof(t.bill->'sponsors') = 'array'
                    then t.bill->'sponsors' else '[]'::jsonb end
             ) sponsor
            where sponsor->>'people_id' = r.payload_json->>'people_id'
         )
      union all
      select r.member_kind as kind, r.provider_record_id, r.state, r.payload_json,
             r.archive_sha256, r.member_path, r.member_sha256
        from target t
        join public.docket_legiscan_bulk_member_receipt r
          on r.archive_sha256 = t.archive_sha256
         and r.state = t.state
       where r.member_kind = 'roll_call'
         and r.payload_json->>'bill_id' ~ '^[0-9]+$'
         and r.payload_json->>'bill_id' = t.bill_id::text
         and r.payload_json->>'roll_call_id' = r.provider_record_id::text
    )
    select kind, provider_record_id, state, payload_json, archive_sha256, member_path, member_sha256
      from linked
     order by kind, provider_record_id
     limit 250`,
    [source_bill_id],
    { label: "docket_archive_auxiliary_receipts_read", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 10_000 },
  );
  const mapped = result.rows.map(row => ({
    kind: row.kind,
    provider_record_id: Number(row.provider_record_id),
    state: row.state,
    payload: row.payload_json,
    provenance: {
      archive_sha256: row.archive_sha256,
      member_path: row.member_path,
      member_sha256: row.member_sha256,
      state: row.state,
      provider_record_id: Number(row.provider_record_id),
    },
  }));
  return {
    people: mapped.filter(row => row.kind === "person"),
    roll_calls: mapped.filter(row => row.kind === "roll_call"),
  };
}
