import { trpc } from "@/lib/trpc";
import { POLLING_INTERVAL } from "../config";
import { candidate_list_schema } from "../types";

export function useCandidates() {
  return trpc.integrity_routing.candidates.useQuery(undefined, {
    refetchInterval: POLLING_INTERVAL,
    select: (data: unknown) => candidate_list_schema.parse(data),
  });
}
