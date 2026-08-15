revoke execute on function public.create_luminari_resource_snapshot_v2_4(text,jsonb)
  from service_role;
revoke execute on function public.create_luminari_resource_snapshot_v2_5(text,jsonb)
  from service_role;

comment on function public.create_luminari_resource_snapshot_v2_4(text,jsonb) is
  'Deprecated multipass builder retained only for immutable migration history. Use create_luminari_resource_snapshot_v2_6; v2.4 can exceed the bounded worker statement budget.';
comment on function public.create_luminari_resource_snapshot_v2_5(text,jsonb) is
  'Deprecated multipass builder retained only for immutable migration history. Use create_luminari_resource_snapshot_v2_6; v2.5 can exceed the bounded worker statement budget.';
