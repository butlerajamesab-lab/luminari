update public.data_stream_registry
   set description_dsr = concat_ws(
         E'\n',
         nullif(btrim(description_dsr), ''),
         'Atlas upstream source: usda_fns'
       ),
       updated_at_dsr = (extract(epoch from clock_timestamp()) * 1000)::bigint
 where stream_id_dsr = 'usda_snap'
   and source_dsr = 'atlas_stream'
   and coalesce(description_dsr, '') not like '%Atlas upstream source:%';
