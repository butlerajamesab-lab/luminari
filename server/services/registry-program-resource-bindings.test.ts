import { describe, expect, it, vi } from 'vitest';
import { connectProgramResources, loadProgramResources, PROGRAM_RESOURCE_BINDINGS_QUERY,
  type ProgramResourceBinding, type ResourceContact } from './registry-program-resource-bindings';

const contact = (type: string, value: string): ResourceContact => ({
  contact_point_id: `${type}-1`, contact_type: type, contact_value: value,
  source_table: 'state_directory_logical_record', source_pk: 'logical-1',
  source_hash: 'contact-source-hash', manually_reviewed: false, manual_source_reference: null,
});
const binding = (overrides: Partial<ProgramResourceBinding> = {}): ProgramResourceBinding => ({
  registry_program_id: 'program-1', resource_entity_id: 'entity-1', staging_id: 'stage-1',
  extraction_id: 'extraction-1', program_id: 'program-1', source_file: 'source.docx',
  source_hash: 'entity-source-hash', verification_status: 'source_attached', publication_reference: null,
  contacts: [contact('phone', '555-0100'), contact('website', 'https://example.org')],
  ...overrides,
});

describe('existing program/resource identity projection', () => {
  it('fills missing access fields while retaining one original program and every source ID', () => {
    const program = { id: 'program-1', name: 'Existing program', contact: null, website: ' ' };
    const result: any[] = connectProgramResources([program], [binding()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: program.id, name: program.name,
      contact: '555-0100', website: 'https://example.org',
      registry_source_fields: { contact: null, website: ' ' },
      resource_binding: { resource_entity_id: 'entity-1', staging_id: 'stage-1', extraction_id: 'extraction-1' },
      enriched_fields: ['website', 'contact'],
    });
    expect(result[0].resource_contacts[0].source_pk).toBe('logical-1');
    expect(program.website).toBe(' ');
  });

  it('preserves existing fields and retains conflicting source contacts separately', () => {
    const program = { id: 'program-1', website: 'https://original.example', contact: 'Original contact' };
    const [result]: any[] = connectProgramResources([program], [binding()]);
    expect(result.website).toBe(program.website);
    expect(result.contact).toBe(program.contact);
    expect(result.enriched_fields).toEqual([]);
    expect(result.resource_contacts).toEqual(binding().contacts);
  });

  it('does not guess names, strip prefixes, or add rows for unmatched identities', () => {
    const programs = [{ id: 'different', name: 'Same name' }, { id: 'RP_program-1' }];
    expect(connectProgramResources(programs, [binding()])).toEqual(programs);
    expect(connectProgramResources([], [binding()])).toEqual([]);
  });

  it('holds duplicate source bindings and mismatched canonical IDs', () => {
    const programs = [{ id: 'program-1' }];
    expect(connectProgramResources(programs, [binding(), binding({ resource_entity_id: 'another' })])).toEqual(programs);
    expect(connectProgramResources(programs, [binding({ program_id: 'other' })])).toEqual(programs);
  });

  it('uses source ordering within a type and prefers website to portal and phone to email', () => {
    const [result]: any[] = connectProgramResources([{ id: 'program-1' }], [binding({ contacts: [
      contact('portal', 'https://portal.example'), contact('email', 'help@example.org'),
      contact('website', 'https://preferred.example'), contact('phone', 'preferred phone'),
      contact('website', 'https://later.example'),
    ] })]);
    expect(result.website).toBe('https://preferred.example');
    expect(result.contact).toBe('preferred phone');
  });

  it('does not invent access fields for a source-bound program without current contacts', () => {
    const [result]: any[] = connectProgramResources([{ id: 'program-1' }], [binding({ contacts: [] })]);
    expect(result.website).toBeUndefined();
    expect(result.contact).toBeUndefined();
    expect(result.enriched_fields).toEqual([]);
  });

  it('queries only the requested page using bound IDs and performs no query for an empty page', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [binding()] });
    const [result]: any[] = await loadProgramResources([{ id: 'program-1' }], { query });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(PROGRAM_RESOURCE_BINDINGS_QUERY, [['program-1']]);
    expect(result.contact).toBe('555-0100');
    query.mockClear();
    expect(await loadProgramResources([], { query })).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
