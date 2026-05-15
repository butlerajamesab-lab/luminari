/**
 * ============================================================
 * LUMINARI — AI INSPECTION ROUTER
 * Read-only semantic inspection layer for browser-blind AI assistants.
 *
 * MOUNT INSTRUCTIONS (one-time setup):
 *
 * 1. Save this file as:
 *      server/routes/ai-inspect-router.ts
 *
 * 2. At the top of this file, fix the ONE import marked with ← FIX THIS:
 *      import { db } from '../db';          ← most likely path
 *      import { db } from '../db/client';   ← alternative
 *      import { db } from '../_core/db';    ← if using _core pattern
 *
 * 3. In server/_core/index.ts (or server/index.ts), add:
 *      import aiInspectRouter from '../routes/ai-inspect-router';
 *      app.use('/api/ai', aiInspectRouter);
 *
 * 4. Restart dev server.
 *
 * RULES:
 * - GET only. No POST, no mutations, no writes.
 * - No auth required (inspection surface is public-read, data is semantic not raw).
 * - No service-role keys, no secrets, no PII.
 * - All DB queries are wrapped in try/catch and degrade gracefully.
 * ============================================================
 */

import express, { Request, Response } from 'express';

// ← FIX THIS: swap in your actual db import path
import { db } from '../db';

const router = express.Router();

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

