import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { error_message } from "../utils";

export function useDraft() {
  const utils = trpc.useUtils();
  return trpc.integrity_routing.create_escalation_draft.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.integrity_routing.candidates.invalidate(),
        utils.integrity_routing.candidate_detail.invalidate(),
      ]);
      toast.success("Draft review packet created — nothing was transmitted");
    },
    onError: (error: unknown) => toast.error(error_message(error)),
  });
}
