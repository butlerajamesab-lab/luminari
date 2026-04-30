import { trpc } from "../lib/trpc";

export function useUnifiedNodes({ caseId }: { caseId?: string }) {
  return trpc.unifiedOutput.getCaseUnifiedNodes.useQuery(
    { caseId: Number(caseId) },
    { enabled: !!caseId, staleTime: 60_000 }
  );
}
