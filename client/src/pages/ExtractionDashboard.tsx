import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCase } from "@/contexts/CaseContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Search, Download } from "lucide-react";

export function ExtractionDashboard() {
  const { currentCaseId } = useCase();
  const caseId = currentCaseId ?? 0;
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [entitySearch, setEntitySearch] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("");

  // Queries
  const documentsQuery = trpc.extraction.listDocuments.useQuery({
    caseId,
    limit: 100,
  });

  const statsQuery = trpc.extraction.getStats.useQuery({ caseId });
  const entityTypesQuery = trpc.extraction.getEntityTypes.useQuery({ caseId });
  const entitiesQuery = trpc.extraction.searchEntities.useQuery({
    caseId,
    type: entityTypeFilter || undefined,
    query: entitySearch || undefined,
    limit: 100,
  });

  // Mutations
  const startExtractionMutation = trpc.extraction.startExtraction.useMutation({
    onSuccess: () => {
      documentsQuery.refetch();
      statsQuery.refetch();
    },
  });

  const handleStartExtraction = (docId: number) => {
    startExtractionMutation.mutate({ documentId: docId });
  };

  const stats = statsQuery.data?.stats;
  const documents = documentsQuery.data?.documents || [];
  const entities = entitiesQuery.data?.entities || [];
  const entityTypes = entityTypesQuery.data?.types || [];

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Forensic Extraction Control Center</h1>
          <p className="text-muted-foreground">
            Monitor and manage entity extraction from documents
          </p>
        </div>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total Entities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalEntities}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Extracted from documents
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Relationships</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalRelationships}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Entity connections
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.totalDocuments}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  In this case
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Entity Types</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.entitiesByType.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Categories found
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="entities" className="space-y-4">
          <TabsList>
            <TabsTrigger value="entities">Entities</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="types">Entity Types</TabsTrigger>
          </TabsList>

          {/* Entities Tab */}
          <TabsContent value="entities">
            <Card>
              <CardHeader>
                <CardTitle>Extracted Entities</CardTitle>
                <CardDescription>
                  Search and filter entities extracted from documents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search and Filter */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Search entities..."
                      value={entitySearch}
                      onChange={(e) => setEntitySearch(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  {entityTypes.length > 0 && (
                    <select
                      value={entityTypeFilter}
                      onChange={(e) => setEntityTypeFilter(e.target.value)}
                      className="px-3 py-2 border border-input rounded-md bg-background"
                    >
                      <option value="">All Types</option>
                      {entityTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Entities List */}
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {entitiesQuery.isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : entities.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No entities found
                    </p>
                  ) : (
                    entities.map((entity: any) => (
                      <div
                        key={entity.id}
                        className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{entity.name}</p>
                          <p className="text-sm text-muted-foreground">
                            ID: {entity.id} • Case: {entity.caseId}
                          </p>
                        </div>
                        <Badge variant="outline">{entity.type}</Badge>
                      </div>
                    ))
                  )}
                </div>

                {/* Export Button */}
                <Button className="w-full" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export as CSV
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>
                  Manage documents and trigger extractions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {documentsQuery.isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : documents.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No documents found
                    </p>
                  ) : (
                    documents.map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{doc.filename}</p>
                          <p className="text-sm text-muted-foreground">
                            ID: {doc.id} • Status: {doc.status}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              doc.status === "ready"
                                ? "default"
                                : doc.status === "extracting"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {doc.status}
                          </Badge>
                          {doc.status !== "extracting" && (
                            <Button
                              size="sm"
                              onClick={() => handleStartExtraction(doc.id)}
                              disabled={startExtractionMutation.isPending}
                            >
                              {startExtractionMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Entity Types Tab */}
          <TabsContent value="types">
            <Card>
              <CardHeader>
                <CardTitle>Entity Type Breakdown</CardTitle>
                <CardDescription>
                  Distribution of extracted entity types
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats?.entitiesByType && stats.entitiesByType.length > 0 ? (
                    stats.entitiesByType.map((item: any) => (
                      <div key={item.type} className="flex items-center justify-between">
                        <span className="font-medium">{item.type}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-48 bg-secondary rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{
                                width: `${
                                  (item.count / stats.totalEntities) * 100
                                }%`,
                              }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-12 text-right">
                            {item.count}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      No entity types found
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default ExtractionDashboard;
