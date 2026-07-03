# RuntimeEnvelope phase 1 compatibility notes

Phase 1 establishes `RuntimeEnvelope` as the governed runtime response boundary at server router/procedure exit for ingestion-control.

## Reference producers migrated

- REST: `server/routes/ingestion_control_router.ts`
- tRPC: `server/routers/ingestion-control-router.ts`

Both surfaces now return the canonical envelope fields:

- `success`
- `source`
- `action` when applicable
- `data`
- `state.availability`
- `state.dry_run` when applicable
- `state.can_apply` when applicable
- `state.blockers`
- `diagnostics.errors`
- `diagnostics.warnings`
- `diagnostics.backend` when available
- `counts` when numeric transport counts are available
- `flags` when runtime feature/apply flags are available
- `meta` when a route provides additional transport metadata

## Backward compatibility

Existing ingestion-control payload fields remain at the top level during Phase 1. The top-level fields are emitted from the same server exit wrapper that creates the canonical envelope so existing UI behavior can continue while consumers migrate to `data`, `state`, `diagnostics`, `counts`, and `flags`.

## Render safety remains client-side only

`client/src/lib/data-guard.ts` remains a render-safety layer. It is not used as runtime contract enforcement and no additional producer normalization was pushed into the UI.

## Producers not yet migrated

The audit identifies these remaining runtime producers for later phases:

- general ingestion tRPC runtime procedures in `server/routers/ingestion.ts`
- Mission Control runtime convergence and compatibility routers
- operational-core runtime services and routers
- architecture-map runtime service/router responses
- registry/lens runtime normalization consumers
- external extraction/promotion script stdout contracts beyond the ingestion-control router boundary
- promotion/verification shared summary subcontracts outside the ingestion-control transport wrapper
