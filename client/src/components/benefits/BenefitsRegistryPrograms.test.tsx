import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ read: vi.fn(), result: {} as any }));
vi.mock('@/lib/trpc', () => ({ trpc: { canonicalRegistry: { searchPrograms: { useQuery: state.read } } } }));
import Benefits_registry_programs, { schedule_registry_search, registry_search_offset, REGISTRY_PAGE_SIZE } from './BenefitsRegistryPrograms';

const program = {
  id: 'RTCELL_11948', name: 'Atrium Health (Charlotte Safety Net)', state_code: 'NC',
  contact: '800-555-0100', website: 'https://example.org/atrium',
  resource_contacts: [
    { contact_point_id: 'phone-1', contact_type: 'phone', contact_value: '800-555-0100' },
    { contact_point_id: 'web-1', contact_type: 'website', contact_value: 'https://example.org/atrium' },
    { contact_point_id: 'email-1', contact_type: 'email', contact_value: 'help@example.org' },
    { contact_point_id: 'portal-1', contact_type: 'portal', contact_value: 'https://example.org/apply' },
  ],
};
const render = (query = 'Atrium Health', state_code: string | null = 'NC', category: string | null = 'Healthcare') =>
  renderToStaticMarkup(<Benefits_registry_programs search_query={query} browse_category_keyword={category} state_code={state_code} />);

beforeEach(() => {
  state.result = { data: { programs: [program], total: 1 }, error: null, isFetching: false, isLoading: false, refetch: vi.fn() };
  state.read.mockReset().mockImplementation(() => state.result);
});
afterEach(() => vi.useRealTimers());

