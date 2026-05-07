# Luminari UI Recovery Matrix — Pass 001

## Lock

Render remains preview only. Atlas remains paused. Supabase data remains untouched. Production auth is not activated. Screenshots are visual baseline evidence, not implementation proof. Source docs define the route/page baseline.

## Source Inputs

- `PAGES.md`: 91-page inventory.
- `LUMINARI_UI_ARCHITECTURE_—_NAVIGATION.md`: navigation hierarchy.
- `LUMINARI_UI_ARCHITECTURE_—_PANELS.md`: visible sections.
- `LUMINARI_UI_ARCHITECTURE_—_CONNECTIONS.md`: UI/backend connections.
- `LUMINARI_UI_ARCHITECTURE_—_BUTTONS_&_ACTIONS.md`: click/action behavior.
- Screenshot archive: visual baseline and route-state evidence.

## Parsed Counts

| Item | Count |
|---|---:|
| Pages parsed | 91 |
| P0 immediate recovery routes | 18 |
| P1 secondary recovery routes | 23 |
| P2 admin/deferred routes | 4 |
| P3 catalog/deferred routes | 46 |

## P0/P1 Working Board

| Pri | Page | Route | Owner | Render | Decision |
|---|---|---|---|---|---|
| P1 | ActionPath | N/A | Esquire/Lighthouse | unknown | inspect |
| P1 | ActivationControl | N/A | Lighthouse control | unknown | inspect |
| P0 | AdminTestScenarios | `/admin/test-scenarios` | Lighthouse control | needs inspection | inspect |
| P0 | ArchitectureMap | `/architecture-map` | Lighthouse control | broken | fix |
| P1 | AuditTrail | `/audit` | Lighthouse | unknown | inspect |
| P1 | BenefitsNavigator | `/benefits` | Lighthouse | unknown | inspect |
| P1 | Case | `/case/:caseId` | Esquire/Lighthouse | unknown | inspect |
| P1 | CaseResolutionLens | `/case-resolution-lens` | Esquire/Lighthouse | unknown | inspect |
| P1 | CaseTemplates | `/templates` | Esquire/Lighthouse | unknown | inspect |
| P0 | CategoryExplorer | `/categories` | Lighthouse | route-name drift | reconcile |
| P0 | CivicMap | `/civic-map` | Lighthouse | shell, map/data missing | fix later |
| P1 | CivilGideon | `/civil-gideon` | Esquire/Lighthouse | unknown | inspect |
| P1 | ClaimElements | `/claim-elements` | Esquire/Lighthouse | unknown | inspect |
| P1 | ContradictionScoring | `/contradiction-scoring` | Lighthouse | unknown | inspect |
| P1 | DeadlineCalculator | `/deadlines` | Esquire/Lighthouse | unknown | inspect |
| P1 | DocketRoom | `/docket` | Lighthouse | broken | fix |
| P1 | DoctrineGraph | `/doctrine-graph` | Rosetta/Prism/Lighthouse | unknown | inspect |
| P1 | EnforcementPathway | `/enforcement-pathway` | Rosetta/Prism/Esquire display | unknown | inspect |
| P1 | EvidenceLab | `/evidence-lab` | Esquire/Lighthouse | unknown | inspect |
| P1 | Findings | `/findings` | Lighthouse | unknown | inspect |
| P0 | Home | `/` | Shared | partial preview | inspect |
| P0 | KnowledgePopulation | `/admin/knowledge-population` | Atlas-facing display | unknown | inspect |
| P0 | LegalLibrary | `/legal-library` | Rosetta/Prism/Lighthouse | unknown/incomplete | inspect |
| P0 | Lighthouse | `/lighthouse` | Lighthouse | partial preview | inspect |
| P1 | LitigationBarriers | `/barriers` | Esquire/Lighthouse | unknown | inspect |
| P0 | MissionControl | `/mission-control` | Lighthouse control | unknown/gated | inspect |
| P0 | Mudroom | `/mudroom` | Lighthouse | works | preserve |
| P0 | ResourceDirectory | `/resources` | Lighthouse | unknown | inspect |
| P1 | SignalRegistry | `/signal-registry` | Atlas-facing display | unknown | inspect |
| P0 | SovereignControl | `/sovereign-control` | Lighthouse control | unknown/gated | inspect |
| P1 | StructuralDiagnosticsLens | `/structural-diagnostics-lens` | Lighthouse | unknown | inspect |
| P0 | Viewfinder | `/viewfinder` | Lighthouse | unknown | inspect |
| P0 | Welcome | N/A | Lighthouse/Esquire display | screenshot-supported | inspect |
| P0 | WorkshopFloor | `/workshop` | shared | works | preserve |

## Known Render Drift

- `/docket`: broken.
- `/architecture-map`: broken.
- `/civic-map`: shell works, map/data missing.
- `/mudroom`: works.
- `/workshop`: works.
- `/categories`: route-name/product-label drift; reconcile as Pipeline / issue catalog.
- `/legal-library`: compare against original legal-library depth.
- `/viewfinder`: compare against original anomaly-viewfinder tabs.
- `/mission-control`: likely hidden/auth-gated; inspect.
- `/sovereign-control`: likely hidden/auth-gated; inspect.

## Next Pass

Pass 002 adds screenshot filename/date/category mapping, visible surface identification, Render route probe status, platform owner confirmation, and migration decision.
