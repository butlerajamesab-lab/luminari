# Legal Explorer Production Query Benchmark

Production Supabase project: `wepxlinwbjrkqdzkqpar`

The current legal/civic explorer query was benchmarked read-only against `v_lighthouse_graph_nodes_v1` with the default explorer node types and a 260-node diverse transport window.

Observed execution time: approximately **1.15 seconds**.

The query matched **36,716 current nodes** while returning only the 260-node rendering window. The window is round-robin ranked by node type so one large class cannot crowd every other class out of the initial working graph.

This benchmark establishes that full-universe discovery and bounded rendering are compatible with the production 8-second query timeout. It does not imply that only 260 nodes exist or are discoverable.