describe('Benefits Navigator registry search', () => {
  it('searches entered text with the selected state and displays the retained contact records', () => {
    const html = render('  Atrium Health  ');
    expect(state.read).toHaveBeenLastCalledWith(
      { query: 'Atrium Health', state_code: 'NC', federal_only: false, limit: 20, offset: 0 },
      { enabled: true, placeholderData: undefined },
    );
    expect(html).toContain('Atrium Health (Charlotte Safety Net)');
    expect(html).toContain('data-program-id="RTCELL_11948"');
    expect(html).toContain('Contact: 800-555-0100');
    expect(html).toContain('Contact details (4)');
    expect(html).toContain('help@example.org');
    expect(html).toContain('href="https://example.org/atrium"');
    expect(html).toContain('Showing 1–1 of 1 registry references.');
    expect(html).not.toContain('Searching for “Healthcare”');
  });

  it('changes the query state without assigning a medical category', () => {
    render('Atrium', 'WA');
    expect(state.read.mock.lastCall?.[0]).toEqual({ query: 'Atrium', state_code: 'WA', federal_only: false, limit: 20, offset: 0 });
    const federal_html = render('Atrium', null);
    expect(federal_html).toContain('with a recorded federal jurisdiction');
    expect(federal_html).not.toContain('across all jurisdictions');
    expect(state.read.mock.lastCall?.[0]).toEqual({ query: 'Atrium', state_code: undefined, federal_only: true, limit: 20, offset: 0 });
    expect(state.read.mock.lastCall?.[0]).not.toHaveProperty('category');
  });

  it('keeps a selected category as a literal search when no text was entered', () => {
    const html = render('');
    expect(state.read.mock.lastCall?.[0]).toEqual({ query: 'Healthcare', state_code: 'NC', federal_only: false, limit: 20, offset: 0 });
    expect(html).toContain('Category names are search terms');
  });

  it('does not request an empty or whitespace-only search', () => {
    expect(render('  ', 'NC', null)).toBe('');
    expect(state.read.mock.lastCall?.[1].enabled).toBe(false);
  });

  it('shows pending instead of presenting cached rows or zero results as current', () => {
    state.result.isFetching = true;
    const html = render();
    expect(html).toContain('Searching registry references…');
    expect(html).not.toContain('Charlotte Safety Net');
    expect(html).not.toContain('No registry references match');
    expect(html).not.toContain('Showing 1–1 of 1');
  });

  it('shows an error with retry without claiming the registry is empty', () => {
    state.result.error = new Error('Database timeout');
    const html = render();
    expect(html).toContain('Registry results are unavailable.');
    expect(html).toContain('Retry registry search');
    expect(html).not.toContain('Charlotte Safety Net');
    expect(html).not.toContain('No registry references match');
  });

  it('only reports no matches after a successful empty response', () => {
    state.result.data = undefined;
    expect(render()).toContain('Registry results have not loaded yet.');
    state.result.data = { programs: [], total: 0 };
    expect(render()).toContain('No registry references match this search.');
  });

  it('suppresses unsafe website navigation while preserving the record', () => {
    state.result.data = { programs: [{ ...program, website: 'javascript:alert(1)' }], total: 1 };
    const html = render();
    expect(html).toContain('No verified external link available');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('RTCELL_11948');
  });

  it('makes later registry results reachable with bounded page requests', () => {
    state.result.data = { programs: Array.from({ length: 20 }, (_, i) => ({ ...program, id: `program-${i}` })), total: 41 };
    const html = render();
    expect(state.read.mock.lastCall?.[0]).toMatchObject({ limit: 20, offset: 0 });
    expect(html).toContain('Showing 1–20 of 41 registry references.');
    expect(html).toContain('aria-label="Registry result pages"');
    expect(html).toMatch(/disabled=""[^>]*>Previous references/);
    expect(html).not.toMatch(/disabled=""[^>]*>Next references/);
  });

  it('shows the stored federal classification as unverified without reclassifying Arizona records by name', () => {
    state.result.data = { programs: [{
      id: 'lmn_55bf01de3cbf5ff834187d36',
      name: 'Arizona Department of Administration (Workers Comp Division)',
      category: 'government_agency', jurisdiction_id: 'federal',
    }], total: 1 };
    const html = render('Arizona', null);
    expect(html).toContain('data-program-id="lmn_55bf01de3cbf5ff834187d36"');
    expect(html).toContain('Recorded category: government_agency');
    expect(html).toContain('Recorded: federal');
    expect(html).toContain('Jurisdiction unverified');
    expect(html).toContain('do not establish benefit eligibility or current officeholder status');
    expect(html).not.toContain('among federal programs only');
    expect(html).not.toContain('Recorded: AZ');
  });

  it('labels legislator records with their stored category instead of calling them benefit programs', () => {
    state.result.data = { programs: [{
      id: 'lmn_4c2317371eb250e77e123278', name: 'Alexandria Ocasio-Cortez',
      category: 'legislator', jurisdiction_id: 'federal',
    }], total: 1 };
    const html = render('Alexandria', null);
    expect(html).toContain('Recorded category: legislator');
    expect(html).toContain('Registry references');
    expect(html).toContain('current officeholder status');
    expect(html).not.toContain('Registry programs');
  });

  it('preserves an unknown category and jurisdiction without assigning a classification', () => {
    state.result.data = { programs: [{ id: 'unknown-1', name: 'Unclassified source' }], total: 1 };
    const html = render('Unclassified', null);
    expect(html).toContain('Recorded category: Unknown');
    expect(html).toContain('Recorded: Unknown');
    expect(html).toContain('Jurisdiction unverified');
  });

  it('resets the effective page immediately when query or state changes', () => {
    const second_page = { query: 'Atrium', state_code: 'NC', offset: REGISTRY_PAGE_SIZE };
    expect(registry_search_offset(second_page, 'Atrium', 'NC')).toBe(20);
    expect(registry_search_offset(second_page, 'Different program', 'NC')).toBe(0);
    expect(registry_search_offset(second_page, 'Atrium', 'WA')).toBe(0);
    expect(registry_search_offset(second_page, 'Atrium', null)).toBe(0);
    expect(registry_search_offset({ ...second_page, offset: 40 }, 'Atrium', 'NC')).toBe(40);
  });

  it('waits for a pause and cancels superseded or unmounted searches', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const first = schedule_registry_search('Atri', publish);
    vi.advanceTimersByTime(200);
    first();
    const second = schedule_registry_search('Atrium Health', publish);
    vi.advanceTimersByTime(299);
    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenLastCalledWith('Atrium Health');
    second();
    const unmount = schedule_registry_search('Later', publish);
    unmount();
    vi.advanceTimersByTime(300);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
