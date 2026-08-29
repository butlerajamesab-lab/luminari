
-- Store all 11 deployment planning documents
INSERT INTO knowledge_documents (filename, file_type, category, summary, tags, source_thread, is_active, created_at, updated_at)
VALUES
('clarity.docx','docx','architecture',
'Clarity Compression Layer (V4 True Form). Reduces all system output to: 1 Clear Path, 1 Reason, 1 Next Move. Core principle: humans can only move in one direction at a time. Compresses 3 paths/perspectives into single actionable output. Governs all other layers.',
ARRAY['clarity','v4','compression','ux','governance'],'luminari-rebuild-apr-2026',true,0,0),

('gap.docx','docx','architecture',
'Gap Layer — final core piece of V3. Gap = expected structure that is not present (different from breakpoints which are things that fail). Gap types: missing bridge, missing intermediate step, missing axis/perspective. System becomes diagnostic without being clinical. Can say: this path is valid BUT you are missing this piece.',
ARRAY['gap','v3','diagnostic','structure','breakpoints'],'luminari-rebuild-apr-2026',true,0,0),

('Document__10_break_ooint.docx','docx','architecture',
'Breakpoint Layer (V3 Core). Shows where things break and why. Breakpoint = a place where a path stops working, becomes unstable, or cannot continue. Types: Contradiction (things do not align), Gap (something is missing), Instability, Loop, Dead-end. Rule: no breakpoint shown without plain explanation of what it means for movement.',
ARRAY['breakpoint','v3','failure','contradiction','structure'],'luminari-rebuild-apr-2026',true,0,0),

('pathfinder.docx','docx','architecture',
'Path Layer (V3 Entry). Introduces multiple valid directions without overwhelming the user. Core rule: Max 3 paths always. Instead of here is what to do — here are the 3 most valid ways forward. Internal expansion may be broad; external exposure bounded to 3.',
ARRAY['paths','v3','traversal','structure','3_paths'],'luminari-rebuild-apr-2026',true,0,0),

('mode_indicator.docx','docx','architecture',
'Mode Indicator (V4 Visibility). System knows its mode (ORIENTATION, COMPARISON, ACTION, FALLBACK) but user does not see it — creates disconnect. Fix: user always knows where they are in the process. Design principle: feels like a guide not a dashboard. Component: /components/clarity/ModeIndicator.tsx using ClarityMode type.',
ARRAY['mode','v4','ux','visibility','component'],'luminari-rebuild-apr-2026',true,0,0),

('action.docx','docx','architecture',
'Action Layer (V2). Core rule: No action without clarity — enforced in code. Must present exactly 3 choices: Primary (do this now), Fallback (do this if blocked), Not Yet (do not do this yet). Never push, never overwhelm. Action becomes inevitable not forced. If confidence drops route to fallback or back to orientation.',
ARRAY['action','v2','clarity_gate','primary','fallback','not_yet'],'luminari-rebuild-apr-2026',true,0,0),

('bridge.docx','docx','architecture',
'Comparison Screen (Bridge Layer — most important part of the entire system). Intake gives structure. Comparison gives clarity. Action becomes safe because of this step. Shows 3 perspectives only — where they agree, where they conflict, what is uncertain. Moves toward one next step. Route: /app/comparison/page.tsx.',
ARRAY['comparison','bridge','perspectives','v1_v2','screen'],'luminari-rebuild-apr-2026',true,0,0),

('repository_build_out.docx','docx','architecture',
'Luminari App Foundation Blueprint. V1=Intake/Reality Structuring, V2=Action/Execution, V3=Structure/Traversal, V4=Clarity/Governor. Repo layout: luminari-app/ with app/ (intake, comparison, action, fallback, admin), components/, lib/ (clarity, v1, v2, v3, shared, validation), types/ (clarity.ts, intake.ts, action.ts, traversal.ts, roles.ts), docs/, scripts/. Shared contracts: Perspective, IntakeResult, ActionBundle, ClarityState interfaces. Build order: Phase A skeleton → Phase B V1 flow → Phase C V2 flow → Phase D V3 exposure → Phase E roles → Phase F Supabase data layer. Stack: Next.js + TypeScript + Supabase (later).',
ARRAY['blueprint','repo_layout','build_order','contracts','next_js','phases'],'luminari-rebuild-apr-2026',true,0,0),

('Luminari_system_builder.docx','docx','architecture',
'PowerShell build script (v1) — creates LUMINARI folder structure with PHASE_1_FOUNDATION, PHASE_2_ACTION, PHASE_3_STRUCTURE, PHASE_4_CLARITY, SHARED, ENGINE, UI, EXECUTION_BOARD, DEPLOYMENT_PACKS folders plus foundational README and content files. Includes clarity_governor.ts scaffold. Week 1-2 execution board tasks.',
ARRAY['build_script','powershell','folder_structure','scaffold'],'luminari-rebuild-apr-2026',true,0,0),

('build_script.docx','docx','architecture',
'PowerShell build script (v2, same structure as Luminari_system_builder.docx but earlier version). Creates same LUMINARI folder structure. Note: luminari_deployment_docs.docx is the complete/final version of this script.',
ARRAY['build_script','powershell','scaffold','v1_script'],'luminari-rebuild-apr-2026',true,0,0),

('luminari_deployment_docs.docx','docx','architecture',
'Complete PowerShell deployment script — FINAL VERSION. Creates full LUMINARI system: all phase folders + SHARED + ENGINE + UI + EXECUTION_BOARD + DEPLOYMENT_PACKS (with PHASE_1/2/3/4_READY subfolders). Writes all content: README.md, BUILD_ORDER.md, CORE_LAWS.md (6 laws: Three Perspective Rule, Retention Rule, One Step Rule, Clarity Before Action, Contract on Overload, Layered Visibility), ROLE_MODEL.md (4 roles: Guided Intake, Advocate, Professional, Admin), DEPLOYMENT_CHECKLIST.md, phase READMEs, INTAKE_FLOW.md, CLARITY_GATE.md, ACTION_BUNDLES.md, TRAVERSAL_RULES.md, BREAKPOINTS_AND_GAPS.md, MODES.md, full clarity_governor.ts with detectOverload/selectThreePerspectives/routeMode/clarityGovernor functions, all UI screen docs, week 1-4 execution board, deployment pack READMEs. Outputs LUMINARI.zip.',
ARRAY['deployment','powershell','complete_script','core_laws','role_model','clarity_governor','final'],'luminari-rebuild-apr-2026',true,0,0);
