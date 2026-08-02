-- Luminari omnidirectional graph hardening
-- Implements path scoring, explicit absence, authority weighting, temporal validity,
-- edge-shape constraints, contradiction clusters, deterministic fingerprints,
-- database invariants, multi-start traversal, action feasibility, health metrics,
-- and controlled domain-pack extensions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS omnidirectional_node_types (
  node_type text PRIMARY KEY,
  description text NOT NULL,
  requires_provenance boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS omnidirectional_edge_types (
  edge_type text PRIMARY KEY,
  description text NOT NULL,
  is_negative boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO omnidirectional_node_types (node_type, description) VALUES
  ('source', 'Raw source material'),
  ('quote', 'Source-anchored quotation'),
  ('event', 'Timeline event'),
  ('entity', 'Person, organization, institution, or actor'),
  ('claim', 'Structured claim'),
  ('finding', 'Validated finding'),
  ('pattern', 'Detected recurring structure'),
  ('signal', 'Accountable condition declaration'),
  ('statute', 'Statutory authority'),
  ('doctrine', 'Doctrine or governing rule'),
  ('workflow', 'Procedural workflow'),
  ('deadline', 'Time-bound requirement'),
  ('action', 'Available or instantiated action'),
  ('export', 'Generated output artifact'),
  ('outcome', 'Recorded resolution or outcome'),
  ('agency', 'Authority or responsible institution'),
  ('jurisdiction', 'Geographic or legal jurisdiction'),
  ('contradiction', 'Structured conflict between graph assertions'),
  ('absence', 'Explicitly recorded expected-but-missing relationship')
ON CONFLICT (node_type) DO NOTHING;

INSERT INTO omnidirectional_edge_types (edge_type, description, is_negative) VALUES
  ('supports', 'Source or evidence supports a claim or finding', false),
  ('contradicts', 'One assertion conflicts with another', false),
  ('belongs_to', 'Hierarchy or ownership relation', false),
  ('triggered_by', 'Condition or action is triggered by another node', false),
  ('governed_by', 'Node is governed by identified authority', false),
  ('routes_to', 'Node routes to a workflow, agency, or action', false),
  ('escalates_to', 'Node escalates to another authority or process', false),
  ('depends_on', 'Node depends on another node', false),
  ('derived_from', 'Node is derived from another node', false),
  ('located_in', 'Node belongs to a geography or jurisdiction', false),
  ('missing_edge', 'An expected relationship is absent', true),
  ('unresolved', 'No valid downstream resolution is currently available', true)
ON CONFLICT (edge_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS omnidirectional_domain_packs (
  pack_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_key text NOT NULL UNIQUE,
  pack_name text NOT NULL,
  version text NOT NULL,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  allowed_node_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_edge_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS omnidirectional_graph_snapshots (
  snapshot_hash text PRIMARY KEY,
  rules_version text NOT NULL,
  graph_version text NOT NULL,
  description text,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  node_count bigint,
  edge_count bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS omnidirectional_graph_nodes (
  node_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL REFERENCES omnidirectional_node_types(node_type),
  canonical_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance_ref jsonb NOT NULL,
  source_table text,
  source_id text,
  snapshot_hash text REFERENCES omnidirectional_graph_snapshots(snapshot_hash),
  version text NOT NULL DEFAULT '1.0.0',
  authority_level smallint NOT NULL DEFAULT 0 CHECK (authority_level BETWEEN 0 AND 10),
  feasibility_score numeric(6,5) CHECK (feasibility_score IS NULL OR feasibility_score BETWEEN 0 AND 1),
  valid_from timestamptz NOT NULL DEFAULT '-infinity'::timestamptz,
  valid_to timestamptz NOT NULL DEFAULT 'infinity'::timestamptz,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  UNIQUE (node_type, canonical_key, version),
  CHECK (valid_from < valid_to),
  CHECK (jsonb_typeof(provenance_ref) = 'object' AND provenance_ref <> '{}'::jsonb)
);

CREATE INDEX IF NOT EXISTS idx_omni_nodes_type ON omnidirectional_graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_omni_nodes_snapshot ON omnidirectional_graph_nodes(snapshot_hash);
CREATE INDEX IF NOT EXISTS idx_omni_nodes_validity ON omnidirectional_graph_nodes(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_omni_nodes_authority ON omnidirectional_graph_nodes(authority_level DESC);
CREATE INDEX IF NOT EXISTS idx_omni_nodes_source ON omnidirectional_graph_nodes(source_table, source_id);

CREATE TABLE IF NOT EXISTS omnidirectional_edge_constraints (
  from_node_type text NOT NULL REFERENCES omnidirectional_node_types(node_type),
  edge_type text NOT NULL REFERENCES omnidirectional_edge_types(edge_type),
  to_node_type text NOT NULL REFERENCES omnidirectional_node_types(node_type),
  enabled boolean NOT NULL DEFAULT true,
  description text,
  PRIMARY KEY (from_node_type, edge_type, to_node_type)
);

CREATE TABLE IF NOT EXISTS omnidirectional_graph_edges (
  edge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id uuid NOT NULL REFERENCES omnidirectional_graph_nodes(node_id) ON DELETE RESTRICT,
  to_node_id uuid NOT NULL REFERENCES omnidirectional_graph_nodes(node_id) ON DELETE RESTRICT,
  edge_type text NOT NULL REFERENCES omnidirectional_edge_types(edge_type),
  provenance_ref jsonb NOT NULL,
  snapshot_hash text REFERENCES omnidirectional_graph_snapshots(snapshot_hash),
  version text NOT NULL DEFAULT '1.0.0',
  weight numeric(8,5) NOT NULL DEFAULT 1 CHECK (weight >= 0),
  confidence numeric(6,5) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  valid_from timestamptz NOT NULL DEFAULT '-infinity'::timestamptz,
  valid_to timestamptz NOT NULL DEFAULT 'infinity'::timestamptz,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  UNIQUE (from_node_id, edge_type, to_node_id, version),
  CHECK (from_node_id <> to_node_id),
  CHECK (valid_from < valid_to),
  CHECK (jsonb_typeof(provenance_ref) = 'object' AND provenance_ref <> '{}'::jsonb)
);

CREATE INDEX IF NOT EXISTS idx_omni_edges_from ON omnidirectional_graph_edges(from_node_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_omni_edges_to ON omnidirectional_graph_edges(to_node_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_omni_edges_snapshot ON omnidirectional_graph_edges(snapshot_hash);
CREATE INDEX IF NOT EXISTS idx_omni_edges_validity ON omnidirectional_graph_edges(valid_from, valid_to);

CREATE TABLE IF NOT EXISTS omnidirectional_traversal_rulesets (
  ruleset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_key text NOT NULL UNIQUE,
  name text NOT NULL,
  version text NOT NULL,
  allowed_node_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_edge_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  max_depth integer NOT NULL CHECK (max_depth BETWEEN 0 AND 32),
  direction text NOT NULL CHECK (direction IN ('forward', 'backward', 'both')),
  stop_node_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  authority_weight numeric(8,5) NOT NULL DEFAULT 1,
  provenance_weight numeric(8,5) NOT NULL DEFAULT 1,
  snapshot_weight numeric(8,5) NOT NULL DEFAULT 1,
  distance_penalty numeric(8,5) NOT NULL DEFAULT 1,
  contradiction_penalty numeric(8,5) NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS omnidirectional_graph_paths (
  path_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_node_ids uuid[] NOT NULL,
  end_node_id uuid NOT NULL REFERENCES omnidirectional_graph_nodes(node_id),
  ruleset_id uuid NOT NULL REFERENCES omnidirectional_traversal_rulesets(ruleset_id),
  snapshot_hash text REFERENCES omnidirectional_graph_snapshots(snapshot_hash),
  as_of timestamptz NOT NULL,
  node_ids uuid[] NOT NULL,
  edge_ids uuid[] NOT NULL,
  path_depth integer NOT NULL CHECK (path_depth >= 0),
  path_score numeric(18,8) NOT NULL,
  result_hash text NOT NULL,
  materialized_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (result_hash)
);

CREATE INDEX IF NOT EXISTS idx_omni_paths_start ON omnidirectional_graph_paths USING gin(start_node_ids);
CREATE INDEX IF NOT EXISTS idx_omni_paths_end ON omnidirectional_graph_paths(end_node_id);
CREATE INDEX IF NOT EXISTS idx_omni_paths_ruleset_snapshot ON omnidirectional_graph_paths(ruleset_id, snapshot_hash);
CREATE INDEX IF NOT EXISTS idx_omni_paths_score ON omnidirectional_graph_paths(path_score DESC);

CREATE TABLE IF NOT EXISTS omnidirectional_contradiction_clusters (
  cluster_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_hash text REFERENCES omnidirectional_graph_snapshots(snapshot_hash),
  node_ids uuid[] NOT NULL,
  edge_ids uuid[] NOT NULL,
  support_count integer NOT NULL DEFAULT 0 CHECK (support_count >= 0),
  contradiction_count integer NOT NULL DEFAULT 0 CHECK (contradiction_count >= 0),
  severity numeric(12,6) GENERATED ALWAYS AS (
    contradiction_count::numeric / GREATEST(support_count, 1)
  ) STORED,
  cluster_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS omnidirectional_graph_health_snapshots (
  health_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_hash text REFERENCES omnidirectional_graph_snapshots(snapshot_hash),
  as_of timestamptz NOT NULL DEFAULT now(),
  claim_count bigint NOT NULL,
  claims_with_governing_authority bigint NOT NULL,
  actionable_node_count bigint NOT NULL,
  traceable_node_count bigint NOT NULL,
  active_node_count bigint NOT NULL,
  active_edge_count bigint NOT NULL,
  coverage_ratio numeric(12,8) NOT NULL,
  actionability_ratio numeric(12,8) NOT NULL,
  traceability_ratio numeric(12,8) NOT NULL,
  unresolved_count bigint NOT NULL,
  contradiction_edge_count bigint NOT NULL,
  metrics_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION omnidirectional_compute_node_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_hash := encode(
    digest(
      concat_ws('|', NEW.node_type, NEW.canonical_key, NEW.version, NEW.payload::text, NEW.provenance_ref::text,
        NEW.authority_level::text, NEW.feasibility_score::text, NEW.valid_from::text, NEW.valid_to::text),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION omnidirectional_compute_edge_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_hash := encode(
    digest(
      concat_ws('|', NEW.from_node_id::text, NEW.edge_type, NEW.to_node_id::text, NEW.version,
        NEW.provenance_ref::text, NEW.weight::text, NEW.confidence::text, NEW.valid_from::text, NEW.valid_to::text),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_omni_node_hash ON omnidirectional_graph_nodes;
CREATE TRIGGER trg_omni_node_hash
BEFORE INSERT OR UPDATE ON omnidirectional_graph_nodes
FOR EACH ROW EXECUTE FUNCTION omnidirectional_compute_node_hash();

DROP TRIGGER IF EXISTS trg_omni_edge_hash ON omnidirectional_graph_edges;
CREATE TRIGGER trg_omni_edge_hash
BEFORE INSERT OR UPDATE ON omnidirectional_graph_edges
FOR EACH ROW EXECUTE FUNCTION omnidirectional_compute_edge_hash();

CREATE OR REPLACE FUNCTION omnidirectional_enforce_edge_shape()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  from_type text;
  to_type text;
BEGIN
  SELECT node_type INTO from_type FROM omnidirectional_graph_nodes WHERE node_id = NEW.from_node_id;
  SELECT node_type INTO to_type FROM omnidirectional_graph_nodes WHERE node_id = NEW.to_node_id;

  IF NOT EXISTS (
    SELECT 1
    FROM omnidirectional_edge_constraints
    WHERE from_node_type = from_type
      AND edge_type = NEW.edge_type
      AND to_node_type = to_type
      AND enabled = true
  ) THEN
    RAISE EXCEPTION 'Forbidden omnidirectional edge shape: % -[%]-> %', from_type, NEW.edge_type, to_type;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_omni_edge_shape ON omnidirectional_graph_edges;
CREATE TRIGGER trg_omni_edge_shape
BEFORE INSERT OR UPDATE OF from_node_id, to_node_id, edge_type ON omnidirectional_graph_edges
FOR EACH ROW EXECUTE FUNCTION omnidirectional_enforce_edge_shape();

CREATE OR REPLACE FUNCTION omnidirectional_path_score(
  p_authority_sum numeric,
  p_provenance_count integer,
  p_snapshot_match_count integer,
  p_distance integer,
  p_contradiction_count integer,
  p_ruleset_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT
    (p_authority_sum * authority_weight)
    + (p_provenance_count * provenance_weight)
    + (p_snapshot_match_count * snapshot_weight)
    - (p_distance * distance_penalty)
    - (p_contradiction_count * contradiction_penalty)
  FROM omnidirectional_traversal_rulesets
  WHERE ruleset_id = p_ruleset_id AND enabled = true;
$$;

CREATE OR REPLACE FUNCTION omnidirectional_resolve(
  p_start_node_ids uuid[],
  p_ruleset_key text,
  p_snapshot_hash text DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
  node_id uuid,
  node_type text,
  depth integer,
  path_node_ids uuid[],
  path_edge_ids uuid[],
  path_score numeric,
  result_hash text
)
LANGUAGE sql
STABLE
AS $$
WITH RECURSIVE rules AS (
  SELECT *
  FROM omnidirectional_traversal_rulesets
  WHERE ruleset_key = p_ruleset_key AND enabled = true
), walk AS (
  SELECT
    n.node_id,
    n.node_type,
    0 AS depth,
    ARRAY[n.node_id]::uuid[] AS path_node_ids,
    ARRAY[]::uuid[] AS path_edge_ids,
    n.authority_level::numeric AS authority_sum,
    1 AS provenance_count,
    CASE WHEN p_snapshot_hash IS NULL OR n.snapshot_hash = p_snapshot_hash THEN 1 ELSE 0 END AS snapshot_match_count,
    0 AS contradiction_count
  FROM omnidirectional_graph_nodes n
  CROSS JOIN rules r
  WHERE n.node_id = ANY(p_start_node_ids)
    AND n.valid_from <= p_as_of AND p_as_of < n.valid_to
    AND n.superseded_at IS NULL
    AND (cardinality(r.allowed_node_types) = 0 OR n.node_type = ANY(r.allowed_node_types))
    AND (p_snapshot_hash IS NULL OR n.snapshot_hash IS NULL OR n.snapshot_hash = p_snapshot_hash)

  UNION ALL

  SELECT
    next_node.node_id,
    next_node.node_type,
    w.depth + 1,
    w.path_node_ids || next_node.node_id,
    w.path_edge_ids || e.edge_id,
    w.authority_sum + next_node.authority_level,
    w.provenance_count + 1,
    w.snapshot_match_count + CASE WHEN p_snapshot_hash IS NULL OR next_node.snapshot_hash = p_snapshot_hash THEN 1 ELSE 0 END,
    w.contradiction_count + CASE WHEN e.edge_type = 'contradicts' THEN 1 ELSE 0 END
  FROM walk w
  CROSS JOIN rules r
  JOIN omnidirectional_graph_edges e
    ON (
      (r.direction = 'forward' AND e.from_node_id = w.node_id)
      OR (r.direction = 'backward' AND e.to_node_id = w.node_id)
      OR (r.direction = 'both' AND (e.from_node_id = w.node_id OR e.to_node_id = w.node_id))
    )
  JOIN omnidirectional_graph_nodes next_node
    ON next_node.node_id = CASE WHEN e.from_node_id = w.node_id THEN e.to_node_id ELSE e.from_node_id END
  WHERE w.depth < r.max_depth
    AND NOT (next_node.node_id = ANY(w.path_node_ids))
    AND e.valid_from <= p_as_of AND p_as_of < e.valid_to
    AND next_node.valid_from <= p_as_of AND p_as_of < next_node.valid_to
    AND e.superseded_at IS NULL
    AND next_node.superseded_at IS NULL
    AND (cardinality(r.allowed_edge_types) = 0 OR e.edge_type = ANY(r.allowed_edge_types))
    AND (cardinality(r.allowed_node_types) = 0 OR next_node.node_type = ANY(r.allowed_node_types))
    AND (p_snapshot_hash IS NULL OR e.snapshot_hash IS NULL OR e.snapshot_hash = p_snapshot_hash)
    AND (p_snapshot_hash IS NULL OR next_node.snapshot_hash IS NULL OR next_node.snapshot_hash = p_snapshot_hash)
    AND NOT (w.node_type = ANY(r.stop_node_types))
)
SELECT
  w.node_id,
  w.node_type,
  w.depth,
  w.path_node_ids,
  w.path_edge_ids,
  omnidirectional_path_score(
    w.authority_sum,
    w.provenance_count,
    w.snapshot_match_count,
    w.depth,
    w.contradiction_count,
    r.ruleset_id
  ) AS path_score,
  encode(
    digest(
      concat_ws('|',
        array_to_string(w.path_node_ids, ','),
        array_to_string(w.path_edge_ids, ','),
        r.ruleset_key,
        r.version,
        coalesce(p_snapshot_hash, ''),
        p_as_of::text
      ),
      'sha256'
    ),
    'hex'
  ) AS result_hash
FROM walk w
CROSS JOIN rules r;
$$;

CREATE OR REPLACE FUNCTION omnidirectional_materialize_paths(
  p_start_node_ids uuid[],
  p_ruleset_key text,
  p_snapshot_hash text DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO omnidirectional_graph_paths (
    start_node_ids,
    end_node_id,
    ruleset_id,
    snapshot_hash,
    as_of,
    node_ids,
    edge_ids,
    path_depth,
    path_score,
    result_hash
  )
  SELECT
    p_start_node_ids,
    resolved.node_id,
    rules.ruleset_id,
    p_snapshot_hash,
    p_as_of,
    resolved.path_node_ids,
    resolved.path_edge_ids,
    resolved.depth,
    resolved.path_score,
    resolved.result_hash
  FROM omnidirectional_resolve(p_start_node_ids, p_ruleset_key, p_snapshot_hash, p_as_of) resolved
  JOIN omnidirectional_traversal_rulesets rules ON rules.ruleset_key = p_ruleset_key
  ON CONFLICT (result_hash) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION omnidirectional_capture_health(
  p_snapshot_hash text DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  result_id uuid := gen_random_uuid();
  v_claim_count bigint;
  v_claims_with_authority bigint;
  v_actionable_count bigint;
  v_traceable_count bigint;
  v_node_count bigint;
  v_edge_count bigint;
  v_unresolved_count bigint;
  v_contradiction_count bigint;
  v_metrics_hash text;
BEGIN
  SELECT count(*) INTO v_node_count
  FROM omnidirectional_graph_nodes
  WHERE valid_from <= p_as_of AND p_as_of < valid_to
    AND superseded_at IS NULL
    AND (p_snapshot_hash IS NULL OR snapshot_hash IS NULL OR snapshot_hash = p_snapshot_hash);

  SELECT count(*) INTO v_edge_count
  FROM omnidirectional_graph_edges
  WHERE valid_from <= p_as_of AND p_as_of < valid_to
    AND superseded_at IS NULL
    AND (p_snapshot_hash IS NULL OR snapshot_hash IS NULL OR snapshot_hash = p_snapshot_hash);

  SELECT count(*) INTO v_claim_count
  FROM omnidirectional_graph_nodes
  WHERE node_type = 'claim'
    AND valid_from <= p_as_of AND p_as_of < valid_to
    AND superseded_at IS NULL
    AND (p_snapshot_hash IS NULL OR snapshot_hash IS NULL OR snapshot_hash = p_snapshot_hash);

  SELECT count(DISTINCT e.from_node_id) INTO v_claims_with_authority
  FROM omnidirectional_graph_edges e
  JOIN omnidirectional_graph_nodes n ON n.node_id = e.from_node_id AND n.node_type = 'claim'
  WHERE e.edge_type = 'governed_by'
    AND e.valid_from <= p_as_of AND p_as_of < e.valid_to
    AND e.superseded_at IS NULL
    AND (p_snapshot_hash IS NULL OR e.snapshot_hash IS NULL OR e.snapshot_hash = p_snapshot_hash);

  SELECT count(DISTINCT e.from_node_id) INTO v_actionable_count
  FROM omnidirectional_graph_edges e
  JOIN omnidirectional_graph_nodes n ON n.node_id = e.to_node_id AND n.node_type = 'action'
  WHERE e.edge_type IN ('routes_to', 'escalates_to')
    AND e.valid_from <= p_as_of AND p_as_of < e.valid_to
    AND e.superseded_at IS NULL
    AND (p_snapshot_hash IS NULL OR e.snapshot_hash IS NULL OR e.snapshot_hash = p_snapshot_hash);

  SELECT count(*) INTO v_traceable_count
  FROM omnidirectional_graph_nodes
  WHERE provenance_ref <> '{}'::jsonb
    AND valid_from <= p_as_of AND p_as_of < valid_to
    AND superseded_at IS NULL
    AND (p_snapshot_hash IS NULL OR snapshot_hash IS NULL OR snapshot_hash = p_snapshot_hash);

  SELECT count(*) FILTER (WHERE edge_type = 'unresolved'),
         count(*) FILTER (WHERE edge_type = 'contradicts')
  INTO v_unresolved_count, v_contradiction_count
  FROM omnidirectional_graph_edges
  WHERE valid_from <= p_as_of AND p_as_of < valid_to
    AND superseded_at IS NULL
    AND (p_snapshot_hash IS NULL OR snapshot_hash IS NULL OR snapshot_hash = p_snapshot_hash);

  v_metrics_hash := encode(digest(concat_ws('|', p_snapshot_hash, p_as_of::text,
    v_claim_count, v_claims_with_authority, v_actionable_count, v_traceable_count,
    v_node_count, v_edge_count, v_unresolved_count, v_contradiction_count), 'sha256'), 'hex');

  INSERT INTO omnidirectional_graph_health_snapshots (
    health_snapshot_id, snapshot_hash, as_of, claim_count, claims_with_governing_authority,
    actionable_node_count, traceable_node_count, active_node_count, active_edge_count,
    coverage_ratio, actionability_ratio, traceability_ratio, unresolved_count,
    contradiction_edge_count, metrics_hash
  ) VALUES (
    result_id, p_snapshot_hash, p_as_of, v_claim_count, v_claims_with_authority,
    v_actionable_count, v_traceable_count, v_node_count, v_edge_count,
    CASE WHEN v_claim_count = 0 THEN 1 ELSE v_claims_with_authority::numeric / v_claim_count END,
    CASE WHEN v_node_count = 0 THEN 1 ELSE v_actionable_count::numeric / v_node_count END,
    CASE WHEN v_node_count = 0 THEN 1 ELSE v_traceable_count::numeric / v_node_count END,
    v_unresolved_count, v_contradiction_count, v_metrics_hash
  )
  ON CONFLICT (metrics_hash) DO NOTHING;

  RETURN result_id;
END;
$$;

-- Canonical baseline edge shapes. Domain packs may add explicit, reviewed extensions.
INSERT INTO omnidirectional_edge_constraints (from_node_type, edge_type, to_node_type, description) VALUES
  ('source', 'derived_from', 'source', 'Version or lineage relationship between sources'),
  ('source', 'supports', 'quote', 'Source contains a quote'),
  ('quote', 'supports', 'claim', 'Quote supports claim'),
  ('event', 'supports', 'claim', 'Event supports claim'),
  ('claim', 'governed_by', 'statute', 'Claim governed by statute'),
  ('claim', 'governed_by', 'doctrine', 'Claim governed by doctrine'),
  ('claim', 'contradicts', 'finding', 'Claim conflicts with finding'),
  ('finding', 'supports', 'pattern', 'Finding supports pattern'),
  ('pattern', 'triggered_by', 'signal', 'Signal contributes to pattern'),
  ('signal', 'located_in', 'jurisdiction', 'Signal has jurisdiction'),
  ('statute', 'routes_to', 'workflow', 'Statute authorizes workflow'),
  ('doctrine', 'routes_to', 'workflow', 'Doctrine authorizes workflow'),
  ('workflow', 'routes_to', 'agency', 'Workflow routes to agency'),
  ('workflow', 'depends_on', 'deadline', 'Workflow depends on deadline'),
  ('workflow', 'routes_to', 'action', 'Workflow exposes action'),
  ('action', 'escalates_to', 'agency', 'Action escalates to agency'),
  ('action', 'depends_on', 'deadline', 'Action depends on deadline'),
  ('export', 'derived_from', 'finding', 'Export derives from finding'),
  ('export', 'derived_from', 'claim', 'Export derives from claim'),
  ('outcome', 'derived_from', 'action', 'Outcome derives from action'),
  ('absence', 'missing_edge', 'claim', 'Recorded expected relation absent for claim'),
  ('claim', 'unresolved', 'absence', 'Claim has no valid resolution'),
  ('contradiction', 'contradicts', 'claim', 'Contradiction targets claim'),
  ('contradiction', 'contradicts', 'finding', 'Contradiction targets finding')
ON CONFLICT (from_node_type, edge_type, to_node_type) DO NOTHING;

INSERT INTO omnidirectional_traversal_rulesets (
  ruleset_key, name, version, allowed_node_types, allowed_edge_types,
  max_depth, direction, stop_node_types, authority_weight, provenance_weight,
  snapshot_weight, distance_penalty, contradiction_penalty
) VALUES (
  'constitutional_default',
  'Constitutional Default Omnidirectional Traversal',
  '1.0.0',
  ARRAY[]::text[],
  ARRAY['supports','contradicts','belongs_to','triggered_by','governed_by','routes_to','escalates_to','depends_on','derived_from','located_in','missing_edge','unresolved']::text[],
  8,
  'both',
  ARRAY['export','outcome']::text[],
  2.0,
  3.0,
  2.0,
  1.0,
  2.5
)
ON CONFLICT (ruleset_key) DO NOTHING;

COMMENT ON FUNCTION omnidirectional_resolve(uuid[], text, text, timestamptz)
IS 'Deterministic multi-start constrained traversal over typed, provenance-bound, temporally valid graph state.';

COMMENT ON TABLE omnidirectional_graph_paths
IS 'Materialized, ranked, replayable paths. result_hash binds sorted traversal state, ruleset version, snapshot, and as-of time.';

COMMENT ON TABLE omnidirectional_domain_packs
IS 'Controlled domain extensions. Packs may expand only explicitly registered node and edge types and must carry versioned constraints.';
