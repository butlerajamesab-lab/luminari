-- Tribal council gate, v1.
--
-- Every Recognition Atlas page belongs to the nation it describes. Luminari
-- is the vessel; the nation is the author. This schema moves the gate that
-- used to live only in the browser (client/src/gates/section_lock.ts) into
-- the database, where it can actually hold:
--
--   * every section starts locked_pending_tribe_review and not public;
--   * a section is public only when the nation's own council unlocks it;
--   * the council can confirm, correct, restrict, replace or reject any
--     field, add or rename sections, reorder its page, set its language,
--     revoke any permission it gave, or withdraw entirely;
--   * every council decision is kept, append-only, and applied by one
--     function so the page always matches the decision record;
--   * Luminari's own interpretation is allowed in one place only: the
--     route_to_recognition section, labelled lighthouse_analysis;
--   * letters to each council (to the address the nation publishes) are
--     drafted, approved and logged here;
--   * every read of non-public material is logged (who saw what, when).
--
-- Additive only. Nothing existing is altered. No data is loaded here; the
-- nations' existing seed records are imported by a separate, reviewed step.
-- Nothing in this schema is readable by anon or authenticated roles; the
-- server reads it with the service role and enforces access per nation.

create schema if not exists tribal_council_gate;
revoke all on schema tribal_council_gate from public, anon, authenticated;
grant usage on schema tribal_council_gate to service_role;

