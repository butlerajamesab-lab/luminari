# Sovereign Continuity Core

Sovereign Control is Luminari's independent continuity surface. Its minimum operating contract is:

1. An operator action and its receipt must report separately and truthfully.
2. Administrative receipts use the live PostgreSQL `admin_change_log` column contract.
3. Constitutional governance remains distinct from legacy case-level governance controls.
4. Schema inspection and SQL execution use PostgreSQL result contracts and validated public-schema identifiers.
5. Cryptographic governance snapshots are append-only checkpoints.
6. Export and restore must not depend on another platform surface being operational.

This document records the boundary; focused CI enforces the executable portions of it. Export and restore reconciliation proceeds as the next bounded continuity pass.
