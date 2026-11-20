-- Tribal TDHE crosswalk v1: tribe <-> Tribally Designated Housing
-- Entity pairs parsed from the BIA tribal / TDHE contact list
-- (Tribe-TDHE-Contact-List-2026-08-13.pdf). Load-gated by the v7
-- hand-check (tdhe-work/HANDCHECK-V7-2026-11-20.md): only the
-- 314-row clean set loads; the 23 flagged rows stay out. Phone
-- values are stored as parsed (source-true, tier-3: the source
-- PDF prints some wrong area codes). No person-facing surface
-- reads this table; public display of tribal officials' phone
-- numbers remains a separate, unmade decision.
create table if not exists public.tribal_tdhe_crosswalk (
    crosswalk_id bigint generated always as identity primary key,
    tribe_name text not null,
    leader_name text,
    leader_title text,
    leader_phone text,
    tribe_address text,
    tribe_website text,
    tdhe_name text,
    tdhe_contact text,
    tdhe_title text,
    tdhe_phone text,
    tdhe_address text,
    tdhe_website text,
    bia_area_office text,
    source_doc text not null,
    source_page integer,
    load_batch text not null,
    loaded_at timestamptz not null default now()
);

create index if not exists tribal_tdhe_crosswalk_tribe_name_idx
    on public.tribal_tdhe_crosswalk (tribe_name);

comment on table public.tribal_tdhe_crosswalk is
    'Tribe <-> TDHE crosswalk parsed from the BIA TDHE contact list (2026-08-13). v7 clean set only (314 rows; hand-check gate passed 2026-11-20); flagged rows excluded. Internal crosswalk - no person-facing surface reads it.';
