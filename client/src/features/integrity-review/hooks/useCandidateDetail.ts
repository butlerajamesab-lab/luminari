import { trpc } from "@/lib/trpc";
import { POLLING_INTERVAL } from "../config";
import { detail_projection_schema } from "../types";

export function useCandidateDetail(candidate_id: string) {
  return trpc.integrity_routing.candidate_detail.useQuery(
    { candidate_id },
    {
      enabled: candidate_id.length > 0,
      refetchInterval: POLLING_INTERVAL,
      select: (data: unknown) => detail_projection_schema.parse(data),
    },
  );
}
