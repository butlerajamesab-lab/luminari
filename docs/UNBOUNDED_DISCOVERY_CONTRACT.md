# Unbounded Discovery Contract

Luminari must not confuse a transport/render window with the size of a civic, legal, resource, workflow, signal, or graph universe.

## Canonical rule

Every qualifying current record remains discoverable through deterministic search, filters, pagination/cursors, graph traversal, or an explicit unresolved/held queue.

A page-size or API `limit` may control only one response window. It may not:

- redefine the total universe;
- silently omit records from whole-universe counts;
- imply that the visible graph neighborhood is the entire graph;
- convert unresolved records into absence;
- cap ontology growth to a seeded catalog size;
- treat a legacy/reference sample as canonical completion.

## Required response semantics

Whole-universe readers expose at least:

- `total`: the complete filtered universe count;
- `limit`: the current transport window size;
- `offset` or a cursor: the current position;
- `items`: the current window;
- an explicit marker that the response is a window, not the universe.

## Graph semantics

Large graphs are explored by neighborhood expansion, filters, search, and paged node/edge reads. Rendering a manageable subgraph is a client concern and must never truncate the canonical graph substrate.

## Ontology semantics

Seeded registries such as the legacy doctrine registry are curated anchors, not ceilings. New source-supported doctrines, standards, tests, defenses, procedural prerequisites, remedies, limitations, burdens, immunities, preclusion rules, jurisdictional rules, review standards, and related legal concepts may enter the governed ontology when their source identity and provenance are sufficient.

## Unresolved records

If identity, parsing, jurisdiction, or relationship resolution is incomplete, the record remains visible as unresolved/held. It is not silently discarded and is not guessed into a false canonical identity.
