/**
 * Layer 0 / Layer 1 Runtime Engine
 * 
 * Layer 0: Policy flags — always-on contextual warnings activated by pipeline + state
 * Layer 1: Help cards — problem-cluster-organized guidance cards with routing rules
 * 
 * Both layers are registry-driven: JSON data in /config/states/{state}_layer0_flags.json
 * and /config/states/{state}_layer1_cards.json. No pipeline logic changes required.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Layer0Flag {
  flag_id: string;
  title: string;
  severity: "info" | "warning" | "alert";
  trigger: {
    pipelines: string[];
    benefit_categories: string[];
    conditions: string[];
  };
  message: string;
  action_items: string[];
  legal_basis: string;
  bundle_pairings: string[];
}

export interface Layer0FlagsFile {
  meta: {
    state: string;
    state_name: string;
    schema_version: string;
    last_updated: string;
    description: string;
  };
  flags: Layer0Flag[];
}

export interface HelpCard {
  card_id: string;
  title: string;
  summary: string;
  who_qualifies: string;
  how_to_apply: string;
  phone: string;
  website: string;
  documents_needed: string[];
  program_ids: string[];
  urgency: "immediate" | "urgent" | "standard";
  routing_tags: string[];
}

export interface HelpCardCluster {
  cluster_id: string;
  cluster_name: string;
  icon: string;
  cards: HelpCard[];
}

export interface Layer1CardsFile {
  meta: {
    state: string;
    state_name: string;
    schema_version: string;
    last_updated: string;
    description: string;
  };
  clusters: HelpCardCluster[];
}

export interface Layer0ResolveInput {
  state: string;
  pipeline_id?: string;
  benefit_category?: string;
  situation_text?: string;
}

export interface Layer1ResolveInput {
  state: string;
  pipeline_id?: string;
  benefit_category?: string;
  situation_text?: string;
  demographics?: {
    is_veteran?: boolean;
    is_elderly?: boolean;
    has_children?: boolean;
    is_disabled?: boolean;
  };
}

export interface ResolvedLayer0 {
  state: string;
  flags: Layer0Flag[];
  total_flags: number;
  by_severity: { info: number; warning: number; alert: number };
}

export interface ResolvedLayer1 {
  state: string;
  clusters: HelpCardCluster[];
  total_cards: number;
  by_urgency: { immediate: number; urgent: number; standard: number };
}

// ─── Registry Cache ──────────────────────────────────────────────────────────

const configDir = join(import.meta.dirname, "config", "states");

const layer0Cache = new Map<string, Layer0FlagsFile>();
const layer1Cache = new Map<string, Layer1CardsFile>();

function loadLayer0(state: string): Layer0FlagsFile | null {
  const key = state.toLowerCase();
  if (layer0Cache.has(key)) return layer0Cache.get(key)!;
  
  const filePath = join(configDir, `${key}_layer0_flags.json`);
  if (!existsSync(filePath)) return null;
  
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as Layer0FlagsFile;
  layer0Cache.set(key, data);
  return data;
}

function loadLayer1(state: string): Layer1CardsFile | null {
  const key = state.toLowerCase();
  if (layer1Cache.has(key)) return layer1Cache.get(key)!;
  
  const filePath = join(configDir, `${key}_layer1_cards.json`);
  if (!existsSync(filePath)) return null;
  
  const data = JSON.parse(readFileSync(filePath, "utf-8")) as Layer1CardsFile;
  layer1Cache.set(key, data);
  return data;
}

// ─── Layer 0: Policy Flag Resolution ─────────────────────────────────────────

/**
 * Resolve Layer 0 policy flags for a given state + context.
 * Returns all matching flags sorted by severity (alert > warning > info).
 */
export function resolveLayer0Flags(input: Layer0ResolveInput): ResolvedLayer0 {
  const data = loadLayer0(input.state);
  if (!data) {
    return { state: input.state, flags: [], total_flags: 0, by_severity: { info: 0, warning: 0, alert: 0 } };
  }

  const situationWords = (input.situation_text || "").toLowerCase().split(/\s+/);

  const matched = data.flags.filter(flag => {
    // Pipeline match
    if (input.pipeline_id && flag.trigger.pipelines.length > 0) {
      if (flag.trigger.pipelines.includes(input.pipeline_id)) return true;
    }

    // Benefit category match
    if (input.benefit_category && flag.trigger.benefit_categories.length > 0) {
      if (flag.trigger.benefit_categories.includes(input.benefit_category)) return true;
    }

    // Condition match (keywords in situation text)
    if (flag.trigger.conditions.length > 0 && input.situation_text) {
      const conditionMatch = flag.trigger.conditions.some(cond =>
        situationWords.some(word => word.includes(cond.toLowerCase()))
      );
      if (conditionMatch) return true;
    }

    // If no trigger filters are specified, flag is always active
    if (flag.trigger.pipelines.length === 0 && 
        flag.trigger.benefit_categories.length === 0 && 
        flag.trigger.conditions.length === 0) {
      return true;
    }

    return false;
  });

  // Sort by severity: alert > warning > info
  const severityOrder = { alert: 0, warning: 1, info: 2 };
  matched.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    state: input.state,
    flags: matched,
    total_flags: matched.length,
    by_severity: {
      info: matched.filter(f => f.severity === "info").length,
      warning: matched.filter(f => f.severity === "warning").length,
      alert: matched.filter(f => f.severity === "alert").length,
    },
  };
}