-- Sections a page can have. The council may add its own (added_by='council').
create table tribal_council_gate.section (
  nation_key text not null references public.native_nation_registry_v1 (nation_key),
  section_key text not null check (section_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  title text not null,
  display_order integer not null,
  added_by text not null check (added_by in ('platform', 'council')),
  lock_status text not null default 'locked_pending_tribe_review' check (
    lock_status in (
      'locked_pending_tribe_review',
      'locked_tribe_requested',
      'unlocked_tribe_approved',
      'partial_unlock'
    )
  ),
  public_display_permitted boolean not null default false,
  removed_by_council boolean not null default false,
  updated_at timestamptz not null default now(),
  last_decision_id bigint,
  primary key (nation_key, section_key),
  -- Public display is never on unless the council has unlocked the section.
  constraint section_public_requires_unlock check (
    public_display_permitted = false
    or lock_status in ('unlocked_tribe_approved', 'partial_unlock')
  )
);

-- One row per field value. Values are never edited in place: a correction
-- or replacement adds a new row and points the old one at it.
create table tribal_council_gate.field (
  field_id bigint generated always as identity primary key,
  nation_key text not null,
  section_key text not null,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  value_text text not null,
  language_tag text,
  source_posture text not null check (
    source_posture in (
      'verbatim_tribal_source',
      'structured_extraction_from_tribal_source',
      'structured_extraction_from_public_record',
      'external_source',
      'council_authored',
      'lighthouse_analysis_pending_tribal_review'
    )
  ),
  citation_url text,
  citation_title text,
  capture_id bigint references public.native_nation_site_capture_v1 (capture_id),
  display_order integer not null default 0,
  field_state text not null default 'pending_review' check (
    field_state in ('pending_review', 'confirmed', 'restricted', 'rejected', 'superseded')
  ),
  superseded_by bigint references tribal_council_gate.field (field_id),
  created_at timestamptz not null default now(),
  created_by_decision_id bigint,
  foreign key (nation_key, section_key)
    references tribal_council_gate.section (nation_key, section_key),
  -- The platform speaks only in the route to recognition. Everywhere else
  -- it carries the nation's own words or a cited record.
  constraint field_analysis_only_in_route check (
    source_posture <> 'lighthouse_analysis_pending_tribal_review'
    or section_key = 'route_to_recognition'
  ),
  -- Anything not authored by the council in this gate must carry a citation.
  constraint field_cited_unless_council check (
    source_posture = 'council_authored' or citation_url is not null
  ),
  constraint field_superseded_has_successor check (
    (field_state = 'superseded') = (superseded_by is not null)
  )
);
create index field_nation_section_idx
  on tribal_council_gate.field (nation_key, section_key, display_order);

-- Page layout as the council sets it.
create table tribal_council_gate.layout (
  nation_key text primary key references public.native_nation_registry_v1 (nation_key),
  display_name text,
  primary_language_tag text,
  section_order text[] not null default '{}',
  participation text not null default 'not_yet_contacted' check (
    participation in ('not_yet_contacted', 'invited', 'reviewing', 'participating', 'withdrawn')
  ),
  updated_at timestamptz not null default now(),
  last_decision_id bigint
);

-- Where letters go. Only addresses the nation itself publishes, or the
-- official directory lists, with the page they were read from.
create table tribal_council_gate.council_contact (
  contact_id bigint generated always as identity primary key,
  nation_key text not null references public.native_nation_registry_v1 (nation_key),
  addressee text not null,
  mailing_address text,
  email text,
  phone text,
  source_posture text not null check (
    source_posture in ('own_website', 'official_directory', 'council_provided')
  ),
  source_url text,
  recorded_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint contact_has_a_channel check (mailing_address is not null or email is not null),
  constraint contact_cited check (source_posture = 'council_provided' or source_url is not null)
);

-- People the council names to review its page. A pseudonym is fine; no
-- legal name is collected. Access is to this one nation only.
create table tribal_council_gate.council_member (
  member_id bigint generated always as identity primary key,
  nation_key text not null references public.native_nation_registry_v1 (nation_key),
  auth_user_id uuid not null,
  display_name text not null,
  member_role text not null check (member_role in ('council_reviewer', 'council_approver')),
  granted_at timestamptz not null default now(),
  granted_by text not null,
  granted_basis text not null,
  revoked_at timestamptz,
  unique (nation_key, auth_user_id)
);

-- Every council decision, append-only. Applied by record_council_decision.
create table tribal_council_gate.council_decision (
  decision_id bigint generated always as identity primary key,
  nation_key text not null references public.native_nation_registry_v1 (nation_key),
  decision_kind text not null check (
    decision_kind in (
      'confirm_field', 'correct_field', 'restrict_field', 'replace_field', 'reject_field',
      'add_field', 'add_section', 'rename_section', 'remove_section', 'reorder_sections',
      'set_display_name', 'set_language', 'unlock_section', 'lock_section',
      'grant_public_display', 'revoke_public_display', 'revoke_all', 'withdraw_participation',
      'resume_participation'
    )
  ),
  section_key text,
  field_id bigint references tribal_council_gate.field (field_id),
  payload jsonb not null default '{}'::jsonb,
  decided_by_member_id bigint references tribal_council_gate.council_member (member_id),
  recorded_by_admin text,
  decision_basis text not null,
  decided_at timestamptz not null default now(),
  -- A decision is the council's: made by a member in the gate, or recorded
  -- by an admin from a council letter/resolution named in decision_basis.
  constraint decision_has_author check (
    decided_by_member_id is not null or recorded_by_admin is not null
  )
);
create index council_decision_nation_idx
  on tribal_council_gate.council_decision (nation_key, decided_at desc);

-- Letters to councils.
create table tribal_council_gate.outreach_letter (
  letter_id bigint generated always as identity primary key,
  nation_key text not null references public.native_nation_registry_v1 (nation_key),
  contact_id bigint not null references tribal_council_gate.council_contact (contact_id),
  letter_kind text not null check (
    letter_kind in ('initial_invitation', 'follow_up', 'decision_confirmation', 'withdrawal_confirmation')
  ),
  body_text text not null,
  body_sha256 text not null,
  letter_status text not null default 'draft' check (
    letter_status in ('draft', 'approved', 'sent', 'returned_undeliverable', 'response_received', 'cancelled')
  ),
  drafted_by text not null,
  drafted_at timestamptz not null default now(),
  approved_by text,
  approved_at timestamptz,
  sent_at timestamptz,
  sent_method text check (sent_method in ('postal_mail', 'email', 'hand_delivered')),
  response_received_at timestamptz,
  status_note text,
  constraint letter_sent_after_approval check (
    sent_at is null or (approved_at is not null and sent_at >= approved_at)
  )
);

-- Who saw what. Written by the server on every non-public read and action.
create table tribal_council_gate.access_log (
  log_id bigint generated always as identity primary key,
  actor_kind text not null check (actor_kind in ('admin', 'council_member', 'system')),
  actor_ref text not null,
  nation_key text,
  section_key text,
  access_action text not null check (
    access_action in ('view_page', 'view_section', 'view_letters', 'export', 'decide', 'draft_letter', 'approve_letter', 'mark_letter')
  ),
  aal text,
  accessed_at timestamptz not null default now()
);
create index access_log_nation_idx on tribal_council_gate.access_log (nation_key, accessed_at desc);

-- The decision record and the access log cannot be rewritten.
create function tribal_council_gate.refuse_rewrite() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end;
$$;
create trigger council_decision_append_only
  before update or delete on tribal_council_gate.council_decision
  for each row execute function tribal_council_gate.refuse_rewrite();
create trigger access_log_append_only
  before update or delete on tribal_council_gate.access_log
  for each row execute function tribal_council_gate.refuse_rewrite();

-- Platform sections every page starts with, all locked and private.
create function tribal_council_gate.open_nation_page(p_nation_key text)
returns void language plpgsql as $$
begin
  insert into tribal_council_gate.section (nation_key, section_key, title, display_order, added_by)
  select p_nation_key, s.section_key, s.title, s.ord, 'platform'
  from (values
    ('identity_core', 'Identity', 1),
    ('treaty_record', 'Treaty / Political Relationship', 2),
    ('dispossession_record', 'Dispossession Record', 3),
    ('recognition_timeline', 'Recognition Timeline', 4),
    ('lawsuit_record', 'Lawsuit Claims', 5),
    ('language_vault', 'Language / Living Culture', 6),
    ('ally_call', 'Ally Call', 7),
    ('route_to_recognition', 'Route to Recognition', 8)
  ) as s(section_key, title, ord)
  on conflict do nothing;

  insert into tribal_council_gate.layout (nation_key, section_order)
  values (p_nation_key, array[
    'identity_core', 'treaty_record', 'dispossession_record', 'recognition_timeline',
    'lawsuit_record', 'language_vault', 'ally_call', 'route_to_recognition'
  ])
  on conflict do nothing;
end;
$$;

-- Records a council decision and applies it, in one transaction.
create function tribal_council_gate.record_council_decision(
  p_nation_key text,
  p_decision_kind text,
  p_section_key text,
  p_field_id bigint,
  p_payload jsonb,
  p_decided_by_member_id bigint,
  p_recorded_by_admin text,
  p_decision_basis text
) returns bigint
language plpgsql as $$
declare
  v_decision_id bigint;
  v_field tribal_council_gate.field%rowtype;
  v_new_field_id bigint;
  v_member tribal_council_gate.council_member%rowtype;
  v_participation text;
begin
  if p_decided_by_member_id is not null then
    select * into v_member from tribal_council_gate.council_member
     where member_id = p_decided_by_member_id;
    if not found or v_member.nation_key <> p_nation_key or v_member.revoked_at is not null then
      raise exception 'member % may not decide for %', p_decided_by_member_id, p_nation_key
        using errcode = '42501';
    end if;
    -- Reviewers can confirm or flag; only approvers can open anything to the public.
    if v_member.member_role <> 'council_approver'
       and p_decision_kind in ('unlock_section', 'grant_public_display') then
      raise exception 'only a council approver may %', p_decision_kind using errcode = '42501';
    end if;
  end if;

  select participation into v_participation from tribal_council_gate.layout where nation_key = p_nation_key;
  if v_participation = 'withdrawn' and p_decision_kind <> 'resume_participation' then
    raise exception 'nation % has withdrawn; only resume_participation is accepted', p_nation_key
      using errcode = 'P0001';
  end if;

  if p_field_id is not null then
    select * into v_field from tribal_council_gate.field where field_id = p_field_id for update;
    if not found or v_field.nation_key <> p_nation_key then
      raise exception 'field % is not part of %', p_field_id, p_nation_key using errcode = '42501';
    end if;
    if v_field.field_state = 'superseded' then
      raise exception 'field % was already superseded by %', p_field_id, v_field.superseded_by
        using errcode = 'P0001';
    end if;
  end if;

  insert into tribal_council_gate.council_decision (
    nation_key, decision_kind, section_key, field_id, payload,
    decided_by_member_id, recorded_by_admin, decision_basis
  ) values (
    p_nation_key, p_decision_kind, coalesce(p_section_key, v_field.section_key), p_field_id,
    coalesce(p_payload, '{}'::jsonb), p_decided_by_member_id, p_recorded_by_admin, p_decision_basis
  ) returning decision_id into v_decision_id;

  case p_decision_kind
    when 'confirm_field' then
      update tribal_council_gate.field set field_state = 'confirmed' where field_id = p_field_id;
    when 'restrict_field' then
      update tribal_council_gate.field set field_state = 'restricted' where field_id = p_field_id;
    when 'reject_field' then
      update tribal_council_gate.field set field_state = 'rejected' where field_id = p_field_id;
    when 'correct_field', 'replace_field' then
      if coalesce(p_payload ->> 'value_text', '') = '' then
        raise exception '% needs payload.value_text', p_decision_kind using errcode = '22023';
      end if;
      insert into tribal_council_gate.field (
        nation_key, section_key, field_key, value_text, language_tag, source_posture,
        display_order, field_state, created_by_decision_id
      ) values (
        p_nation_key, v_field.section_key, v_field.field_key, p_payload ->> 'value_text',
        coalesce(p_payload ->> 'language_tag', v_field.language_tag), 'council_authored',
        v_field.display_order, 'confirmed', v_decision_id
      ) returning field_id into v_new_field_id;
      update tribal_council_gate.field
         set field_state = 'superseded', superseded_by = v_new_field_id
       where field_id = p_field_id;
    when 'add_field' then
      if p_section_key is null or coalesce(p_payload ->> 'value_text', '') = ''
         or coalesce(p_payload ->> 'field_key', '') = '' then
        raise exception 'add_field needs section_key, payload.field_key and payload.value_text'
          using errcode = '22023';
      end if;
      insert into tribal_council_gate.field (
        nation_key, section_key, field_key, value_text, language_tag, source_posture,
        display_order, field_state, created_by_decision_id
      ) values (
        p_nation_key, p_section_key, p_payload ->> 'field_key', p_payload ->> 'value_text',
        p_payload ->> 'language_tag', 'council_authored',
        coalesce((p_payload ->> 'display_order')::integer, 1000), 'confirmed', v_decision_id
      );
    when 'add_section' then
      insert into tribal_council_gate.section (nation_key, section_key, title, display_order, added_by, last_decision_id)
      values (
        p_nation_key, p_section_key, coalesce(p_payload ->> 'title', p_section_key),
        coalesce((p_payload ->> 'display_order')::integer, 100), 'council', v_decision_id
      );
      update tribal_council_gate.layout
         set section_order = array_append(array_remove(section_order, p_section_key), p_section_key),
             updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key;
    when 'rename_section' then
      update tribal_council_gate.section
         set title = p_payload ->> 'title', updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key and section_key = p_section_key;
    when 'remove_section' then
      update tribal_council_gate.section
         set removed_by_council = true, public_display_permitted = false,
             lock_status = 'locked_tribe_requested', updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key and section_key = p_section_key;
    when 'reorder_sections' then
      update tribal_council_gate.layout
         set section_order = array(select jsonb_array_elements_text(p_payload -> 'section_order')),
             updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key;
    when 'set_display_name' then
      update tribal_council_gate.layout
         set display_name = p_payload ->> 'display_name', updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key;
    when 'set_language' then
      update tribal_council_gate.layout
         set primary_language_tag = p_payload ->> 'language_tag', updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key;
    when 'unlock_section' then
      update tribal_council_gate.section
         set lock_status = case when coalesce((p_payload ->> 'partial')::boolean, false)
                                then 'partial_unlock' else 'unlocked_tribe_approved' end,
             updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key and section_key = p_section_key;
    when 'grant_public_display' then
      update tribal_council_gate.section
         set public_display_permitted = true, updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key and section_key = p_section_key;
    when 'lock_section' then
      update tribal_council_gate.section
         set lock_status = 'locked_tribe_requested', public_display_permitted = false,
             updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key and section_key = p_section_key;
    when 'revoke_public_display' then
      update tribal_council_gate.section
         set public_display_permitted = false, updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key and section_key = p_section_key;
    when 'revoke_all', 'withdraw_participation' then
      update tribal_council_gate.section
         set lock_status = 'locked_tribe_requested', public_display_permitted = false,
             updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key;
      if p_decision_kind = 'withdraw_participation' then
        update tribal_council_gate.layout
           set participation = 'withdrawn', updated_at = now(), last_decision_id = v_decision_id
         where nation_key = p_nation_key;
      end if;
    when 'resume_participation' then
      update tribal_council_gate.layout
         set participation = 'participating', updated_at = now(), last_decision_id = v_decision_id
       where nation_key = p_nation_key;
  end case;

  return v_decision_id;
end;
$$;

-- The only public surface: fields the council confirmed or wrote, in
-- sections it opened, never superseded, restricted or rejected.
create view public.tribal_council_gate_public_field_v1
with (security_invoker = true) as
select f.nation_key, s.section_key, s.title as section_title, s.display_order as section_order,
       f.field_key, f.value_text, f.language_tag, f.source_posture, f.citation_url, f.citation_title,
       f.display_order
from tribal_council_gate.field f
join tribal_council_gate.section s using (nation_key, section_key)
join tribal_council_gate.layout l using (nation_key)
where l.participation <> 'withdrawn'
  and s.removed_by_council = false
  and s.public_display_permitted = true
  and s.lock_status in ('unlocked_tribe_approved', 'partial_unlock')
  -- Only what the council itself confirmed or wrote is ever public.
  and f.field_state = 'confirmed';

alter table tribal_council_gate.section enable row level security;
alter table tribal_council_gate.field enable row level security;
alter table tribal_council_gate.layout enable row level security;
alter table tribal_council_gate.council_contact enable row level security;
alter table tribal_council_gate.council_member enable row level security;
alter table tribal_council_gate.council_decision enable row level security;
alter table tribal_council_gate.outreach_letter enable row level security;
alter table tribal_council_gate.access_log enable row level security;

revoke all on all tables in schema tribal_council_gate from public, anon, authenticated;
revoke all on all functions in schema tribal_council_gate from public, anon, authenticated;
revoke all on public.tribal_council_gate_public_field_v1 from public, anon, authenticated;
grant select, insert, update on all tables in schema tribal_council_gate to service_role;
grant execute on all functions in schema tribal_council_gate to service_role;
grant select on public.tribal_council_gate_public_field_v1 to service_role;
