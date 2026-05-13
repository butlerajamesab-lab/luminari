import { create } from 'zustand';

/**
 * Interface Store: Single Source of Truth
 * 
 * This store manages all jurisdiction and search state in one place.
 * No redundancy. No duplicate state plumbing. Just the essentials.
 */

export interface InterfaceState {
  // Search Query State
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Jurisdiction Result State
  activeJurisdiction: string | null;
  setActiveJurisdiction: (jurisdiction: string | null) => void;

  // Sovereign Flag State
  isSovereign: boolean;
  setIsSovereign: (isSovereign: boolean) => void;

  // Confidence Score (for matching accuracy)
  confidence: number;
  setConfidence: (confidence: number) => void;

  // Processing State (forensic engine active)
  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;

  // Reset all state
  reset: () => void;
}

export const useInterfaceStore = create<InterfaceState>((set) => ({
  // Initial state
  searchQuery: '',
  activeJurisdiction: null,
  isSovereign: false,
  confidence: 0,
  isProcessing: false,

  // Setters
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setActiveJurisdiction: (jurisdiction: string | null) => set({ activeJurisdiction: jurisdiction }),
  setIsSovereign: (isSovereign: boolean) => set({ isSovereign }),
  setConfidence: (confidence: number) => set({ confidence }),
  setIsProcessing: (isProcessing: boolean) => set({ isProcessing }),

  // Reset
  reset: () => set({
    searchQuery: '',
    activeJurisdiction: null,
    isSovereign: false,
    confidence: 0,
    isProcessing: false,
  }),
}));
