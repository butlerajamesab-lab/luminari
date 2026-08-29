insert into public.canonical_room_registry (canonical_key, room_name, functional_role, description)
values
('lighthouse','Lighthouse','orientation','Civic visibility and public orientation layer'),
('mudroom','Mudroom','transition','Ambiguity-safe transition and pathway discovery layer'),
('spine','Spine','governance','Constitutional runtime substrate nexus'),
('workshop','Workshop','repair','Procedural repair and evidence continuity layer'),
('viewfinder','Viewfinder','observability','Structural anomaly and contradiction observability layer'),
('legal_library','Legal Library','grounding','Legal grounding and enforcement structure layer'),
('docket_room','Docket Room','mechanics','Procedural and legislative mechanics layer'),
('lumensend','LumenSend','action','Procedural export and escalation layer')
on conflict (canonical_key) do nothing;

insert into public.canonical_procedural_state_registry
(canonical_key, state_name, stage_order, description)
values
('intake','Intake',1,'Initial procedural intake and orientation'),
('verification','Verification',2,'Truth and provenance verification'),
('grounding','Grounding',3,'Legal and procedural grounding'),
('contradiction_detection','Contradiction Detection',4,'Structural contradiction analysis'),
('pathway_resolution','Pathway Resolution',5,'Procedural pathway determination'),
('escalation','Escalation',6,'Escalation and remedy continuity'),
('export','Export',7,'Procedural export and delivery')
on conflict (canonical_key) do nothing;

insert into public.constitutional_registry
(canonical_key, title, doctrine_type, doctrine_text)
values
('truth_law','Truth Law','constitutional_law','The system must never pretend or conceal uncertainty.'),
('no_dead_end_law','No Dead-End Law','constitutional_law','Every path must terminate in a verified foothold, escalation, fallback, or explicit gap.'),
('structural_honesty','Structural Honesty','constitutional_doctrine','The system must expose structural contradictions and procedural failures honestly.'),
('determinism','Determinism','runtime_doctrine','Same input plus same snapshot plus same rules equals same output.'),
('anti_reenactment','Anti-Reenactment','constitutional_prohibition','The system must never reenact institutional abandonment or opacity.')
on conflict (canonical_key) do nothing;
