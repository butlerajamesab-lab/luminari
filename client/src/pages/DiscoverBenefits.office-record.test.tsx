import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
vi.mock('@/lib/trpc', () => ({ trpc: {} }));
import { FactActions } from './DiscoverBenefits';

describe('office record action from discovery', () => {
  it('links to the native office detail, including records with no phone or website', () => {
    const html = renderToStaticMarkup(<Router ssrPath="/discover-benefits"><FactActions fact={{
      record_link: { record_type: 'government_office', href: '/resource/gof_07c46cecd10c4191006b' },
    }} /></Router>);
    expect(html).toContain('View office record');
    expect(html).toContain('href="/resource/gof_07c46cecd10c4191006b"');
    expect(html).not.toContain('/cases');
  });

  it('shows an unresolved identity without a fallback office link', () => {
    const html = renderToStaticMarkup(<Router ssrPath="/discover-benefits"><FactActions fact={{
      record_link: null, record_link_state: 'unresolved_current_office',
    }} /></Router>);
    expect(html).toContain('Current office record could not be resolved');
    expect(html).not.toContain('View office record');
  });
});
