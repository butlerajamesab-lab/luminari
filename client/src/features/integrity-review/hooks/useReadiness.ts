import { trpc } from "@/lib/trpc";
import { POLLING_INTERVAL } from "../config";
import { projection_readiness_schema } from "../types";

export function useReadiness() {
  return trpc.integrity_routing.projection_readiness.useQuery(undefined, {
    refetchInterval: POLLING_INTERVAL,
    select: (data: unknown) => projection_readiness_schema.parse(data),
  });
}
