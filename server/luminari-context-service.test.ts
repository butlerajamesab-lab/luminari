import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verify: vi.fn(), get: vi.fn() }));
vi.mock('./services/caseService', () => ({ verifyCaseOwnership: mocks.verify, getCaseById: mocks.get }));
vi.mock('./services/case-action-context', () => ({ get_case_action_context: vi.fn() }));
import { getCaseContext } from './services/luminariContextService';
beforeEach(() => { mocks.verify.mockReset(); mocks.get.mockReset(); });
describe('legacy registry case namespace', () => {
  it('requires an authenticated caller before reading the separately owned legacy case', async () => {
    await expect(getCaseContext(4, undefined as unknown as number)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it('refuses another owner without reading their case', async () => {
    mocks.verify.mockResolvedValue(false);
    await expect(getCaseContext(4,9)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.verify).toHaveBeenCalledWith(4,9);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('preserves missing legacy storage as unavailable instead of joining a same-number public case', async () => {
    mocks.verify.mockRejectedValue(Object.assign(new Error('legacy case table unavailable'), { code: '42P01' }));
    await expect(getCaseContext(4,9)).rejects.toMatchObject({ code: '42P01' });
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
