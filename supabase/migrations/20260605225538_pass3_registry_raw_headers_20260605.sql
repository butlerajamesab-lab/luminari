insert into public.raw_registries (registry_id, state_or_region, title, subtitle, intro_text, source_file)
values
  (910001, 'Alabama', 'Alabama State Registry — Enriched Pass 3', 'Three-Layer Navigation, Workflow & Accountability Reference', 'Pass 3 registry header staged for organized enrichment. Raw sections, tables, extraction, and category staging to follow through the existing Lighthouse registry spine.', 'luminari-alabama-ENRICHED-PASS3-2026.docx'),
  (910002, 'Arizona', 'Arizona State Registry — Enriched Pass 3', 'Three-Layer Navigation, Workflow & Accountability Reference', 'Pass 3 registry header staged for organized enrichment. Raw sections, tables, extraction, and category staging to follow through the existing Lighthouse registry spine.', 'luminari-arizona-ENRICHED-PASS3-2026.docx'),
  (910003, 'California', 'California State Registry — Enriched Pass 3', 'Three-Layer Navigation, Workflow & Accountability Reference', 'Pass 3 registry header staged for organized enrichment. Raw sections, tables, extraction, and category staging to follow through the existing Lighthouse registry spine.', 'luminari-california-ENRICHED-PASS3-2026.docx'),
  (910004, 'Colorado', 'Colorado State Registry — Enriched Pass 3', 'Three-Layer Navigation, Workflow & Accountability Reference', 'Pass 3 registry header staged for organized enrichment. Raw sections, tables, extraction, and category staging to follow through the existing Lighthouse registry spine.', 'luminari-colorado-ENRICHED-PASS3-2026.docx'),
  (910005, 'Florida', 'Florida State Registry — Enriched Pass 3', 'Three-Layer Navigation, Workflow & Accountability Reference', 'Pass 3 registry header staged for organized enrichment. Raw sections, tables, extraction, and category staging to follow through the existing Lighthouse registry spine.', 'luminari-florida-ENRICHED-PASS3-2026.docx'),
  (910006, 'Georgia', 'Georgia State Registry — Enriched Pass 3', 'Three-Layer Navigation, Workflow & Accountability Reference', 'Pass 3 registry header staged for organized enrichment. Raw sections, tables, extraction, and category staging to follow through the existing Lighthouse registry spine.', 'luminari-georgia-ENRICHED-PASS3-2026.docx'),
  (910007, 'Illinois', 'Illinois State Registry — Enriched Pass 3', 'Three-Layer Navigation, Workflow & Accountability Reference', 'Pass 3 registry header staged for organized enrichment. Raw sections, tables, extraction, and category staging to follow through the existing Lighthouse registry spine.', 'luminari-illinois-ENRICHED-PASS3-2026.docx')
on conflict (registry_id) do update set
  state_or_region = excluded.state_or_region,
  title = excluded.title,
  subtitle = excluded.subtitle,
  intro_text = excluded.intro_text,
  source_file = excluded.source_file;
