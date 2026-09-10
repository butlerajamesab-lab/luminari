import { getPool } from './db';
import type { MessageAuthorBinding } from './engines/intake-spine/layer-6-entity_registry';

type QueryPool = Pick<ReturnType<typeof getPool>, 'query'>;

export async function load_verified_message_author_bindings(
  intake_session_id: string,
  case_uuid: string,
  pool: QueryPool = getPool(),
): Promise<MessageAuthorBinding[]> {
  const result = await pool.query<{
    artifact_key: string;
    message_direction: 'received' | 'sent';
    source_contact_name: string | null;
    author_canonical_name: string;
    provenance_ref: string;
  }>(`
    select assertion.artifact_key,
           assertion.message_direction,
           assertion.source_contact_name,
           assertion.author_canonical_name,
           assertion.provenance_ref
      from public.intake_message_participant_assertions assertion
      join public.intake_artifacts artifact
        on artifact.artifact_id = assertion.artifact_id
       and artifact.intake_session_id = assertion.intake_session_id
       and artifact.artifact_key = assertion.artifact_key
      join public.case_intake_links case_link
        on case_link.intake_session_id = assertion.intake_session_id
       and case_link.case_uuid = assertion.case_uuid
       and case_link.is_primary = true
       and case_link.link_type = 'primary_projection'
     where assertion.intake_session_id = $1::uuid
       and assertion.case_uuid = $2::uuid
       and assertion.review_status = 'verified'
       and not exists (
         select 1
           from public.intake_message_participant_assertions successor
          where successor.supersedes_assertion_id = assertion.assertion_id
       )
     order by assertion.artifact_key, assertion.message_direction,
              assertion.source_contact_name nulls first,
              assertion.author_canonical_name, assertion.provenance_ref
  `, [intake_session_id, case_uuid]);

  return result.rows.map(row => ({
    artifact_key: row.artifact_key,
    message_direction: row.message_direction,
    ...(row.source_contact_name ? { source_contact_name: row.source_contact_name } : {}),
    author_canonical_name: row.author_canonical_name,
    provenance_ref: row.provenance_ref,
    verification_state: 'verified',
  }));
}
