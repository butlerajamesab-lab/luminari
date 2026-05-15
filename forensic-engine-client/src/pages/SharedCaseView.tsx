import { trpc } from "@/lib/trpc";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, Clock, FileText, Users, MessageSquareQuote, Scale,
  Lightbulb, CalendarDays, AlertTriangle, Link2, Loader2,
  ShieldAlert, Lock,
} from "lucide-react";

export default function SharedCaseView() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";

  const { data, isLoading, error } = trpc.share.access.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <div>
            <h2 className="text-lg font-semibold">Loading Shared Case</h2>
            <p className="text-sm text-muted-foreground">Verifying access...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const isExpired = error.message.includes("expired");
    const isRevoked = error.message.includes("revoked");
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            {isExpired ? (
              <Clock className="h-12 w-12 text-amber-400 mx-auto" />
            ) : isRevoked ? (
              <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
            ) : (
              <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
            )}
            <div>
              <h2 className="text-lg font-semibold">
                {isExpired ? "Link Expired" : isRevoked ? "Access Revoked" : "Link Not Found"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isExpired
                  ? "This share link has expired. Please ask the case owner to create a new one."
                  : isRevoked
                  ? "The case owner has revoked access to this link."
                  : "This share link is invalid or no longer exists."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const expiryDate = new Date(data.expiresAt).toLocaleDateString();

  return (
    <div className="min-h-screen bg-background">
      {/* Header banner */}
      <div className="bg-primary/10 border-b border-primary/20">
        <div className="container max-w-6xl py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-primary" />
              <div>
                <h1 className="text-lg font-semibold">Shared Case View</h1>
                <p className="text-xs text-muted-foreground">
                  {data.label ? `"${data.label}" — ` : ""}Read-only access via secure link
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] gap-1">
                <Clock className="h-3 w-3" />
                Expires {expiryDate}
              </Badge>
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Lock className="h-3 w-3" />
                {data.permissions === "read_export" ? "Read & Export" : "Read Only"}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Powered by Luminari */}
      <div className="bg-muted/30 border-b border-border/50">
        <div className="container max-w-6xl py-2 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Powered by</span>
          <span className="text-xs font-semibold text-primary">Luminari</span>
          <span className="text-[10px] text-muted-foreground">— Neutral Forensic Engine</span>
        </div>
      </div>

      {/* Case title */}
      <div className="container max-w-6xl py-6">
        <h2 className="text-2xl font-bold">{data.case.name}</h2>
        {data.case.description && (
          <p className="text-sm text-muted-foreground mt-1">{data.case.description}</p>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-6">
          <StatCard icon={FileText} label="Documents" value={data.documents.length} />
          <StatCard icon={Users} label="Entities" value={data.entities.length} />
          <StatCard icon={MessageSquareQuote} label="Quotes" value={data.quotes.length} />
          <StatCard icon={Scale} label="Claims" value={data.claims.length} />
          <StatCard icon={Lightbulb} label="Findings" value={data.findings.length} />
          <StatCard icon={CalendarDays} label="Events" value={data.events.length} />
          <StatCard icon={AlertTriangle} label="Signals" value={data.signalFlags.length} />
          <StatCard icon={Link2} label="Correlations" value={data.correlations.length} />
        </div>

        {/* Tabbed content */}
        <Tabs defaultValue="findings" className="mt-8">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="findings" className="text-xs">Findings</TabsTrigger>
            <TabsTrigger value="events" className="text-xs">Timeline</TabsTrigger>
            <TabsTrigger value="entities" className="text-xs">Entities</TabsTrigger>
            <TabsTrigger value="quotes" className="text-xs">Quotes</TabsTrigger>
            <TabsTrigger value="claims" className="text-xs">Claims</TabsTrigger>
            <TabsTrigger value="signals" className="text-xs">Signals</TabsTrigger>
            <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="findings" className="mt-4 space-y-3">
            {data.findings.length === 0 ? (
              <EmptyState icon={Lightbulb} text="No findings extracted yet." />
            ) : (
              data.findings.map((f: any) => (
                <Card key={f.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-medium">{f.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{f.description}</p>
                      </div>
                      <Badge variant="outline" className="text-[9px] shrink-0">
                        {f.evidentiaryWeight}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="events" className="mt-4 space-y-3">
            {data.events.length === 0 ? (
              <EmptyState icon={CalendarDays} text="No timeline events extracted yet." />
            ) : (
              data.events.map((e: any) => (
                <Card key={e.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      {e.dateOccurred && (
                        <Badge variant="secondary" className="text-[9px]">{e.dateOccurred}</Badge>
                      )}
                      <Badge variant="outline" className="text-[9px]">{e.eventType}</Badge>
                    </div>
                    <h4 className="text-sm font-medium">{e.title}</h4>
                    {e.description && <p className="text-xs text-muted-foreground mt-1">{e.description}</p>}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="entities" className="mt-4">
            {data.entities.length === 0 ? (
              <EmptyState icon={Users} text="No entities extracted yet." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.entities.map((e: any) => (
                  <Card key={e.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{e.name}</span>
                        <Badge variant="outline" className="text-[9px]">{e.type}</Badge>
                      </div>
                      {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="quotes" className="mt-4 space-y-3">
            {data.quotes.length === 0 ? (
              <EmptyState icon={MessageSquareQuote} text="No quotes extracted yet." />
            ) : (
              data.quotes.map((q: any) => (
                <Card key={q.id}>
                  <CardContent className="py-3 px-4">
                    <blockquote className="text-sm italic border-l-2 border-primary/40 pl-3">
                      "{q.text}"
                    </blockquote>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                      {q.pageNumber && <span>Page {q.pageNumber}</span>}
                      {q.context && <span>· {q.context.slice(0, 80)}...</span>}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="claims" className="mt-4 space-y-3">
            {data.claims.length === 0 ? (
              <EmptyState icon={Scale} text="No claims extracted yet." />
            ) : (
              data.claims.map((c: any) => (
                <Card key={c.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm">{c.claimText}</p>
                      <div className="flex gap-1 shrink-0">
                        <Badge variant="outline" className="text-[9px]">{c.claimType}</Badge>
                        <Badge variant="secondary" className="text-[9px]">{c.evidentiaryWeight}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="signals" className="mt-4 space-y-3">
            {data.signalFlags.length === 0 ? (
              <EmptyState icon={AlertTriangle} text="No signal flags detected." />
            ) : (
              data.signalFlags.map((s: any) => (
                <Card key={s.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <Badge variant="outline" className="text-[9px] mb-1">{s.flagType}</Badge>
                        <p className="text-xs text-muted-foreground">{s.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            {data.documents.length === 0 ? (
              <EmptyState icon={FileText} text="No documents uploaded yet." />
            ) : (
              <div className="space-y-2">
                {data.documents.map((d: any) => (
                  <Card key={d.id}>
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{d.filename}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {d.documentType && <Badge variant="outline" className="text-[9px]">{d.documentType}</Badge>}
                        {d.pageCount && <span className="text-[10px] text-muted-foreground">{d.pageCount} pages</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-3 px-3 text-center">
        <Icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
        <div className="text-lg font-bold">{value}</div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
