import { useCase } from "@/contexts/CaseContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Users, Search, User, Building, MapPin, FileText, Merge, Upload } from "lucide-react";
import { useState, useMemo } from "react";
import PageReadAloud from "@/components/PageReadAloud";

const typeIcon: Record<string, typeof User> = {
  person: User,
  organization: Building,
  location: MapPin,
  document: FileText,
};

export default function Entities() {
  const { currentCaseId } = useCase();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const { data: entities, isLoading } = trpc.entities.list.useQuery(
    { caseId: currentCaseId! },
    { enabled: !!currentCaseId }
  );

  const filtered = useMemo(() => {
    if (!entities) return [];
    if (!search.trim()) return entities;
    const q = search.toLowerCase();
    return entities.filter(e => e.name.toLowerCase().includes(q) || e.type.toLowerCase().includes(q));
  }, [entities, search]);

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
            People, organizations, and locations identified across documents
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

      {/* Page-level Read Aloud */}
      {entities && entities.length > 0 && (
        <PageReadAloud
          text={entities.map(e => `${e.type}: ${e.name}. ${e.description || ""}`).join(" Next. ")}
          label="Listen to entity list"
        />
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entities..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-md animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? "No entities match your search" : "No entities identified yet. Upload and analyze documents first."}
            </p>
            {!search && (
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={() => setLocation("/upload")} className="gap-1.5 text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  Upload Evidence
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="gap-1.5 text-xs">
                  Back to Overview
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((entity) => {
            const Icon = typeIcon[entity.type] || User;
            return (
              <Card
                key={entity.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setLocation(`/entities/${entity.id}`)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{entity.name}</p>
                    {typeof entity.aliases === 'string' && entity.aliases && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        Also: {entity.aliases}
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
