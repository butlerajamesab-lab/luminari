# Civic Genome public performance repair — 2026-08-19

Production PageSpeed evidence for `https://lighthouse.columbiacitycustomllc.com/civic-genome` showed a 1.23 MB initial JavaScript asset with approximately 999 KB unused, FCP/LCP 8.7 s, performance 57, accessibility 93, SEO 82, invalid robots.txt, and Agentic Browsing 2/3.

This repair is delivery/presentation only. It does not change Civic Genome, Rosetta, Prism, Kaleidoscope, Docket, or Atlas truth semantics.

Bounded changes:

- load a Civic-Genome-only application shell for `/civic-genome` and `/civic-genome/bill/:bill_id`; other routes continue loading the full application;
- preserve existing providers and Civic Genome export controls in the lightweight shell;
- defer the upload transport compatibility script so its network request does not block parser/first paint;
- restore user zoom by removing `maximum-scale=1`;
- add a public meta description;
- serve explicit `robots.txt` and `llms.txt` assets from the existing Vite public directory;
- keep API and privileged application surfaces out of crawler instructions.

No database migration, API contract, authorization policy, queue behavior, deterministic identity, source hash, receipt, projection, or persistence rule is changed.
