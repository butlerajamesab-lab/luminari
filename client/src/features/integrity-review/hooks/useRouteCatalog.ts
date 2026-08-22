import { trpc } from "@/lib/trpc";
import { route_catalog_schema } from "../types";

export function useRouteCatalog() {
  return trpc.integrity_routing.route_catalog.useQuery(undefined, {
    select: (data: unknown) => route_catalog_schema.parse(data),
  });
}
