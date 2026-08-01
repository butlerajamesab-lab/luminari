import { useState } from "react";
import { useRoute } from "wouter";

import { useAuth } from "@/core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

/**
 * Bounded recovery control for the exact transition that follows source handoff.
 *
 * CivicGenome historically disabled its handoff button as soon as a Rosetta
 * source_document existed, while assembly correctly remained closed until the
 * deterministic extraction became completed and admissible. This route-scoped
 * control exposes the already-canonical full pipeline mutation only for that
 * bound-but-incomplete state. It does not create a second extraction path.
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
  const process_pipeline = trpc.civicGenome.process_docket_bill_through_rosetta.useMutation({
    onSuccess: async result => {
      set_operation_message(
        `Completed Rosetta run ${result.extraction.extraction_run_id} and Civic Genome assembly ${result.assembly.assembly_run_id}.`,
      );
      await Promise.all([
        pipeline.refetch(),
        utils.civicGenome.operating_contracts.invalidate(),
        utils.civicGenome.get_bill_by_source_id.invalidate(),
        utils.civicGenome.get_bill_detail.invalidate(),
      ]);
    },
  });

  const bound_but_incomplete = Boolean(
    pipeline.data?.source_document_id
      && (
        pipeline.data.run_status !== "completed"
        || !pipeline.data.can_assemble
      ),
  );

  if (!matches || !valid_source_bill_id || auth_loading || !is_admin || !bound_but_incomplete) {
    return null;
  }

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
        Source document {pipeline.data?.source_document_id} is bound, but extraction run {pipeline.data?.extraction_run_id ?? "not created"} is not yet completed and admissible.
      </div>
      <button
        type="button"
        disabled={process_pipeline.isPending}
        onClick={() => {
          if (source_bill_id === null) return;
          set_operation_message(null);
          process_pipeline.mutate({ source_bill_id });
        }}
        style={{
          marginTop: ".6rem",
          border: "1px solid #59d89c",
          borderRadius: 8,
          padding: ".58rem .8rem",
          background: "rgba(89,216,156,.12)",
          color: "#59d89c",
          cursor: process_pipeline.isPending ? "wait" : "pointer",
          fontFamily: "inherit",
          fontSize: ".68rem",
        }}
      >
        {process_pipeline.isPending
          ? "Running deterministic Rosetta extraction…"
          : "Run deterministic Rosetta extraction and assembly"}
      </button>
      {operation_message && (
        <div style={{ marginTop: ".5rem", color: "#59d89c", fontSize: ".64rem" }}>
          {operation_message}
        </div>
      )}
      {process_pipeline.error && (
        <div style={{ marginTop: ".5rem", color: "#ef8b8b", fontSize: ".64rem", overflowWrap: "anywhere" }}>
          Rosetta pipeline failed: {process_pipeline.error.message}
        </div>
      )}
    </aside>
  );
}
