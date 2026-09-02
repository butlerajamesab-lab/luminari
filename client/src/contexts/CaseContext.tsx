import { trpc } from "@/lib/trpc";
import { useAuth } from "@/core/hooks/useAuth";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type CaseContextType = {
  currentCaseId: number | null;
  setCurrentCaseId: (id: number | null) => void;
  currentCase: { id: number; name: string; description: string | null; status: string; createdAt: number; updatedAt: number } | null;
  cases: { id: number; name: string; description: string | null; status: string; createdAt: number; updatedAt: number }[] | undefined;
  isLoading: boolean;
};

const CaseContext = createContext<CaseContextType>({
  currentCaseId: null,
  setCurrentCaseId: () => {},
  currentCase: null,
  cases: undefined,
  isLoading: false,
});

const CASE_KEY = "luminari-case-id";

export function CaseProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [currentCaseId, setCurrentCaseIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem(CASE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });

  // Only query cases when the user is authenticated — prevents the global
  // error handler from redirecting unauthenticated visitors to the login page
  // when they land on public pages like /lighthouse, /civic-map, /viewfinder.
  const { data: cases, isLoading: casesLoading } = trpc.cases.list.useQuery(undefined, {
    retry: 1,
    refetchOnWindowFocus: false,
    enabled: isAuthenticated,
  });

  const isLoading = authLoading || (isAuthenticated && casesLoading);

  // Auto-select first case if none selected
  useEffect(() => {
    if (!isLoading && cases && cases.length > 0 && !currentCaseId) {
      setCurrentCaseIdState(cases[0].id);
      localStorage.setItem(CASE_KEY, cases[0].id.toString());
    }
  }, [cases, isLoading, currentCaseId]);

  const setCurrentCaseId = (id: number | null) => {
    setCurrentCaseIdState(id);
    if (id) {
      localStorage.setItem(CASE_KEY, id.toString());
    } else {
      localStorage.removeItem(CASE_KEY);
    }
  };

  const visibleCases = isAuthenticated ? cases : undefined;
  const currentCase = visibleCases?.find(c => c.id === currentCaseId) ?? null;
  const visibleCurrentCaseId = isAuthenticated ? currentCaseId : null;

  return (
    <CaseContext.Provider value={{ currentCaseId: visibleCurrentCaseId, setCurrentCaseId, currentCase, cases: visibleCases, isLoading }}>
      {children}
    </CaseContext.Provider>
  );
}

export function useCase() {
  return useContext(CaseContext);
}
