import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { error_message } from "../utils";

export function useRefresh() {
  const utils = trpc.useUtils();
  return trpc.integrity_routing.sync_atlas_candidates.useMutation({
    onSuccess: async (result: { projected_count: number; candidate_ids: string[]; limit: number }) => {
      await Promise.all([
        utils.integrity_routing.projection_readiness.invalidate(),
        utils.integrity_routing.candidates.invalidate(),
        utils.integrity_routing.candidate_detail.invalidate(),
      ]);
      toast.success(
        result.projected_count > 0
          ? `${result.projected_count} Atlas candidate${result.projected_count === 1 ? "" : "s"} projected`
          : "Atlas projection is current",
      );
    },
    onError: (error: unknown) => toast.error(error_message(error)),
  });
}
