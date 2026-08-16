# Legal Explorer Relationship Policy

The explorer renders only relationships already present in governed graph or doctrine relationship stores.

Current graph relationships come from `v_lighthouse_graph_edges_v2`.

`within_jurisdiction` is structural context. Semantic relationship types retain their existing evidence state. `sourced_from` is omitted from the default visual working graph to prevent source-artifact tethers from overwhelming civic/legal relationships; source locators remain visible on node detail.

Doctrine reference edges come from `doctrine_graph_edges` and remain marked as reference relationships.

No fuzzy-match relationship generation is performed in the browser or legal explorer read model.
