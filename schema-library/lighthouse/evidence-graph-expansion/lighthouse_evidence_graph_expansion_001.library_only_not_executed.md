Yes — the schema should be included in the total Lighthouse architecture package, but not run during this current backend-lock gate.

There are two separate questions:

1. Should that schema be included?

Yes.

That graph/workflow migration appears to belong to the expanded Lighthouse application architecture, specifically the deeper evidence/claim/graph layer.

It should be included as an expansion migration set, not as the immediate runtime fix.

Clean classification:

Lighthouse application schema package
├── Core runtime schema
│   └── tables/views/RPCs needed by current frontend/backend routes
│
├── Bridge/verified signal schema
│   └── atlas_lighthouse_signal_bridge_v1
│   └── v_atlas_lighthouse_bridge_v1_verified
│
├── Resource / community / map schema
│   └── resource tables, signal/resource views, map-facing views
│
├── Evidence / graph / workflow expansion schema
│   └── workflow_registry
│   └── graph_nodes
│   └── graph_edges
│   └── graph_paths
│   └── claim/gap/contradiction/evidence-link extensions
│
└── Future expansion sets
    └── Prism temporal, Esquire case bridge, Atlas resource bridge, etc.

So the answer is:

Include it in the Lighthouse schema library.
Do not execute it for the current runtime attachment gate.

2. Was it wrapped in metadata?

Partially, but not enough.

The pasted migration has good header metadata:

LUMINARI — INTEGRATION MIGRATION SCRIPT
Gap fixes + Graph Layer addition

All migrations are additive.
No tables dropped.
No existing columns altered.
Safe to run in sequence on the live schema.

Sections:
M-01 workflow_registry
M-02 live_stream_events
M-03 contradiction_records
M-04 gap_records
M-05 signal_cluster_links
M-06 claims
M-07 evidence_to_element_links
M-08 graph layer

That is useful human-readable metadata.

But it does not appear fully wrapped as a formal migration package with machine-checkable metadata such as:

migration_id
migration_name
target_application
target_project_ref
schema_layer
depends_on
execution_gate
run_status
rollback_notes
preflight_queries
postflight_queries
authorized_for_current_gate

For this system, it should be wrapped more explicitly before it gets stored or handed to Manus as runnable.

Correct handling

Tell him this:

Yes, include the graph/workflow migration in the Lighthouse schema expansion library.

But classify it as:

schema_layer = evidence_graph_expansion
execution_status = not_authorized_for_current_gate
current_gate = lighthouse_runtime_backend_lock
run_now = false

It is context/reference for now, not an approved migration.

Suggested metadata wrapper

Use this around the migration:

-- ============================================================
-- MIGRATION METADATA
-- ============================================================
-- migration_id: lighthouse_evidence_graph_expansion_001
-- migration_name: Gap fixes + Graph Layer addition
-- application: Lighthouse application
-- former_name: Luminari
-- target_project_ref: wepxlinwbjrkqdzkqpar
-- target_database: Supabase PostgreSQL
-- schema_layer: evidence_graph_expansion
-- execution_gate: future_graph_layer_activation
-- current_gate_authorized: false
-- current_gate: lighthouse_runtime_backend_lock
-- run_now: false
-- migration_type: additive
-- destructive_changes: false
-- tables_created:
--   - workflow_registry
--   - graph_nodes
--   - graph_edges
--   - graph_paths
-- views_created:
--   - snapshot_edge_engine_eligibility
-- tables_altered:
--   - live_stream_events
--   - contradiction_records
--   - gap_records
--   - signal_cluster_links
--   - claims
--   - evidence_to_element_links
-- depends_on_existing_tables:
--   - agencies_registry
--   - ingested_records
--   - claims
--   - signal_cluster_links
--   - snapshots
--   - cases
--   - pipeline_runs
--   - detected_signals
--   - stream_signal_flags
--   - quotes
--   - legal_statutes
--   - deadlines
--   - gap_records
--   - contradiction_records
--   - evidence_to_element_links
-- preflight_required: true
-- preflight_rule:
--   Verify all referenced tables/types exist before execution.
-- postflight_required: true
-- status: library_only_not_executed
-- ============================================================

What to communicate now

Clarification:

Yes, the graph/workflow migration should be retained as part of the Lighthouse application’s expansion schema set.

No, it should not be run during the current Lighthouse backend-lock gate.

It should be wrapped and stored as:

Lighthouse Evidence/Graph Expansion Migration
status = library_only_not_executed
run_now = false
current_gate_authorized = false

The current gate remains only:
Lighthouse application runtime
→ Supabase/Postgres conversion
→ health route
→ existing backend tables/views/RPCs
→ production URL lock

Do not confuse schema-library inclusion with execution approval.

That is the distinction: include in the architecture pack, exclude from current execution.