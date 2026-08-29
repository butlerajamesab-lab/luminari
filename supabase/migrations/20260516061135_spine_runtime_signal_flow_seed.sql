insert into public.canonical_signal_registry
(canonical_key, signal_type, severity, source_layer, metadata)
values
('signal_dead_end_guard','continuity_guard','high','spine', '{"description":"No Dead Ends Guard runtime continuity signal"}'::jsonb),
('signal_overlay_variance','overlay_variance','medium','viewfinder', '{"description":"Jurisdiction overlay variance detected"}'::jsonb),
('signal_contradiction_density','contradiction_density','high','viewfinder', '{"description":"Structural contradiction accumulation signal"}'::jsonb),
('signal_procedural_heat','procedural_heat','medium','atlas', '{"description":"Procedural pressure and intake concentration signal"}'::jsonb),
('signal_escalation_flow','escalation_flow','medium','lumensend', '{"description":"Escalation continuity propagation signal"}'::jsonb)
on conflict (canonical_key) do nothing;

insert into public.canonical_contradiction_registry
(canonical_key, contradiction_type, governing_expectation, observed_reality, harm_vector, escalation_required)
values
('contradiction_deadline_asymmetry','deadline_asymmetry','Equal procedural access windows','Jurisdictional timing asymmetry produces unequal survivability','procedural_compression', true),
('contradiction_benefit_cliff','benefit_cliff','Support continuity during income transition','Abrupt threshold cutoff creates instability and abandonment risk','support_loss', true),
('contradiction_enforcement_drift','enforcement_drift','Consistent enforcement expectation','Observed enforcement varies structurally across regions','structural_inconsistency', true)
on conflict (canonical_key) do nothing;
