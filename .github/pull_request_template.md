## Summary

-

## Naming and Ownership Doctrine Checklist

Every pull request touching the repository must satisfy the Luminari Naming and Ownership Doctrine in `docs/LUMINARI_NAMING_OWNERSHIP_DOCTRINE.md`.

- [ ] Owned `camelCase` fixed, including existing or legacy owned occurrences touched by this change; no occurrence is kept merely because it already existed.
- [ ] External-required `camelCase` documented with the exact external authority requiring the casing.
- [ ] Legacy `camelCase` input normalized at the boundary before entering owned runtime and never re-emitted as an owned contract.
- [ ] No computed-property evasion used to hide naming drift.
- [ ] No grep suppression tricks used.
- [ ] No new owned `camelCase` introduced.

If ownership is uncertain, stop and inspect the repository before merging. Existing or legacy casing is not an exception.

## Testing

-
