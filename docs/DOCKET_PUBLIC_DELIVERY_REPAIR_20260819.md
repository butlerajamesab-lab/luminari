# Docket public delivery repair — 2026-08-19

## Fresh production evidence
The current PageSpeed audit of the Docket Room still loads the full Luminari application graph, including the roughly 1.23 MB full-App JavaScript chunk with about 997 KB reported unused. TBT remains bounded, which points to route delivery rather than canonical Docket computation as the first-paint bottleneck.

The same audit reports an absent main landmark and low-contrast Docket metadata/status text. The global viewport repair from PR #499 is already source-controlled independently.

## Bounded repair
- direct `/docket` and `/docket/:slug` loads select a dedicated Docket public shell;
- every non-Docket path remains on the complete application shell;
- the Docket public shell supplies the semantic main landmark;
- Docket query, cache, source, Legistar, bill-detail, submission, authentication, and persistence semantics remain unchanged.

## Follow-up boundary
Contrast-token changes remain a separate source-level repair after the route split is measured; they are not being hidden with generic CSS overrides.
