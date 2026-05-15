/**
 * Category Data Module
 *
 * Reads the Unified Pipeline Registry and intake mappings to serve
 * structured category data to the frontend. Each category gets its
 * pipelines, situations, lenses, oversight entities, and escalation
 * profiles — everything needed to render a category landing page.
 */
import { readFileSync } from "fs";
import { join } from "path";

const configDir = join(import.meta.dirname, "config");

// ─── Types ───
export interface UPRPipeline {
  pipeline_id: string;
  category: string;
  description: string;
  aliases: string[];
  default_lenses: string[];
  situations: string[];
  benefit_categories: string[];
  program_ids: string[];
  records_entitlements: string[];
  foia_profile: {
    target_agencies: string[];
    record_types: string[];
    exemption_risks: string[];
  };
  workflow_id: string;
  oversight_entities: string[];
  pattern_signals: string[];
  escalation_profile: Record<string, string>;
}

export interface IntakeMapping {
  label: string;
  pre_lenses: string[];
  description: string;
}

export interface CategorySummary {
  category: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  pipeline_count: number;
  situation_count: number;
  pipelines: {
    pipeline_id: string;
    description: string;
    aliases: string[];
    default_lenses: string[];
    situation_count: number;
    oversight_entities: string[];
    escalation_profile: Record<string, string>;
  }[];
}

export interface PipelineDetail {
  pipeline_id: string;
  category: string;
  description: string;
  aliases: string[];
  default_lenses: string[];
  situations: string[];
  benefit_categories: string[];
  program_ids: string[];
  records_entitlements: string[];
  foia_profile: {
    target_agencies: string[];
    record_types: string[];
    exemption_risks: string[];
  };
  workflow_id: string;
  oversight_entities: string[];
  pattern_signals: string[];
  escalation_profile: Record<string, string>;
  intake_mappings: Record<string, IntakeMapping>;
}

// ─── Category Display Config ───
const CATEGORY_CONFIG: Record<string, { label: string; description: string; icon: string; color: string }> = {
  family: {
    label: "Family & Custody",
    description: "Custody disputes, child welfare, foster care, guardianship, domestic violence, and parental rights",
    icon: "👨‍👩‍👧",
    color: "pink",
  },
  elder: {
    label: "Elder Care & Protection",
    description: "Nursing home abuse, elder exploitation, disability rights, long-term care, and vulnerable adult protection",
    icon: "🤝",
    color: "purple",
  },
  housing: {
    label: "Housing & Tenant Rights",
    description: "Eviction defense, housing discrimination, landlord harassment, foreclosure, and habitability disputes",
    icon: "🏠",
    color: "blue",
  },
  financial: {
    label: "Financial & Consumer",
    description: "Predatory lending, consumer fraud, identity theft, bankruptcy, securities fraud, and financial exploitation",
    icon: "💰",
    color: "yellow",
  },
  employment: {
    label: "Employment & Workplace",
    description: "Workplace discrimination, wrongful termination, wage theft, workers compensation, and labor violations",
    icon: "💼",
    color: "amber",
  },
  benefits: {
    label: "Government Benefits",
    description: "SNAP denial, veterans benefits, Social Security disability, Medicaid, and public assistance disputes",
    icon: "📋",
    color: "green",
  },
  environment: {
    label: "Environmental & Public Health",
    description: "Water contamination, air quality, toxic exposure, land use disputes, and environmental violations",
    icon: "🌿",
    color: "emerald",
  },
  immigration: {
    label: "Immigration & Asylum",
    description: "Asylum claims, detention abuse, work authorization, consular processing, and immigration benefits",
    icon: "🌍",
    color: "indigo",
  },
  insurance: {
    label: "Insurance & Healthcare",
    description: "Claim denials, medical malpractice, hospital billing, disability claims, and prior authorization abuse",
    icon: "🏥",
    color: "cyan",
  },
  justice: {
    label: "Justice & Accountability",
    description: "Police misconduct, wrongful conviction, prosecutorial misconduct, civil rights violations, and government accountability",
    icon: "⚖️",
    color: "red",
  },
  lgbtq_rights: {
    label: "LGBTQ+ Rights",
    description: "Discrimination, conversion therapy harm, healthcare denial, family recognition, and youth protection",
    icon: "🏳️‍🌈",
    color: "violet",
  },
  market: {
    label: "Market & Corporate Accountability",
    description: "Market concentration, antitrust violations, corporate capture, supply chain exploitation, and regulatory capture",
    icon: "📊",
    color: "orange",
  },
  mental_health: {
    label: "Mental Health System",
    description: "Involuntary holds, polypharmacy harm, discharge failures, restraint and seclusion, and record correction",
    icon: "🧠",
    color: "sky",
  },
  public_safety: {
    label: "Public Safety",
    description: "Emergency safety, domestic violence emergency, missing persons, human trafficking, and disaster relief",
    icon: "🚨",
    color: "rose",
  },
  tribal: {
    label: "Tribal Law & Indigenous Rights",
    description: "Tribal sovereignty, treaty rights, ICWA compliance, MMIW cases, and tribal land rights",
    icon: "🪶",
    color: "emerald",
  },
  general: {
    label: "General Investigation",
    description: "Legal research, records requests, complaint filing, document review, and cross-border jurisdiction disputes",
    icon: "🔍",
    color: "slate",
  },
};

