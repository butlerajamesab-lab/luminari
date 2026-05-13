import { describe, it, expect, beforeEach } from 'vitest';
import { useInterfaceStore } from './interfaceStore';

describe('useInterfaceStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useInterfaceStore.setState({
      searchQuery: '',
      activeJurisdiction: null,
      isSovereign: false,
      confidence: 0,
      isProcessing: false,
    });
  });

  describe('Search Query State', () => {
    it('should initialize with empty searchQuery', () => {
      const state = useInterfaceStore.getState();
      expect(state.searchQuery).toBe('');
    });

    it('should update searchQuery', () => {
      const { setSearchQuery } = useInterfaceStore.getState();
      setSearchQuery('Auburn Alabama');
      const state = useInterfaceStore.getState();
      expect(state.searchQuery).toBe('Auburn Alabama');
    });

    it('should handle empty string in searchQuery', () => {
      const { setSearchQuery } = useInterfaceStore.getState();
      setSearchQuery('test');
      setSearchQuery('');
      const state = useInterfaceStore.getState();
      expect(state.searchQuery).toBe('');
    });
  });

  describe('Jurisdiction State', () => {
    it('should initialize with null activeJurisdiction', () => {
      const state = useInterfaceStore.getState();
      expect(state.activeJurisdiction).toBeNull();
    });

    it('should set activeJurisdiction', () => {
      const { setActiveJurisdiction } = useInterfaceStore.getState();
      setActiveJurisdiction('AL-AUBURN-001');
      const state = useInterfaceStore.getState();
      expect(state.activeJurisdiction).toBe('AL-AUBURN-001');
    });

    it('should clear activeJurisdiction when set to null', () => {
      const { setActiveJurisdiction } = useInterfaceStore.getState();
      setActiveJurisdiction('AL-AUBURN-001');
      setActiveJurisdiction(null);
      const state = useInterfaceStore.getState();
      expect(state.activeJurisdiction).toBeNull();
    });
  });

  describe('Sovereign Flag State', () => {
    it('should initialize with isSovereign as false', () => {
      const state = useInterfaceStore.getState();
      expect(state.isSovereign).toBe(false);
    });

    it('should set isSovereign to true', () => {
      const { setIsSovereign } = useInterfaceStore.getState();
      setIsSovereign(true);
      const state = useInterfaceStore.getState();
      expect(state.isSovereign).toBe(true);
    });

    it('should toggle isSovereign', () => {
      const { setIsSovereign } = useInterfaceStore.getState();
      setIsSovereign(true);
      let state = useInterfaceStore.getState();
      expect(state.isSovereign).toBe(true);
      
      setIsSovereign(false);
      state = useInterfaceStore.getState();
      expect(state.isSovereign).toBe(false);
    });
  });

  describe('Confidence Score State', () => {
    it('should initialize with confidence as 0', () => {
      const state = useInterfaceStore.getState();
      expect(state.confidence).toBe(0);
    });

    it('should set confidence score', () => {
      const { setConfidence } = useInterfaceStore.getState();
      setConfidence(0.95);
      const state = useInterfaceStore.getState();
      expect(state.confidence).toBe(0.95);
    });

    it('should handle confidence between 0 and 1', () => {
      const { setConfidence } = useInterfaceStore.getState();
      setConfidence(0.5);
      let state = useInterfaceStore.getState();
      expect(state.confidence).toBe(0.5);
      
      setConfidence(1);
      state = useInterfaceStore.getState();
      expect(state.confidence).toBe(1);
    });
  });

  describe('Processing State', () => {
    it('should initialize with isProcessing as false', () => {
      const state = useInterfaceStore.getState();
      expect(state.isProcessing).toBe(false);
    });

    it('should update isProcessing', () => {
      const { setIsProcessing } = useInterfaceStore.getState();
      setIsProcessing(true);
      const state = useInterfaceStore.getState();
      expect(state.isProcessing).toBe(true);
    });
  });

  describe('Reset Function', () => {
    it('should reset all state to initial values', () => {
      const { setSearchQuery, setActiveJurisdiction, setIsSovereign, setConfidence, setIsProcessing, reset } = useInterfaceStore.getState();
      
      // Set all values
      setSearchQuery('Auburn Alabama');
      setActiveJurisdiction('AL-AUBURN-001');
      setIsSovereign(true);
      setConfidence(0.95);
      setIsProcessing(true);
      
      // Reset
      reset();
      
      const state = useInterfaceStore.getState();
      expect(state.searchQuery).toBe('');
      expect(state.activeJurisdiction).toBeNull();
      expect(state.isSovereign).toBe(false);
      expect(state.confidence).toBe(0);
      expect(state.isProcessing).toBe(false);
    });
  });

  describe('Multiple State Updates', () => {
    it('should handle concurrent state updates', () => {
      const { setSearchQuery, setActiveJurisdiction, setIsSovereign } = useInterfaceStore.getState();
      
      setSearchQuery('Auburn Alabama');
      setActiveJurisdiction('AL-AUBURN-001');
      setIsSovereign(true);
      
      const state = useInterfaceStore.getState();
      expect(state.searchQuery).toBe('Auburn Alabama');
      expect(state.activeJurisdiction).toBe('AL-AUBURN-001');
      expect(state.isSovereign).toBe(true);
    });
  });
});