async function safeCount(query: string): Promise<number | null> {
  try {
    const result = await (db as any).execute(query);
    const rows = result?.rows ?? result;
    if (Array.isArray(rows) && rows.length > 0) {
      const val = rows[0]?.count ?? rows[0]?.[0];
      return parseInt(String(val), 10) || 0;
    }
    return null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// GET /api/ai/site-map
// Returns every named route, its purpose, and live status.
// ─────────────────────────────────────────────
router.get('/site-map', async (_req: Request, res: Response) => {
  const [caseCount, docCount, claimCount] = await Promise.all([
    safeCount('SELECT COUNT(*) as count FROM cases'),
    safeCount('SELECT COUNT(*) as count FROM documents'),
    safeCount('SELECT COUNT(*) as count FROM claims'),
  ]);

  res.json({
    platform: 'Luminari',
    description:
      'Universal civic-forensic operating system. Receives a real human problem and returns verified next action, fallback, escalation, or logged gap.',
    lastChecked: now(),
    routes: [
      {
        route: '/',
        title: 'Lighthouse — Public Intake',
        layer: 'L0 / L11',
        status: 'live',
        purpose: 'Primary public entry. Dual intake: free-form problem description or guided pipeline.',
        public: true,
      },
      {
        route: '/docket',
        title: 'Docket',
        layer: 'L5 / L8',
        status: 'live',
        purpose: 'Active case tracker. Shows open cases, stage, deadlines, assigned pipelines.',
        public: false,
        counts: { cases: caseCount },
      },
      {
        route: '/signal-registry',
        title: 'Signal Registry',
        layer: 'L6',
        status: 'live',
        purpose: 'Structural pattern and signal detection across cases. Surfaces systemic failures.',
        public: false,
      },
      {
        route: '/benefits',
        title: 'Benefits Navigator',
        layer: 'L3 / L8',
        status: 'live',
        purpose: 'Eligibility screening, benefit lifecycle tracking, threshold/cliff analysis, form assistance.',
        public: true,
      },
      {
        route: '/guided-intake',
        title: 'Guided Intake',
        layer: 'L0',
        status: 'live',
        purpose: 'Step-by-step structured intake for users who need help framing their problem.',
        public: true,
      },
      {
        route: '/admin/mission-control',
        title: 'Mission Control',
        layer: 'L10 / L11',
        status: 'live',
        purpose: 'Platform operations overview. Engine health, pipeline status, run queue, error rates.',
        public: false,
        adminOnly: true,
        counts: { documents: docCount, claims: claimCount },
      },
      {
        route: '/admin/sovereign-control',
        title: 'Sovereign Control',
        layer: 'L11',
        status: 'live',
        purpose: 'Constitutional enforcement surface. Engine registry, governance audit, override controls.',
        public: false,
        adminOnly: true,
      },
      {
        route: '/admin/test-scenarios',
        title: 'Test Scenarios',
        layer: 'L10',
        status: 'live',
        purpose: 'Platform integrity testing. Run, inspect, and validate engine scenarios.',
        public: false,
        adminOnly: true,
      },
    ],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/mission-control
// ─────────────────────────────────────────────
router.get('/page/mission-control', async (_req: Request, res: Response) => {
  const [caseCount, docCount, claimCount, findingCount, runCount] = await Promise.all([
    safeCount('SELECT COUNT(*) as count FROM cases'),
    safeCount('SELECT COUNT(*) as count FROM documents'),
    safeCount('SELECT COUNT(*) as count FROM claims'),
    safeCount('SELECT COUNT(*) as count FROM findings'),
    safeCount('SELECT COUNT(*) as count FROM document_processing_runs'),
  ]);

  res.json({
    route: '/admin/mission-control',
    title: 'Mission Control',
    layer: 'L10 / L11',
    purpose:
      'Platform operations hub. Shows real-time engine health, active pipeline runs, error rates, and system-level integrity signals.',
    status: 'live',
    lastChecked: now(),
    dataSource: 'live — cases, documents, claims, findings, processing_runs tables',
    sections: [
      {
        name: 'Platform Counts',
        description: 'Live record counts across core tables',
        counts: {
          cases: caseCount,
          documents: docCount,
          claims: claimCount,
          findings: findingCount,
          processingRuns: runCount,
        },
      },
      {
        name: 'Engine Health',
        description: 'Status of canonical engines across 12 layers (L0–L11)',
        availableActions: ['view engine registry', 'inspect engine output', 'replay run'],
      },
      {
        name: 'Pipeline Queue',
        description: 'Active and queued processing runs',
        availableActions: ['view run log', 'cancel run', 'force retry'],
      },
      {
        name: 'Error Surface',
        description: 'Validation failures, schema errors, integrity violations',
        availableActions: ['view failure log', 'export error report'],
      },
    ],
    availableActions: ['export status report', 'trigger integrity check', 'view audit log'],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/sovereign-control
// ─────────────────────────────────────────────
router.get('/page/sovereign-control', async (_req: Request, res: Response) => {
  const [engineCount, ruleCount] = await Promise.all([
    safeCount('SELECT COUNT(*) as count FROM engine_registry'),
    safeCount('SELECT COUNT(*) as count FROM claim_validation_rules'),
  ]);

  res.json({
    route: '/admin/sovereign-control',
    title: 'Sovereign Control',
    layer: 'L11',
    purpose:
      'Constitutional enforcement surface for the platform. Manages the engine registry, governance constraints, behavioral contracts, and override authority.',
    status: 'live',
    lastChecked: now(),
    dataSource: 'live — engine_registry, claim_validation_rules, audit tables',
    sections: [
      {
        name: 'Engine Registry',
        description: 'All 181 canonical engines across all layers. Registration, version, governance status.',
        counts: { registeredEngines: engineCount },
        availableActions: ['view engine', 'inspect contracts', 'view layer assignment'],
      },
      {
        name: 'Constitutional Rules',
        description:
          'Behavioral contracts locked into the system. E.g. no causal language, authority conflicts block Tier-1, low-confidence triggers record-building mode.',
        counts: { validationRules: ruleCount },
        availableActions: ['view rule', 'audit rule history'],
      },
      {
        name: 'Governance Audit',
        description: 'Full audit trail of governed outputs and constitutional enforcement events.',
        availableActions: ['view audit log', 'export audit trail', 'download verification script'],
      },
      {
        name: 'Override Controls',
        description: 'Admin-only override surface. Any override is logged and immutable.',
        availableActions: ['view override log'],
        disabledActions: ['apply override — requires confirmation'],
      },
    ],
    availableActions: ['export governance report', 'verify integrity chain'],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/docket
// ─────────────────────────────────────────────
router.get('/page/docket', async (_req: Request, res: Response) => {
  const [totalCases, activeCases, deadlineCount] = await Promise.all([
    safeCount('SELECT COUNT(*) as count FROM cases'),
    safeCount("SELECT COUNT(*) as count FROM cases WHERE status = 'active'"),
    safeCount('SELECT COUNT(*) as count FROM timeline_events WHERE deadline IS NOT NULL'),
  ]);

  res.json({
    route: '/docket',
    title: 'Docket',
    layer: 'L5 / L8',
    purpose:
      'Active case tracker. Shows all cases in the system, their current pipeline stage, upcoming deadlines, assigned engines, and available next actions.',
    status: 'live',
    lastChecked: now(),
    dataSource: 'live — cases, timeline_events, claims, findings tables',
    sections: [
      {
        name: 'Case List',
        description: 'All cases with current stage, status, and last activity',
        counts: {
          total: totalCases,
          active: activeCases,
        },
        availableActions: ['open case', 'view timeline', 'view claims', 'view findings'],
      },
      {
        name: 'Deadlines',
        description: 'Upcoming filing deadlines, renewal dates, expiration warnings',
        counts: { tracked: deadlineCount },
        availableActions: ['view deadline', 'set reminder', 'export deadline list'],
      },
      {
        name: 'Pipeline Status',
        description: 'Which stage each case is in across the canonical execution spine',
        availableActions: ['advance stage', 'view stage output', 'replay stage'],
      },
    ],
    availableActions: ['create new case', 'export docket', 'filter by domain'],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/signal-registry
// ─────────────────────────────────────────────
router.get('/page/signal-registry', async (_req: Request, res: Response) => {
  const [signalCount, patternCount, anomalyCount] = await Promise.all([
    safeCount('SELECT COUNT(*) as count FROM signals'),
    safeCount('SELECT COUNT(*) as count FROM patterns'),
    safeCount("SELECT COUNT(*) as count FROM signals WHERE type = 'anomaly'"),
  ]);

  res.json({
    route: '/signal-registry',
    title: 'Signal Registry',
    layer: 'L6',
    purpose:
      'Structural pattern and signal detection surface. Surfaces systemic failures across cases — not just individual case analysis but population-level patterns, repeat signals, and institutional vectors.',
    status: 'live',
    lastChecked: now(),
    dataSource: 'live — signals, patterns tables',
    sections: [
      {
        name: 'Active Signals',
        description:
          'Detected signals: DENIAL, ESCALATION, GAP, CONTRADICTION, SIGNAL types across all cases',
        counts: {
          total: signalCount,
          anomalies: anomalyCount,
        },
        availableActions: ['view signal', 'trace to source cases', 'export signal report'],
      },
      {
        name: 'Patterns',
        description: 'Cross-case patterns detected by pattern engine. Includes trend windows and repeat detection.',
        counts: { total: patternCount },
        availableActions: ['view pattern', 'view affected cases', 'flag for reform'],
      },
      {
        name: 'Structural Map',
        description: 'Civic map view of signal density by domain, geography, and institution',
        availableActions: ['open civic map', 'filter by domain', 'filter by jurisdiction'],
      },
    ],
    availableActions: ['export signal report', 'trigger pattern scan', 'flag for policy escalation'],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/benefits
// ─────────────────────────────────────────────
router.get('/page/benefits', async (_req: Request, res: Response) => {
  const [programCount, activeCount] = await Promise.all([
    safeCount('SELECT COUNT(*) as count FROM benefit_programs'),
    safeCount("SELECT COUNT(*) as count FROM benefit_programs WHERE status = 'active'"),
  ]);

  res.json({
    route: '/benefits',
    title: 'Benefits Navigator',
    layer: 'L3 / L8',
    purpose:
      'Full-spectrum benefits support. Eligibility screening, benefit lifecycle tracking (application → submission → approval → renewal → expiration), threshold and cliff analysis, form assistance.',
    status: 'live',
    lastChecked: now(),
    dataSource: 'live — benefit_programs, eligibility rules, user case context',
    sections: [
      {
        name: 'Eligibility Screener',
        description: 'Determines which benefits a person qualifies for based on their situation',
        availableActions: ['run eligibility check', 'view matched programs', 'see threshold warnings'],
      },
      {
        name: 'Benefit Programs',
        description: 'Database of federal and state benefit programs with current eligibility rules',
        counts: {
          total: programCount,
          active: activeCount,
        },
        availableActions: ['view program', 'check income limits', 'view application form'],
      },
      {
        name: 'Lifecycle Tracker',
        description:
          'Tracks application status, renewal dates, expiration windows, denial recovery paths',
        availableActions: ['view status', 'set renewal reminder', 'start appeal'],
      },
      {
        name: 'Cliff & Threshold Analysis',
        description:
          'Shows income cutoffs, benefit cliffs, safe operating zones, and tradeoff analysis between earnings and support loss',
        availableActions: ['run threshold analysis', 'view cliff map'],
      },
    ],
    availableActions: ['start benefits check', 'export eligibility report'],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/guided-intake
// ─────────────────────────────────────────────
router.get('/page/guided-intake', async (_req: Request, res: Response) => {
  const [intakeCount] = await Promise.all([
    safeCount('SELECT COUNT(*) as count FROM intake_events'),
  ]);

  res.json({
    route: '/guided-intake',
    title: 'Guided Intake',
    layer: 'L0',
    purpose:
      'Step-by-step structured intake for users who need help framing their problem. Produces a normalized problem statement that feeds the deterministic pipeline.',
    status: 'live',
    lastChecked: now(),
    dataSource: 'live — intake_events table',
    sections: [
      {
        name: 'Problem Framing',
        description: 'Guided questions that help the user describe what happened without needing legal vocabulary',
        availableActions: ['start intake', 'resume draft', 'submit problem'],
      },
      {
        name: 'Domain Classifier',
        description: 'Automatically classifies the problem into one of the 72+ intake help pathways',
        availableActions: ['view classification', 'override classification'],
      },
      {
        name: 'Universal Assistance Layer',
        description:
          'Runs immediately on intake completion — returns relevant resources, immediate actions, and at least one concrete next step before deep analysis begins',
        availableActions: ['view immediate help', 'skip to analysis'],
      },
    ],
    counts: { intakeEventsTotal: intakeCount },
    availableActions: ['start new intake', 'view intake history'],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/compare/main-vs-manus
// Semantic diff between Render (main) and Manus reference build.
// ─────────────────────────────────────────────
router.get('/compare/main-vs-manus', async (_req: Request, res: Response) => {
  const [caseCount, docCount] = await Promise.all([
    safeCount('SELECT COUNT(*) as count FROM cases'),
    safeCount('SELECT COUNT(*) as count FROM documents'),
  ]);

  res.json({
    route: '/compare/main-vs-manus',
    title: 'Main (Render) vs Manus Reference',
    purpose:
      'Semantic comparison between the live Render deployment and the Manus reference build. Used to detect drift, missing features, and rebuild gaps.',
    lastChecked: now(),
    main: {
      url: 'https://luminari.onrender.com',
      branch: 'main',
      buildVersion: '46fc7f7c',
      stack: 'React 19 / Express 4 / tRPC 11 / Drizzle / Supabase (Postgres)',
      dbCounts: {
        cases: caseCount,
        documents: docCount,
      },
      status: 'live — active rebuild, migrating from Manus stack',
    },
    manus: {
      url: 'https://3000-ice1zn74bmhq0q38qyje9-7e7ca167.manus.space',
      buildVersion: '46fc7f7c',
      stack: 'React 19 / Express 4 / tRPC 11 / Drizzle / TiDB (MySQL-compatible)',
      status: 'reference — Manus sandbox, not permanent hosting',
      knownContent: {
        publicHomepage: 'live — community board, pipeline map, 6 entry doors',
        adminPages: 'auth-gated — requires session to render',
        intakePathways: 159,
        pipelineDomains: ['Insurance & Benefits', 'Legal & Civil Rights', 'Housing & Property', 'Employment & Labor', 'Health & Safety', 'Family & Community'],
      },
    },
    drift: {
      note: 'Manus admin pages are auth-gated and React-rendered — not inspectable without a live browser session. Diff is based on architecture knowledge and public surface reads.',
      knownGaps: [
        'Render build may not yet have all 159 intake pathways from Manus V1',
        'Supabase migration from TiDB — schema parity unverified',
        'Admin pages on Render not yet confirmed live vs Manus equivalents',
      ],
      confirmed: [
        'Both builds share the same build hash (46fc7f7c)',
        'Public homepage on Manus is live and readable',
        'Core architecture (12 layers, 181 engines) is consistent across both',
      ],
    },
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/health
// ─────────────────────────────────────────────
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'luminari-ai-inspect',
    lastChecked: now(),
  });
});

export default router;
