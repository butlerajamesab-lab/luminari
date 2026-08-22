import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { error_message } from "../utils";

export function useTransition() {
  const utils = trpc.useUtils();
  return trpc.integrity_routing.transition_candidate.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.integrity_routing.candidates.invalidate(),
        utils.integrity_routing.candidate_detail.invalidate(),
      ]);
      toast.success("Lifecycle transition recorded");
    },
    onError: (error: unknown) => toast.error(error_message(error)),
  });
}
