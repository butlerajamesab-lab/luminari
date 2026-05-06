# Luminari Source-Driven UI Recovery Index

## Purpose

This document corrects the recovery process so the uploaded source artifacts become the primary product-surface inventory, not screenshots alone.

The original screenshots prove live/visual behavior. The uploaded source artifacts define the complete intended UI surface, routes, panels, buttons, actions, and UI/backend connections.

No Atlas changes.
No Supabase data changes.
No production activation.

---

## 1. Verified

### Source inventory exists

The uploaded source package includes:

- `PAGES.md`
- `LUMINARI_—_Clean_Rebuild_Blueprint (1) (1) (1).md`
- `LUMINARI_UI_ARCHITECTURE_—_NAVIGATION.md`
- `LUMINARI_UI_ARCHITECTURE_—_PANELS.md`
- `LUMINARI_UI_ARCHITECTURE_—_CONNECTIONS.md`
- `LUMINARI_UI_ARCHITECTURE_—_BUTTONS_&_ACTIONS.md`
- `luminari_specification_extraction.json`
- standalone HTML surfaces for intake, mission control, anomaly viewfinder, and asset recovery
- SQL and code/frontend manifests

### PAGES.md is the master UI surface list

`PAGES.md` identifies itself as the complete inventory of every page in the Luminari platform.

It includes a 91-page client surface, including but not limited to:

- ActionPath
- ActivationControl
- AdminAnalytics
- AdminFeedback
- AdminTestScenarios
- AdminUsers
- AgencyMetrics
- AnomalyViewfinder
- ArchitectureMap
- AuditTrail
- BenefitsNavigator
- BusinessAnalytics
- Case
- CaseRepair
- CaseResolutionLens
- CaseTemplates
- CategoryExplorer
- CivicMap
- CivilGideon
- ClaimElements
- CommandBoard
- ContradictionScoring
- DeadlineCalculator
- DoctrineGraph
- EvidenceLab
- Findings
- LegalLibrary
- Lighthouse
- MissionControl
- Mudroom
- ResourceDirectory
- SignalRegistry
- StructuralDiagnosticsLens
- Viewfinder-related surfaces
- Workbench / Workshop surfaces

### Clean Rebuild Blueprint defines the rebuild context

The blueprint states the platform contains everything needed to rebuild the Luminari / Neutral Forensic Engine 3.0 platform from scratch, including features, table schema, relationships, pages, and router connections.

It also records the drift problem that caused recovery:

- 492 database tables
- 84 server routers
- 91 client pages
- ORM/schema drift
- duplicate tables
- missing canonical schema
- missing safe idempotent seed
- missing startup integrity check

### UI architecture docs define behavior, not only page names

The architecture files define:

- Navigation hierarchy and sidebar sections
- Visual panels/cards/sections per page
- UI-to-backend query and mutation connections
- Button/link/click action behavior

Therefore, recovery must inspect all five source dimensions:

1. Page inventory
2. Navigation
3. Panels
4. Connections
5. Buttons/actions

---

## 2. Unverified

The following still require direct comparison against Render:

- Which of the 91 pages currently exist in Render routes
- Which pages render the correct component
- Which pages show the wrong screen
- Which buttons are wired
- Which buttons are intentionally disabled
- Which tRPC procedures are mounted in the current Render backend gate
- Which pages are only static shells
- Which pages need Atlas population later
- Which pages belong to Lighthouse now versus Prism, Rosetta, Esquire, or Atlas

---

## 3. Contradictions / Drift

### Drift: screenshots alone are enough

False.

Screenshots prove visible/live behavior, but the uploaded source files define the full intended surface.

### Drift: `categories` equals the original pipeline surface

False.

`/categories` is one route in the source inventory. The original product surface is broader: pipeline issue catalog, guided intake, and category/pipeline exploration need to be reconciled against the source inventory and screenshots.

### Drift: Render route exists means the page is restored

False.

A route only counts as restored when:

- the route loads
- the correct component/surface appears
- intended panels are present
- buttons/actions are either working or intentionally disabled
- data dependency is known
- security boundary is known

### Drift: original Manus combined prototype means current platform roles collapse

False.

The original prototype may have combined Lighthouse, Atlas-like, Prism-like, Rosetta-like, and Esquire-like surfaces. The current recovery must preserve surfaces while assigning them to the correct platform role.

---

## 4. Required proof

For every page in `PAGES.md`, create a row with:

- page name
- intended route
- source purpose
- expected navigation group
- required panels from `PANELS.md`
- required buttons/actions from `BUTTONS_&_ACTIONS.md`
- backend/API dependencies from `CONNECTIONS.md`
- Render route status
- screenshot evidence, if available
- platform owner: Lighthouse / Atlas / Prism / Rosetta / Esquire / shared reference
- migration decision: port now / port next / port later / preserve reference / archive / needs verification

---

## 5. Next action

Build the full 91-page recovery matrix from the uploaded source artifacts.

Priority order:

1. Parse `PAGES.md` into a canonical route/page matrix.
2. Join each page to navigation group from `NAVIGATION.md`.
3. Join expected panels from `PANELS.md`.
4. Join buttons/actions from `BUTTONS_&_ACTIONS.md`.
5. Join backend/API dependencies from `CONNECTIONS.md`.
6. Compare each page to current Render route behavior.
7. Mark each page with platform owner and migration decision.

Render remains preview only.
Atlas remains paused.
Supabase data remains untouched.
