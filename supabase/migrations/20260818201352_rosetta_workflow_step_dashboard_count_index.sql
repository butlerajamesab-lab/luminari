begin

set local lock_timeout = '1s'

set local statement_timeout = '20s'

create index if not exists workflow_step_dashboard_count_idx on public.workflow_step (step_order)

comment on index public.workflow_step_dashboard_count_idx is 'Narrow exact-count path for Rosetta dashboard workflow_step cardinality; no semantic or canonical ownership change.'

commit
