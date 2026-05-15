import { describe, it, expect, beforeAll } from 'vitest';
import { isTemporaryBypassEnabled, getTemporaryBypassContext, TEMP_BYPASS_USER } from './_core/temp-bypass-procedure';

describe('Temporary Auth Bypass', () => {
  beforeAll(() => {
    // Ensure TEMP_AUTH_BYPASS is set to 'true' for testing
    process.env.TEMP_AUTH_BYPASS = 'true';
  });

  it('should detect when temporary bypass is enabled', () => {
    const enabled = isTemporaryBypassEnabled();
    expect(enabled).toBe(true);
  });

  it('should provide temporary bypass context when enabled', () => {
    const context = getTemporaryBypassContext();
    expect(context).toBeDefined();
    expect(context?.user).toBeDefined();
    expect(context?.user.id).toBe(TEMP_BYPASS_USER.id);
    expect(context?.user.email).toBe(TEMP_BYPASS_USER.email);
  });

  it('should create valid session context for bypass user', () => {
    const context = getTemporaryBypassContext();
    expect(context?.session).toBeDefined();
    expect(context?.session.userId).toBe(TEMP_BYPASS_USER.id);
    expect(context?.session.isTemporaryBypass).toBe(true);
    expect(context?.session.expiresAt).toBeInstanceOf(Date);
  });

  it('should have correct mock user properties', () => {
    expect(TEMP_BYPASS_USER.id).toBe('dev-validation-user-001');
    expect(TEMP_BYPASS_USER.email).toBe('validation@luminari.dev');
    expect(TEMP_BYPASS_USER.role).toBe('user');
  });

  it('should disable bypass when env var is not set', () => {
    const originalEnv = process.env.TEMP_AUTH_BYPASS;
    process.env.TEMP_AUTH_BYPASS = 'false';
    process.env.NODE_ENV = 'production';

    const enabled = isTemporaryBypassEnabled();
    expect(enabled).toBe(false);

    // Restore
    process.env.TEMP_AUTH_BYPASS = originalEnv;
  });
});
