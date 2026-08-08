import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Users, Search, User, Building, MapPin, FileText, Merge, Upload, AtSign } from "lucide-react";
import { useState, useMemo } from "react";
import PageReadAloud from "@/components/PageReadAloud";

const typeIcon: Record<string, typeof User> = {
  person: User,
  organization: Building,
  location: MapPin,
  address: MapPin,
  contact: AtSign,
  document: FileText,
};

type intake_entity = {
  entity_id: string;
  type: "person" | "organization" | "address" | "contact" | "unknown";
  canonical_name: string;
  raw_mentions: Array<{
    raw_text: string;
    artifact_key: string;
    span_offset: number;
  }>;
  review_candidates: Array<{
    candidate_entity_id: string;
    similarity_type: string;
    distance: number;
    reason: string;
  }>;
};

type displayed_entity = {
  key: string;
  legacyId: number | null;
  name: string;
  type: string;
  description: string | null;
  aliases: unknown;
  canonical: boolean;
  intakeSessionIds: string[];
  sourceReferences: string[];
  reviewCandidateCount: number;
};

function is_intake_entity(value: unknown): value is intake_entity {
  if (!value || typeof value !== "object") return false;
  const entity = value as Record<string, unknown>;
  return (
    typeof entity.entity_id === "string" &&
    typeof entity.type === "string" &&
    typeof entity.canonical_name === "string" &&
    Array.isArray(entity.raw_mentions) &&
    Array.isArray(entity.review_candidates)
  );
}

function entity_identity(type: string, name: string): string {
  return `${type.trim().toLowerCase()}|${name.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

export default function Entities() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const { data: legacyEntities, isLoading: legacyLoading } = trpc.entities.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );
  const { data: intakeProjections, isLoading: intakeLoading } = trpc.analyze.getIntakeSpineLayerProjection.useQuery(
    { caseId: currentCaseId!, layerName: "entity_registry" },
    { enabled: !!currentCaseId }
  );

  const entities = useMemo<displayed_entity[]>(() => {
    const merged = new Map<string, displayed_entity>();

    for (const projection of intakeProjections ?? []) {
      if (!projection.layer_run_id || !Array.isArray(projection.data)) continue;
      for (const value of projection.data) {
        if (!is_intake_entity(value)) continue;
        const identity = entity_identity(value.type, value.canonical_name);
        const existing = merged.get(identity);
        const sourceReferences = value.raw_mentions.map(mention =>
          `${mention.artifact_key}@${mention.span_offset}`,
        );
        if (existing) {
          existing.canonical = true;
          existing.intakeSessionIds = Array.from(new Set([...existing.intakeSessionIds, projection.intake_session_id])).sort();
          existing.sourceReferences = Array.from(new Set([...existing.sourceReferences, ...sourceReferences])).sort();
          existing.reviewCandidateCount = Math.max(existing.reviewCandidateCount, value.review_candidates.length);
          continue;
        }
        merged.set(identity, {
          key: `intake:${projection.intake_session_id}:${value.entity_id}`,
          legacyId: null,
          name: value.canonical_name,
          type: value.type,
          description: null,
          aliases: null,
          canonical: true,
          intakeSessionIds: [projection.intake_session_id],
          sourceReferences: Array.from(new Set(sourceReferences)).sort(),
          reviewCandidateCount: value.review_candidates.length,
        });
      }
    }

    for (const entity of legacyEntities ?? []) {
      const identity = entity_identity(entity.type ?? "unknown", entity.name);
      const existing = merged.get(identity);
      if (existing) {
        existing.legacyId = entity.id;
        existing.description = entity.description ?? null;
        existing.aliases = entity.aliases;
        existing.key = `legacy:${entity.id}|${existing.key}`;
        continue;
      }
      merged.set(identity, {
        key: `legacy:${entity.id}`,
        legacyId: entity.id,
        name: entity.name,
        type: entity.type ?? "unknown",
        description: entity.description ?? null,
        aliases: entity.aliases,
        canonical: false,
        intakeSessionIds: [],
        sourceReferences: [],
        reviewCandidateCount: 0,
      });
    }

    return Array.from(merged.values()).sort((a, b) =>
      a.name.localeCompare(b.name) || a.type.localeCompare(b.type) || a.key.localeCompare(b.key),
    );
  }, [intakeProjections, legacyEntities]);

  const filtered = useMemo(() => {
    if (!search.trim()) return entities;
    const q = search.toLowerCase();
    return entities.filter(entity => entity.name.toLowerCase().includes(q) || entity.type.toLowerCase().includes(q));
  }, [entities, search]);

  const canonicalCount = entities.filter(entity => entity.canonical).length;
  const isLoading = legacyLoading || intakeLoading;

  if (!currentCaseId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Select a case first</p>
        <Button variant="outline" onClick={() => setLocation("/cases")}>Manage Cases</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            People, organizations, addresses, and contacts from sealed Intake Spine output and preserved case records
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/entities/dedup")}
          className="shrink-0"
        >
          <Merge className="h-4 w-4 mr-2" />
          Deduplication
        </Button>
      </div>

      {canonicalCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">Intake Spine</Badge>
          {canonicalCount} entity record{canonicalCount === 1 ? "" : "s"} carry sealed canonical provenance
        </div>
      )}

      {entities.length > 0 && (
        <PageReadAloud
          text={entities.map(entity => `${entity.type}: ${entity.name}. ${entity.description || ""}`).join(" Next. ")}
          label="Listen to entity list"
        />
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search entities..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(index => <div key={index} className="h-16 bg-muted/50 rounded-md animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search
                ? "No entities match your search"
                : "No entities identified yet. Preserve evidence, then explicitly run the Universal Intake Spine from the case workspace."}
            </p>
            {!search && (
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={() => setLocation("/upload")} className="gap-1.5 text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  Upload Evidence
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/control-room")} className="gap-1.5 text-xs">
                  Universal Intake Spine
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map(entity => {
            const Icon = typeIcon[entity.type] || User;
            const canOpenLegacyDetail = entity.legacyId !== null;
            return (
              <Card
                key={entity.key}
                className={canOpenLegacyDetail ? "cursor-pointer hover:border-primary/30 transition-colors" : "border-primary/10"}
                onClick={() => {
                  if (entity.legacyId !== null) setLocation(`/entities/${entity.legacyId}`);
                }}
              >
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium break-words">{entity.name}</p>
                      {entity.canonical && <Badge variant="outline" className="text-[9px]">Intake Spine</Badge>}
                      {entity.canonical && entity.legacyId !== null && <Badge variant="secondary" className="text-[9px]">legacy-linked</Badge>}
                    </div>
                    {typeof entity.aliases === "string" && entity.aliases && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        Also: {entity.aliases}
                      </p>
                    )}
                    {entity.canonical && entity.sourceReferences.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1 break-all">
                        Sources: {entity.sourceReferences.slice(0, 3).join(" · ")}
                        {entity.sourceReferences.length > 3 ? ` · +${entity.sourceReferences.length - 3} more` : ""}
                      </p>
                    )}
                    {entity.canonical && entity.reviewCandidateCount > 0 && (
                      <p className="text-[10px] text-amber-500/80 mt-1">
                        {entity.reviewCandidateCount} near-match review candidate{entity.reviewCandidateCount === 1 ? "" : "s"}; not auto-merged
                      </p>
                    )}
                    {entity.canonical && !canOpenLegacyDetail && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Canonical read-only projection; no legacy entity record has been fabricated.
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                    {entity.type}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
