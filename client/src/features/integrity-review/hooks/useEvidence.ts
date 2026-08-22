import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { error_message } from "../utils";

export function useEvidence() {
  const utils = trpc.useUtils();
  return trpc.integrity_routing.attach_evidence.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.integrity_routing.candidates.invalidate(),
        utils.integrity_routing.candidate_detail.invalidate(),
      ]);
      toast.success("Source evidence attached");
    },
    onError: (error: unknown) => toast.error(error_message(error)),
  });
}
