# Esquire — Design Brainstorm

## Context
A Pro Se Litigant Assistant — a court-readiness tool for self-represented individuals. The aesthetic must communicate: authority, trustworthiness, precision, and seriousness. No playful elements. This is a legal tool that helps people navigate the justice system.

---

<response>
<text>

## Idea 1: "Federal Courthouse" — Neoclassical Legal Formalism

**Design Movement:** Inspired by the architectural gravitas of federal courthouses — marble, columns, serif inscriptions. Translated digitally through structured hierarchy, serif typography, and restrained ornamentation.

**Core Principles:**
1. Institutional authority through typographic weight and vertical rhythm
2. Information density without visual clutter — every element earns its space
3. Monochromatic restraint with strategic accent for urgency/action
4. Document-first layouts that mirror legal filing structure

**Color Philosophy:** 
- Primary: Deep navy (#0F172A) — the color of judicial robes and authority
- Surface: Pure white (#FFFFFF) with subtle warm gray borders (#E2E8F0)
- Accent: Muted gold (#B8860B) — reserved for critical actions and status
- Danger: Crimson (#DC2626) for safety alerts only
- The palette communicates: "This is serious. This is official."

**Layout Paradigm:** Vertical document flow with a persistent left sidebar for navigation. Content areas use a "legal brief" structure — wide single-column with generous margins. Tables and lists dominate over cards. Information is presented in the reading order a judge would expect.

**Signature Elements:**
1. Horizontal rule dividers with small centered section markers (§)
2. Monospace hash displays for evidence integrity
3. Status indicators using filled/outlined pill shapes with no rounded playfulness

**Interaction Philosophy:** Deliberate and confirmatory. Every destructive or significant action requires explicit confirmation. Transitions are minimal — content appears, it doesn't slide or bounce. The interface respects the gravity of legal proceedings.

**Animation:** Near-zero animation. Fade-in at 150ms for new content. No sliding, no bouncing, no scaling. Loading states use a simple horizontal progress bar, never a spinner. The only motion is a subtle pulse on critical safety indicators.

**Typography System:**
- Display/Headings: "Playfair Display" (serif) — weight 700 for page titles, 600 for section headers
- Body: "Source Sans 3" (sans-serif) — weight 400 for body, 600 for labels
- Monospace: "JetBrains Mono" for hashes, case IDs, and technical data
- Hierarchy: 3 levels max. Title → Section → Body. No decorative text.

</text>
<probability>0.07</probability>
</response>

<response>
<text>

## Idea 2: "Legal Ops Dashboard" — Swiss Precision Grid

**Design Movement:** International Typographic Style (Swiss Design) meets modern ops dashboards. Absolute clarity, mathematical precision, no decoration. Every pixel serves information delivery.

**Core Principles:**
1. Grid-locked precision — 8px base unit, everything aligns
2. Data density with clear visual hierarchy through size and weight alone
3. Neutral palette that lets status colors do all the semantic work
4. Component uniformity — same patterns repeated, never bespoke

**Color Philosophy:**
- Background: Cool slate (#0F1729) — dark mode by default for extended use
- Surface: Elevated dark cards (#1E293B) with subtle 1px borders (#334155)
- Text: High-contrast white (#F8FAFC) with muted secondary (#94A3B8)
- Status is the only color: Blue (intake), Green (active), Amber (warning), Red (danger)
- Philosophy: "Color means something. If it's colored, pay attention."

**Layout Paradigm:** Dense grid dashboard with collapsible panels. Top navigation bar with breadcrumbs. Content in tight card grids that maximize information per viewport. Sidebar only appears contextually. Tables are the primary data display — not cards.

**Signature Elements:**
1. Tight monospace metadata strips at the top of every card (ID, hash, timestamp)
2. Left-border color coding on cards to indicate status without taking space
3. Compact inline badges with no padding waste

**Interaction Philosophy:** Efficient and keyboard-first. Tab navigation works perfectly. Actions are inline — no modals unless confirmation is required. Bulk operations supported. The interface rewards power users who know what they're doing.

**Animation:** Functional only. 120ms transitions on hover states. Content sections use 0-height collapse/expand with 200ms ease-out. No entrance animations. Loading uses skeleton screens that match exact content dimensions.

**Typography System:**
- All text: "Inter" variable font — but used with extreme weight contrast (300 for body, 700 for headings)
- Monospace: "IBM Plex Mono" for all technical data
- Size scale: 11px metadata, 13px body, 15px subheads, 20px page titles
- Tight line-heights (1.3) for density

</text>
<probability>0.05</probability>
</response>

<response>
<text>

## Idea 3: "Chambers" — Restrained Modern Authority

**Design Movement:** Contemporary legal office design — think a well-appointed law library meeting a modern SaaS tool. Warm neutrals, structured whitespace, and typographic confidence. Not cold, not playful — authoritative yet approachable.

**Core Principles:**
1. Warm authority — dark backgrounds with warm undertones, not cold blue-grays
2. Generous whitespace that communicates confidence and clarity
3. Strong left-aligned hierarchy — no centered layouts except for empty states
4. Information surfaces that feel like well-organized legal documents

**Color Philosophy:**
- Primary background: Deep charcoal with warm undertone (#1C1917 — stone-950)
- Card surfaces: Slightly elevated warm dark (#292524 — stone-800)
- Text: Warm white (#FAFAF9) primary, muted (#A8A29E) secondary
- Accent: Refined teal (#0D9488) — authoritative but not corporate blue
- Safety: Amber (#F59E0B) for caution, Red (#EF4444) for critical — used sparingly
- Philosophy: "Warm enough to be human, dark enough to be serious."

**Layout Paradigm:** Full-height app shell with a narrow icon+label sidebar (expandable). Main content uses asymmetric two-column layouts — wide primary content with a narrower contextual panel. Case detail uses horizontal tabs with generous padding. Mobile collapses to single-column with bottom tab navigation.

**Signature Elements:**
1. Subtle top-border accent on active cards (2px teal line)
2. "Evidence chain" visual — connected dots showing consent → hash → storage flow
3. Section headers with small uppercase tracking and a thin rule beneath

**Interaction Philosophy:** Guided but not restrictive. The wizard flow for new cases uses clear step indicators. Evidence upload shows real-time hash computation. Every action provides immediate feedback through inline status changes, not toasts (except errors). The interface guides without patronizing.

**Animation:** Purposeful and restrained. Page transitions: 200ms crossfade. Tab switches: instant content swap with 150ms underline slide. Card hover: subtle 2px translateY with shadow deepening (180ms). Safety pulse: gentle opacity oscillation on critical indicators. Wizard steps: horizontal slide (250ms ease-out).

**Typography System:**
- Headings: "DM Serif Display" — weight 400, used large and confident
- Body/UI: "DM Sans" — weight 400 body, 500 labels, 700 emphasis
- Monospace: "Fira Code" for hashes, IDs, and technical metadata
- Scale: 14px base, 18px subheads, 24px section titles, 32px page titles
- Letter-spacing: -0.01em on headings for tightness, normal on body

</text>
<probability>0.08</probability>
</response>
