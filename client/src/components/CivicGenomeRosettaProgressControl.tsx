import { useState } from "react";
import { useRoute } from "wouter";

import { useAuth } from "@/core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export type rosetta_progress_action = "extract_and_assemble" | "assemble_only" | null;

export function get_rosetta_progress_action(
  contract_state: string | null | undefined,
): rosetta_progress_action {
  if (contract_state === "waiting_for_extraction") return "extract_and_assemble";
  if (contract_state === "ready_for_assembly") return "assemble_only";
  return null;
}

/**
 * Bounded recovery control for the exact transition that follows source handoff.
 *
 * The server contract distinguishes extraction work from assembly work. Completed
 * and already-assembled runs never render an action, so this control cannot
 * accidentally invoke Rosetta again merely because `can_assemble` is false.
 */
export function CivicGenomeRosettaProgressControl() {
  const [matches, params] = useRoute("/civic-genome/bill/:bill_id");
  const { isAuthenticated, loading: auth_loading } = useAuth();
  const [operation_message, set_operation_message] = useState<string | null>(null);

  const source_bill_id = params?.bill_id ? Number(params.bill_id) : null;
  const valid_source_bill_id = source_bill_id !== null
    && Number.isSafeInteger(source_bill_id)
    && source_bill_id > 0;

  const auth_identity = trpc.auth.me.useQuery(undefined, {
    enabled: matches && isAuthenticated && !auth_loading,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const is_admin = isAuthenticated && auth_identity.data?.role === "admin";

  const pipeline = trpc.civicGenome.get_rosetta_pipeline_status.useQuery(
    { source_bill_id: source_bill_id ?? 0 },
    {
      enabled: matches && valid_source_bill_id && is_admin,
      retry: false,
      refetchOnWindowFocus: false,
    },
  );
  const utils = trpc.useUtils();

  const refresh_pipeline_state = async () => {
    await Promise.all([
      pipeline.refetch(),
      utils.civicGenome.operating_contracts.invalidate(),
      utils.civicGenome.get_bill_by_source_id.invalidate(),
      utils.civicGenome.get_bill_detail.invalidate(),
    ]);
  };

  const process_pipeline = trpc.civicGenome.process_docket_bill_through_rosetta.useMutation({
    onSuccess: async result => {
      set_operation_message(
        `Completed Rosetta run ${result.extraction.extraction_run_id} and Civic Genome assembly ${result.assembly.assembly_run_id}.`,
      );
      await refresh_pipeline_state();
    },
  });

  const assemble_pipeline = trpc.civicGenome.assemble_rosetta_structural_dna.useMutation({
    onSuccess: async result => {
      set_operation_message(
        `Completed Civic Genome assembly ${result.assembly_run_id} from the existing Rosetta extraction.`,
      );
      await refresh_pipeline_state();
    },
  });

  const progress_action = get_rosetta_progress_action(pipeline.data?.contract_state);

  if (!matches || !valid_source_bill_id || auth_loading || !is_admin || !progress_action) {
    return null;
  }

  const mutation_pending = process_pipeline.isPending || assemble_pipeline.isPending;
  const mutation_error = process_pipeline.error ?? assemble_pipeline.error;
  const button_label = progress_action === "assemble_only"
    ? mutation_pending
      ? "Assembling completed Rosetta extraction…"
      : "Assemble completed Rosetta extraction"
    : mutation_pending
      ? "Running deterministic Rosetta extraction…"
      : "Run deterministic Rosetta extraction and assembly";

  return (
    <aside
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "5.5rem",
        transform: "translateX(-50%)",
        zIndex: 1000,
        width: "min(92vw, 720px)",
        padding: ".75rem",
        borderRadius: 12,
        border: "1px solid rgba(89,216,156,.55)",
        background: "rgba(8,17,15,.97)",
        boxShadow: "0 14px 44px rgba(0,0,0,.45)",
        color: "#edf7f2",
        fontFamily: "'IBM Plex Mono', monospace",
      }}
    >
      <div style={{ fontSize: ".66rem", color: "#59d89c", textTransform: "uppercase" }}>
        Exact Rosetta transition
      </div>
      <div style={{ marginTop: ".35rem", fontFamily: "'Inter', system-ui, sans-serif", fontSize: ".76rem", lineHeight: 1.45, color: "#91a9a0" }}>
        {pipeline.data?.contract_message}
      </div>
      <button
        type="button"
        disabled={mutation_pending}
        onClick={() => {
          if (source_bill_id === null) return;
          set_operation_message(null);

          if (progress_action === "assemble_only") {
            const genome_bill_id = pipeline.data?.genome_bill_id;
            const source_document_id = pipeline.data?.source_document_id;
            const extraction_run_id = pipeline.data?.extraction_run_id;
            if (!genome_bill_id || source_document_id === null || extraction_run_id === null) {
              return;
            }
            assemble_pipeline.mutate({
              genome_bill_id,
              source_document_id,
              extraction_run_id,
            });
            return;
          }

          process_pipeline.mutate({ source_bill_id });
        }}
        style={{
          marginTop: ".6rem",
          border: "1px solid #59d89c",
          borderRadius: 8,
          padding: ".58rem .8rem",
          background: "rgba(89,216,156,.12)",
          color: "#59d89c",
          cursor: mutation_pending ? "wait" : "pointer",
          fontFamily: "inherit",
          fontSize: ".68rem",
        }}
      >
        {button_label}
      </button>
      {operation_message && (
        <div style={{ marginTop: ".5rem", color: "#59d89c", fontSize: ".64rem" }}>
          {operation_message}
        </div>
      )}
      {mutation_error && (
        <div style={{ marginTop: ".5rem", color: "#ef8b8b", fontSize: ".64rem", overflowWrap: "anywhere" }}>
          Rosetta transition failed: {mutation_error.message}
        </div>
      )}
    </aside>
  );
}
