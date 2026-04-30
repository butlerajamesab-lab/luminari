import { describe, it, expect } from 'vitest';
import { matchJurisdiction, sovereignRegistry } from './jurisdiction-matcher';

describe('Jurisdiction Matcher', () => {
  describe('Sovereign Registry', () => {
    it('should have AL-AUBURN-001 as Gold tier', () => {
      expect(sovereignRegistry['AL-AUBURN-001'].tier).toBe('gold');
      expect(sovereignRegistry['AL-AUBURN-001'].isSovereign).toBe(true);
    });

    it('should have WA-AUBURN-002 as Silver tier', () => {
      expect(sovereignRegistry['WA-AUBURN-002'].tier).toBe('silver');
      expect(sovereignRegistry['WA-AUBURN-002'].isSovereign).toBe(false);
    });

    it('should have correct names for jurisdictions', () => {
      expect(sovereignRegistry['AL-AUBURN-001'].name).toBe('Auburn, Alabama');
      expect(sovereignRegistry['WA-AUBURN-002'].name).toBe('Auburn, Washington');
    });
  });

  describe('matchJurisdiction Function', () => {
    it('should match exact jurisdiction ID', () => {
      const result = matchJurisdiction('AL-AUBURN-001');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('AL-AUBURN-001');
      expect(result?.isSovereign).toBe(true);
    });

    it('should match case-insensitive jurisdiction ID', () => {
      const result = matchJurisdiction('al-auburn-001');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('AL-AUBURN-001');
    });

    it('should match by jurisdiction name', () => {
      const result = matchJurisdiction('Auburn, Alabama');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('AL-AUBURN-001');
      expect(result?.isSovereign).toBe(true);
    });

    it('should match case-insensitive name', () => {
      const result = matchJurisdiction('auburn, alabama');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('AL-AUBURN-001');
    });

    it('should match by partial city name', () => {
      const result = matchJurisdiction('Auburn');
      expect(result).not.toBeNull();
      // Should match first Auburn (Alabama)
      expect(result?.id).toBe('AL-AUBURN-001');
    });

    it('should match by state code', () => {
      const result = matchJurisdiction('AL');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('AL-AUBURN-001');
    });

    it('should match Washington Auburn', () => {
      const result = matchJurisdiction('Auburn, Washington');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('WA-AUBURN-002');
      expect(result?.isSovereign).toBe(false);
    });

    it('should return null for non-matching query', () => {
      const result = matchJurisdiction('Non-Existent City');
      expect(result).toBeNull();
    });

    it('should return null for empty query', () => {
      const result = matchJurisdiction('');
      expect(result).toBeNull();
    });

    it('should handle whitespace in query', () => {
      const result = matchJurisdiction('  auburn, alabama  ');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('AL-AUBURN-001');
    });

    it('should distinguish between AL and WA Auburn', () => {
      const alResult = matchJurisdiction('Auburn Alabama');
      const waResult = matchJurisdiction('Auburn Washington');
      
      expect(alResult?.id).toBe('AL-AUBURN-001');
      expect(waResult?.id).toBe('WA-AUBURN-002');
      expect(alResult?.isSovereign).toBe(true);
      expect(waResult?.isSovereign).toBe(false);
    });
  });

  describe('Auburn Collision Detection', () => {
    it('should not confuse AL-AUBURN-001 with WA-AUBURN-002', () => {
      const alResult = matchJurisdiction('AL-AUBURN-001');
      const waResult = matchJurisdiction('WA-AUBURN-002');
      
      expect(alResult?.id).not.toBe(waResult?.id);
      expect(alResult?.isSovereign).not.toBe(waResult?.isSovereign);
    });

    it('should prioritize state-specific match over generic Auburn', () => {
      const result = matchJurisdiction('Auburn, AL');
      expect(result?.id).toBe('AL-AUBURN-001');
    });
  });

  describe('Sovereign Status', () => {
    it('should return isSovereign: true for Gold tier', () => {
      const result = matchJurisdiction('AL-AUBURN-001');
      expect(result?.isSovereign).toBe(true);
      expect(result?.tier).toBe('gold');
    });

    it('should return isSovereign: false for Silver tier', () => {
      const result = matchJurisdiction('WA-AUBURN-002');
      expect(result?.isSovereign).toBe(false);
      expect(result?.tier).toBe('silver');
    });
  });
});
