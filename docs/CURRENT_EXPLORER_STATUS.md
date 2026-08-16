# Current Explorer Status

This branch establishes the backend contract required for whole-universe explorer surfaces.

Current legal-authority discovery reads from `public.v_lighthouse_legal_authority_catalog_v2` and exposes the complete filtered total independently from the current transport window.

Current graph discovery has paged node, edge, and unresolved-relationship readers. Existing small sample endpoints remain compatibility-only and are explicitly not universe counts.

The next consumer step is to move Doctrine Graph, Architecture Map, Did You Know, Claim/Proof, Barrier, Filing, Benefits, and other sparse reference surfaces onto these whole-universe contracts without relabeling unlike object classes or inventing unresolved identities.
