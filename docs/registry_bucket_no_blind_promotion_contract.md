# Registry Bucket No-Blind-Promotion Contract

This lane exists to make Lighthouse display and use its preserved registry substrate without breaking provenance.

## Required chain

```text
Supabase storage object
→ corpus/import queue
→ artifact manifest
→ extracted/staged unit
→ candidate disposition
→ canonical target/projection
→ promotion receipt/accounting
→ frontend/API surface
```

## Prohibited shortcuts

- Do not treat storage custody as canonical promotion.
- Do not treat parsed text as verified law.
- Do not use object ETags as content SHA-256.
- Do not silently merge duplicates.
- Do not overwrite canonical rows without explicit supersession.
- Do not make Prism, Kaleidoscope, Esquire, or Atlas consume raw bucket rows directly.

## This PR's bounded purpose

This PR does not finish all corpus promotion. It fixes the visible resource projection path so Lighthouse can show already-promoted live registry resources while the remaining custody and promotion gaps stay explicit.
