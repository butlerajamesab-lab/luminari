# Luminari Naming and Ownership Doctrine

This doctrine permanently governs naming and ownership across the Luminari universe. It is not a one-off cleanup rule, and it does not grandfather existing drift.

## Purpose

The purpose of this doctrine is to eliminate ownership ambiguity and stop recurring `camelCase` drift in owned Luminari contracts.

## Platform Ownership

The Luminari universe consists of five owned platforms:

- Lighthouse
- Prism
- Rosetta
- Esquire
- Atlas

Everything inside those five platforms is owned. There are no internal third-party systems. Existing code, historical payloads, old aliases, compatibility surfaces, and prior runtime behavior do not become exceptions because they already exist.

Calls between these platforms are owned contracts. Generated artifacts produced by these platforms are owned contracts.

The following are also owned when produced, transformed, routed, stored, returned, or consumed by Lighthouse, Prism, Rosetta, Esquire, or Atlas:

- internal bridges
- projections
- workers
- routers
- scripts
- helpers
- reports
- diagnostics
- API responses
- SQL aliases
- migrations
- candidate payloads
- conveyor metadata
- staging outputs
- canonical outputs
- UI state
- runtime contracts

Owned means `snake_case`.

No exceptions.

## External Boundary Rule

The only acceptable `camelCase` is where an external authority requires the exact identifier.

Examples include:

- language/runtime APIs
- browser APIs
- Node.js APIs
- database driver option names
- package APIs
- vendor APIs

Do not rename externally required identifiers.

Do not hide externally required identifiers behind computed properties, bracket access, string concatenation, or any other grep-evasion technique.

Leave externally required identifiers exactly as required by the external authority.

## Legacy Input Rule

Legacy `camelCase` payloads may be read only at the boundary. Legacy means an input shape that must still be accepted temporarily so current consumers do not break; it does not mean the casing may stay in owned runtime.

Normalize legacy input immediately into `snake_case` before it enters owned runtime. Existing legacy drift must be converted or isolated at the boundary when touched; do not cite existing behavior as a reason to preserve owned `camelCase`.

Never emit `camelCase` into owned runtime.

Never propagate `camelCase` deeper into the pipeline.

## Review Rule

For every `camelCase` occurrence, ask:

1. Is this owned by Lighthouse, Prism, Rosetta, Esquire, or Atlas?
2. If yes, convert it to `snake_case`; the fact that it already exists is not a reason to keep it.
3. If no, identify the exact external authority requiring the casing.
4. If no external authority can be named, it is owned and must be converted.

If ownership is uncertain, stop and inspect the repository until ownership is determined. Do not guess. Do not invent exceptions.

## Pull Request Requirements

Every pull request touching the repository must confirm all of the following:

- owned `camelCase` fixed, including existing or legacy owned occurrences touched by the change
- external-required `camelCase` documented
- legacy input normalized at the boundary and not re-emitted
- no computed-property evasion
- no grep suppression tricks
- no new `camelCase` introduced

## Enforcement Goal

The repository must move monotonically toward a state where all owned Luminari code uses `snake_case`: no pull request may preserve touched owned `camelCase` merely because it was pre-existing or legacy.

The only remaining `camelCase` should exist because an external authority explicitly requires it.

No future contributor should need to debate ownership or naming again because this doctrine governs the repository.
