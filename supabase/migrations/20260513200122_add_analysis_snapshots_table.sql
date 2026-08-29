CREATE TABLE IF NOT EXISTS public.analysis_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID REFERENCES public.pipeline_runs(id),
  snapshot_id UUID REFERENCES public.snapshots(id),
  export_run_id UUID REFERENCES public.export_runs(id),
  snapshot_hash TEXT NOT NULL,
  sealed BOOLEAN NOT NULL DEFAULT FALSE,
  provenance_hash TEXT,
  export_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sealed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_pipeline_run
ON public.analysis_snapshots(pipeline_run_id);

CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_snapshot
ON public.analysis_snapshots(snapshot_id);

CREATE INDEX IF NOT EXISTS idx_analysis_snapshots_export_run
ON public.analysis_snapshots(export_run_id);

COMMENT ON TABLE public.analysis_snapshots IS
'Thin immutable binding layer connecting pipeline_runs, snapshots, export_runs, and deterministic provenance without replacing existing lineage systems.';
