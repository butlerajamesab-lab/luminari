import { z } from "zod";
import { router, adminProcedure as admin_procedure } from "../_core/trpc";

export const batch_source_router = router({
  queue_batch_source_observations: admin_procedure
    .input(z.object({ artifact_keys: z.array(z.string().startsWith("Batch/").max(1000)).min(1).max(500) }))
    .mutation(async ({ input }) => {
      const { getPool: get_pool } = await import("../db");
      const { queue_fresh_atomic_corpus_pass } = await import("../services/fresh-corpus-atomic-v1");
      await get_pool().query("select public.sync_luminari_corpus_source_manifest_v2()");
      const available = await get_pool().query(`select artifact_key from public.luminari_corpus_source_artifact_v1
        where bucket_id='Batch' and storage_state='active' and artifact_key=any($1::text[])`, [input.artifact_keys]);
      if (available.rowCount !== new Set(input.artifact_keys).size) throw new Error("batch_manifest_source_missing");
      return queue_fresh_atomic_corpus_pass({ bucket_ids: ["Batch"], artifact_keys: [...new Set(input.artifact_keys)].sort() });
    }),

  get_batch_source_lineage: admin_procedure
    .input(z.object({ artifact_key: z.string().startsWith("Batch/").max(1000), resource_id: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(200).optional() }))
    .query(async ({ input }) => {
      const { read_batch_source_lineage } = await import("../services/batch-source-lineage");
      return read_batch_source_lineage(input);
    }),

});
