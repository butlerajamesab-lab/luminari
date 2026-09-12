/** Connect existing program identities to their published resource contacts.
 * This is a read projection: no resource copies, fuzzy matches, or promotions.
 */
export const PROGRAM_RESOURCE_BINDINGS_QUERY = `
with candidates as (
  select p.id as registry_program_id, p.name as registry_name,
    coalesce(nullif(p.jurisdiction_id, ''), p.jurisdiction_id_rp) as registry_jurisdiction,
    s.id::text as staging_id, s.extraction_id::text as extraction_id,
    s.program_id, s.organization_name, x.name as extraction_name,
    x.jurisdiction as extraction_jurisdiction, x.source_file,
    e.resource_entity_id, e.resource_name, e.jurisdiction as resource_jurisdiction,
    e.source_hash, e.verification_status, e.promotion_status, e.provenance_status,
    coalesce(pr.publication_status, 'active') as publication_status,
    pr.source_reference as publication_reference,
    count(*) over (partition by p.id) as candidate_count
  from public.registry_programs p
  join public.registry_entity_staging_programs s on s.program_id = p.id
  join public.registry_entity_extraction_v4 x
    on x.id = s.extraction_id and x.program_id = s.program_id
  join public.luminari_resource_entities e
    on e.source_table = 'registry_entity_staging_programs'
    and e.source_pk = s.id::text and e.canonical_id = s.program_id
  left join public.luminari_resource_publication_resolutions pr
    on pr.resource_entity_id = e.resource_entity_id
  where p.id = any($1::text[])
), bound as (
  select c.* from candidates c
  where candidate_count = 1
    and nullif(btrim(registry_name), '') is not null
    and registry_name = organization_name and registry_name = extraction_name
    and registry_name = resource_name
    and nullif(btrim(registry_jurisdiction), '') is not null
    and registry_jurisdiction = extraction_jurisdiction
    and registry_jurisdiction = resource_jurisdiction
    and publication_status = 'active'
    and promotion_status = 'review_ready'
    and provenance_status = 'staging_provenance_attached'
    and verification_status = 'source_attached'
    and not exists (
      select 1 from public.registry_programs_crosswalk cw
      where cw.source_table = 'registry_entity_staging_programs'
        and cw.source_id = c.staging_id
        and (cw.registry_program_id is distinct from c.registry_program_id
          or cw.is_ambiguous is true or cw.is_best_match is false)
    )
)
select b.registry_program_id, b.resource_entity_id, b.staging_id,
  b.extraction_id, b.program_id, b.source_file, b.source_hash,
  b.verification_status, b.publication_reference,
  coalesce(contacts.items, '[]'::jsonb) as contacts
from bound b
left join lateral (
  select jsonb_agg(jsonb_build_object(
    'contact_point_id', cp.contact_point_id,
    'contact_type', cp.contact_type, 'contact_value', cp.contact_value,
    'source_table', cp.source_table, 'source_pk', cp.source_pk,
    'source_hash', cp.source_hash, 'manually_reviewed', cp.manually_reviewed,
    'manual_source_reference', cp.manual_source_reference
  ) order by cp.is_primary desc nulls last, cp.manually_reviewed desc,
    cp.created_at desc, cp.contact_point_id) as items
  from public.v_luminari_resource_contact_points_current_v3_13 cp
  where cp.resource_entity_id = b.resource_entity_id
    and cp.contact_type in ('phone', 'email', 'website', 'portal')
    and nullif(btrim(cp.contact_value), '') is not null
) contacts on true
order by b.registry_program_id
`;

export type ResourceContact = {
  contact_point_id: string;
  contact_type: string;
  contact_value: string;
  source_table: string | null;
  source_pk: string | null;
  source_hash: string | null;
  manually_reviewed: boolean;
  manual_source_reference: string | null;
};

export type ProgramResourceBinding = {
  registry_program_id: string;
  resource_entity_id: string;
  staging_id: string;
  extraction_id: string;
  program_id: string;
  source_file: string;
  source_hash: string | null;
  verification_status: string;
  publication_reference: string | null;
  contacts: ResourceContact[];
};

type Program = { id: string; contact?: string | null; website?: string | null };
type Queryable = {
  query(text: string, values: unknown[]): Promise<{ rows: ProgramResourceBinding[] }>;
};

const present = (value: unknown) => typeof value === 'string' && value.trim() !== '';

export function connectProgramResources<T extends Program>(programs: T[], bindings: ProgramResourceBinding[]) {
  const byId = new Map<string, ProgramResourceBinding[]>();
  for (const binding of bindings) {
    const entries = byId.get(binding.registry_program_id) ?? [];
    entries.push(binding);
    byId.set(binding.registry_program_id, entries);
  }
  return programs.map(program => {
    const matches = byId.get(program.id) ?? [];
    // Do not choose an arbitrary source if a query adapter returns duplicates.
    if (matches.length !== 1) return program;
    const { contacts, ...binding } = matches[0];
    if (binding.program_id !== program.id) return program;
    const first = (type: string) => contacts.find(contact =>
      contact.contact_type === type && present(contact.contact_value))?.contact_value;
    const website = first('website') ?? first('portal');
    const contact = first('phone') ?? first('email');
    const enrichedFields: string[] = [];
    const result = {
      ...program,
      registry_source_fields: { contact: program.contact, website: program.website },
      resource_binding: { ...binding, mapping_method: 'exact_staging_program_id_v1' },
      resource_contacts: contacts,
      enriched_fields: enrichedFields,
    };
    if (!present(program.website) && website) {
      result.website = website;
      enrichedFields.push('website');
    }
    if (!present(program.contact) && contact) {
      result.contact = contact;
      enrichedFields.push('contact');
    }
    return result;
  });
}

export async function loadProgramResources<T extends Program>(programs: T[], pool: Queryable) {
  if (!programs.length) return programs;
  // Callers provide only the current search/detail page, never the whole registry.
  const result = await pool.query(PROGRAM_RESOURCE_BINDINGS_QUERY,
    [[...new Set(programs.map(program => program.id))]]);
  return connectProgramResources(programs, result.rows);
}
