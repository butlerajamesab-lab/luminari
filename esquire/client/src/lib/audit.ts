import { supabase } from './supabase';

export async function logAuditAction(params: {
  case_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_value?: unknown;
  new_value?: unknown;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  
  await supabase.from('audit_log').insert({
    case_id: params.case_id || null,
    action: params.action,
    entity_type: params.entity_type,
    entity_id: params.entity_id || null,
    old_value: params.old_value || null,
    new_value: params.new_value || null,
    performed_by: user?.id || null,
  });
}