// ─── Data Loading (cached) ───
let _uprCache: UPRPipeline[] | null = null;
let _intakeCache: Record<string, IntakeMapping> | null = null;
let _pipelineTypesCache: any = null;

function loadUPR(): UPRPipeline[] {
  if (!_uprCache) {
    const raw = readFileSync(join(configDir, "unified_pipeline_registry.json"), "utf-8");
    const data = JSON.parse(raw);
    _uprCache = data.pipelines as UPRPipeline[];
  }
  return _uprCache;
}

function loadIntakeMappings(): Record<string, IntakeMapping> {
  if (!_intakeCache) {
    const raw = readFileSync(join(configDir, "intake_pre_lens_map.json"), "utf-8");
    const data = JSON.parse(raw);
    _intakeCache = data.intake_mappings as Record<string, IntakeMapping>;
  }
  return _intakeCache;
}

function loadPipelineTypes(): any {
  if (!_pipelineTypesCache) {
    const raw = readFileSync(join(configDir, "pipeline_types.json"), "utf-8");
    _pipelineTypesCache = JSON.parse(raw);
  }
  return _pipelineTypesCache;
}

// ─── Public API ───

/** Get all categories with summary data */
export function getAllCategories(): CategorySummary[] {
  const upr = loadUPR();
  const categories = Object.keys(CATEGORY_CONFIG);

  return categories.map((cat) => {
    const pipelines = upr.filter((p) => p.category === cat);
    const totalSituations = pipelines.reduce((sum, p) => sum + (p.situations?.length || 0), 0);
    const config = CATEGORY_CONFIG[cat];

    return {
      category: cat,
      label: config.label,
      description: config.description,
      icon: config.icon,
      color: config.color,
      pipeline_count: pipelines.length,
      situation_count: totalSituations,
      pipelines: pipelines.map((p) => ({
        pipeline_id: p.pipeline_id,
        description: p.description,
        aliases: p.aliases || [],
        default_lenses: p.default_lenses || [],
        situation_count: p.situations?.length || 0,
        oversight_entities: p.oversight_entities || [],
        escalation_profile: p.escalation_profile,
      })),
    };
  });
}

/** Get a single category with full pipeline data */
export function getCategoryDetail(categoryId: string): CategorySummary | null {
  const all = getAllCategories();
  return all.find((c) => c.category === categoryId) || null;
}

/** Get full pipeline detail including intake mappings */
export function getPipelineDetail(pipelineId: string): PipelineDetail | null {
  const upr = loadUPR();
  const pipeline = upr.find((p) => p.pipeline_id === pipelineId);
  if (!pipeline) return null;

  const intakeMappings = loadIntakeMappings();
  const pipelineIntake: Record<string, IntakeMapping> = {};

  // Find intake mappings for this pipeline's situations
  for (const situation of pipeline.situations || []) {
    if (intakeMappings[situation]) {
      pipelineIntake[situation] = intakeMappings[situation];
    }
  }

  return {
    ...pipeline,
    intake_mappings: pipelineIntake,
  };
}

/** Get category config (label, icon, color) */
export function getCategoryConfig(categoryId: string): { label: string; description: string; icon: string; color: string } | null {
  return CATEGORY_CONFIG[categoryId] || null;
}

/** Get all category configs */
export function getAllCategoryConfigs(): Record<string, { label: string; description: string; icon: string; color: string }> {
  return { ...CATEGORY_CONFIG };
}

/** Get pipeline labels from pipeline_types.json */
export function getPipelineLabel(pipelineId: string): string {
  const pt = loadPipelineTypes();
  const cats = pt.categories || {};
  for (const catData of Object.values(cats) as unknown as any[]) {
    for (const p of catData.pipelines || []) {
      if (p.id === pipelineId) return p.label;
    }
  }
  // Fallback: humanize the ID
  return pipelineId
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

/** Clear caches (for testing) */
export function clearCategoryDataCache(): void {
  _uprCache = null;
  _intakeCache = null;
  _pipelineTypesCache = null;
}
