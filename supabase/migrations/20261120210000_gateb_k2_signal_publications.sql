-- Gate B Kernel 2 — Transparency publication record (2026-11-20).
--
-- Publication is a governed act DISTINCT from promotion. Promotion
-- (governance_status = 'promoted' on public.live_data_signals) is the
-- gate's acceptance: the signal becomes eligible. Publication is the
-- second, separate act that puts one promoted signal's plain-language
-- explainer on the public surface. Promoted is never auto-public.
--
-- This table is the record of that act. One row per publish act:
--   live_data_signal_id — the promoted row on public.live_data_signals
--                         (uuid, the canonical store's primary key);
--   signal_hash         — the signal's court-grade identity hash at
--                         publish time (binds the act to the exact
--                         signal version that was published);
--   published_at        — epoch milliseconds;
--   published_by        — SHA-256 hash of the acting admin's identity
--                         (the governance log's actor-hash recipe; the
--                         raw identity is never stored);
--   unpublished_at      — epoch milliseconds, null while the
--                         publication is active;
--   governance_seq_no   — seq_no of the governance_log entry written
--                         in the same transaction as the latest act on
--                         this row (signal_published at insert,
--                         signal_unpublished at withdrawal), so the
--                         public act is traceable into the sealed log.
--
-- The public read is publications ⋈ currently-promoted current rows,
-- so a signal that is demoted, rejected, or superseded falls off the
-- public surface on its own — no cleanup write is required for the
-- public surface to stay truthful.
--
-- A partial unique index gives the kernel a durable guarantee: at
-- most one ACTIVE publication per signal. Re-publishing after an
-- unpublish inserts a new row (a new act, a new log entry); history
-- is never rewritten.

create table if not exists public.signal_publications (
  id serial primary key,
  live_data_signal_id uuid not null,
  signal_hash varchar(64) not null,
  published_at bigint not null,
  published_by varchar(64) not null,
  unpublished_at bigint,
  governance_seq_no bigint
);

create index if not exists idx_sp_signal on public.signal_publications (live_data_signal_id);
create index if not exists idx_sp_published_at on public.signal_publications (published_at desc);

-- Kernel guarantee: one active publication per signal.
create unique index if not exists idx_sp_one_active_per_signal
  on public.signal_publications (live_data_signal_id)
  where unpublished_at is null;