/**
 * Get ALL flags for a state (unfiltered). Useful for admin/manifest views.
 */
export function getAllLayer0Flags(state: string): Layer0Flag[] {
  const data = loadLayer0(state);
  return data ? data.flags : [];
}

// ─── Layer 1: Help Card Resolution ──────────────────────────────────────────

/**
 * Resolve Layer 1 help cards for a given state + context.
 * Returns matching clusters with cards filtered by relevance, sorted by urgency.
 */
export function resolveLayer1Cards(input: Layer1ResolveInput): ResolvedLayer1 {
  const data = loadLayer1(input.state);
  if (!data) {
    return { state: input.state, clusters: [], total_cards: 0, by_urgency: { immediate: 0, urgent: 0, standard: 0 } };
  }

  const situationWords = (input.situation_text || "").toLowerCase().split(/\s+/);
  const hasContext = !!(input.pipeline_id || input.benefit_category || input.situation_text);

  // If no context, return all clusters with all cards
  if (!hasContext) {
    const allCards = data.clusters.flatMap(c => c.cards);
    return {
      state: input.state,
      clusters: data.clusters,
      total_cards: allCards.length,
      by_urgency: {
        immediate: allCards.filter(c => c.urgency === "immediate").length,
        urgent: allCards.filter(c => c.urgency === "urgent").length,
        standard: allCards.filter(c => c.urgency === "standard").length,
      },
    };
  }

  // Filter cards by relevance
  const filteredClusters: HelpCardCluster[] = [];

  for (const cluster of data.clusters) {
    const matchedCards = cluster.cards.filter(card => {
      // Pipeline-based routing
      if (input.pipeline_id) {
        if (card.routing_tags.some(tag => input.pipeline_id!.includes(tag))) return true;
      }

      // Benefit category routing
      if (input.benefit_category) {
        if (card.routing_tags.includes(input.benefit_category)) return true;
      }

      // Situation text routing
      if (input.situation_text) {
        if (card.routing_tags.some(tag => situationWords.some(w => w.includes(tag) || tag.includes(w)))) return true;
      }

      return false;
    });

    if (matchedCards.length > 0) {
      // Sort cards by urgency: immediate > urgent > standard
      const urgencyOrder = { immediate: 0, urgent: 1, standard: 2 };
      matchedCards.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

      filteredClusters.push({
        ...cluster,
        cards: matchedCards,
      });
    }
  }

  const allMatchedCards = filteredClusters.flatMap(c => c.cards);

  return {
    state: input.state,
    clusters: filteredClusters,
    total_cards: allMatchedCards.length,
    by_urgency: {
      immediate: allMatchedCards.filter(c => c.urgency === "immediate").length,
      urgent: allMatchedCards.filter(c => c.urgency === "urgent").length,
      standard: allMatchedCards.filter(c => c.urgency === "standard").length,
    },
  };
}

/**
 * Get ALL help card clusters for a state (unfiltered).
 */
export function getAllLayer1Cards(state: string): HelpCardCluster[] {
  const data = loadLayer1(state);
  if (!data) return [];
  // Some states use 'clusters' key, others may not have it
  return data.clusters || [];
}

// ─── Discovery ───────────────────────────────────────────────────────────────

/**
 * Get all states that have Layer 0 and/or Layer 1 data.
 */
export function getLayerCoverage(): {
  states_with_layer0: string[];
  states_with_layer1: string[];
  states_with_both: string[];
} {
  if (!existsSync(configDir)) {
    return { states_with_layer0: [], states_with_layer1: [], states_with_both: [] };
  }

  const files = readdirSync(configDir);
  const layer0States = files
    .filter(f => f.endsWith("_layer0_flags.json"))
    .map(f => f.replace("_layer0_flags.json", "").toUpperCase());
  const layer1States = files
    .filter(f => f.endsWith("_layer1_cards.json"))
    .map(f => f.replace("_layer1_cards.json", "").toUpperCase());
  const bothStates = layer0States.filter(s => layer1States.includes(s));

  return {
    states_with_layer0: layer0States.sort(),
    states_with_layer1: layer1States.sort(),
    states_with_both: bothStates.sort(),
  };
}

/**
 * Get aggregate statistics across all states with Layer 0/1 data.
 */
export function getLayerStats(): {
  total_states: number;
  total_flags: number;
  total_clusters: number;
  total_cards: number;
  by_state: Array<{
    state: string;
    flags: number;
    clusters: number;
    cards: number;
  }>;
} {
  const coverage = getLayerCoverage();
  const allStates = Array.from(new Set([...coverage.states_with_layer0, ...coverage.states_with_layer1])).sort();

  let totalFlags = 0;
  let totalClusters = 0;
  let totalCards = 0;
  const byState: Array<{ state: string; flags: number; clusters: number; cards: number }> = [];

  for (const state of allStates) {
    const flags = getAllLayer0Flags(state);
    const clusters = getAllLayer1Cards(state);
    const cards = clusters.reduce((sum, c) => sum + (c.cards?.length || (c as any).programs?.length || 0), 0);

    totalFlags += flags.length;
    totalClusters += clusters.length;
    totalCards += cards;

    byState.push({ state, flags: flags.length, clusters: clusters.length, cards });
  }

  return {
    total_states: allStates.length,
    total_flags: totalFlags,
    total_clusters: totalClusters,
    total_cards: totalCards,
    by_state: byState,
  };
}
