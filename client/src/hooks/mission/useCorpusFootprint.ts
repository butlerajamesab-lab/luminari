import { useCallback, useEffect, useState } from "react";

export type CorpusFootprintPayload = {
  ok: boolean;
  contract: string;
  non_additive: boolean;
  doctrine: string;
  warning: string;
  stages: {
    atomic_source_records: {
      count: number;
      source_occurrences: number;
      artifacts_accounted: number;
      artifacts_completed: number;
      artifacts_failed: number;
      engine_version: string | null;
      status: string;
      run_id: string | null;
      receipt_hash: string | null;
      completed_at: string | null;
    };
    fresh_typed_candidates: {
      count: number;
      resource_candidates: number;
      candidate_types: number;
    };
    historical_coverage_oracle: {
      source_bound_resource_candidates: number;
      broad_resource_rows: number;
      canonical_resource_entities: number;
      canonical: false;
      purpose: string;
    };
    active_public_resource_snapshot: {
      count: number;
      held_identity_conflicts: number;
      snapshot_id: string | null;
      snapshot_version: string | null;
      receipt_hash: string | null;
      activated_at: string | null;
      canonical: true;
      scope: string;
    };
  };
  generated_at: string;
};

export function useCorpusFootprint() {
  const [data, setData] = useState<CorpusFootprintPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/corpus-footprint", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true || payload?.contract !== "luminari_corpus_footprint_v1") {
        throw new Error(payload?.message || payload?.error || `corpus_footprint_http_${response.status}`);
      }
      setData(payload as CorpusFootprintPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, isLoading, refetch };
}
