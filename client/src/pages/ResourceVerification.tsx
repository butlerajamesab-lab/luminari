import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Flag,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Phone,
  Mail,
  Globe,
  Building2,
  XCircle,
  RotateCcw,
  Activity,
  TrendingDown,
  BarChart3,
  Download,
} from "lucide-react";

// ─── Audit Dashboard Tab ───

function AuditDashboard() {
  const { data: audit, isLoading } = trpc.resourceVerification.audit.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!audit) return null;

  const { stats, byDomain, byType, staleResources, flaggedResources } = audit;

  const healthColor =
    stats.healthScore >= 70
      ? "text-emerald-500"
      : stats.healthScore >= 40
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div className="space-y-6">
      {/* Health Score Banner */}
      <Card className="border-2 border-border/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground font-medium">Resource Health Score</p>
              <p className={`text-5xl font-bold ${healthColor}`}>{stats.healthScore}%</p>
              <p className="text-sm text-muted-foreground mt-1">
                {stats.verified} of {stats.total} resources verified
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 rounded-lg bg-emerald-500/10">
                <p className="text-2xl font-bold text-emerald-500">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
              <div className="p-3 rounded-lg bg-red-500/10">
                <p className="text-2xl font-bold text-red-500">{stats.inactive}</p>
                <p className="text-xs text-muted-foreground">Inactive</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-500/10">
                <p className="text-2xl font-bold text-amber-500">{stats.stale}</p>
                <p className="text-xs text-muted-foreground">Stale (90d+)</p>
              </div>
              <div className="p-3 rounded-lg bg-orange-500/10">
                <p className="text-2xl font-bold text-orange-500">{stats.flagged}</p>
                <p className="text-xs text-muted-foreground">Flagged</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Verification by Domain */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Verification by Domain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {byDomain.map((d: any) => {
              const verifiedPct = d.total > 0 ? Math.round((d.verified / d.total) * 100) : 0;
              return (
                <div key={d.domain} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-32 truncate capitalize">{d.domain}</span>
                  <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${verifiedPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {d.verified}/{d.total}
                  </span>
                  {d.flagged > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {d.flagged} flagged
                    </Badge>
                  )}
                  {d.stale > 0 && (
                    <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30">
                      {d.stale} stale
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Verification by Resource Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Verification by Resource Type
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {byType.map((t: any) => (
              <div key={t.resourceType} className="p-3 rounded-lg border bg-card">
                <p className="text-xs text-muted-foreground capitalize">
                  {t.resourceType.replace(/_/g, " ")}
                </p>
                <p className="text-lg font-bold">{t.total}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-emerald-500">{t.verified} verified</span>
                  {t.flagged > 0 && (
                    <span className="text-xs text-red-500">{t.flagged} flagged</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stale Resources */}
      {staleResources.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-500">
              <TrendingDown className="h-4 w-4" /> Most Stale Resources (90+ days unverified)
            </CardTitle>
            <CardDescription>
              These resources haven't been verified recently and may contain outdated information.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {staleResources.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.domain} · {r.resourceType.replace(/_/g, " ")}
                      {r.agency && ` · ${r.agency}`}
                    </p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-xs text-amber-500">
                      {r.lastVerifiedAt
                        ? `Last verified: ${new Date(Number(r.lastVerifiedAt)).toLocaleDateString()}`
                        : "Never verified"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flagged Resources */}
      {flaggedResources.length > 0 && (
        <Card className="border-red-500/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-500">
              <Flag className="h-4 w-4" /> Flagged Resources
            </CardTitle>
            <CardDescription>
              These resources have been flagged for review and are excluded from matching results.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {flaggedResources.map((r: any) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.domain} · {r.resourceType.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-red-400 mt-1">Reason: {r.flaggedReason}</p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-xs text-muted-foreground">
                      by {r.verifiedBy || "system"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Resource List Tab ───

function ResourceList() {
  const utils = trpc.useUtils();

  // Filters
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<string>("all");
  const [domain, setDomain] = useState<string>("all");
  const [resourceType, setResourceType] = useState<string>("all");
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("lastVerifiedAt");
  const [sortDir, setSortDir] = useState<string>("asc");

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Flag dialog
  const [flagDialog, setFlagDialog] = useState<{ open: boolean; resourceId: number | null }>({
    open: false,
    resourceId: null,
  });
  const [flagReason, setFlagReason] = useState("");

  // Debounce search
  useState(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  });

  const { data: filterOptions } = trpc.resourceVerification.filterOptions.useQuery();

  const { data, isLoading } = trpc.resourceVerification.list.useQuery({
    page,
    pageSize: 25,
    verificationStatus: verificationStatus as any,
    domain: domain === "all" ? undefined : domain,
    resourceType: resourceType === "all" ? undefined : resourceType,
    staleOnly,
    search: debouncedSearch || undefined,
    sortBy: sortBy as any,
    sortDir: sortDir as any,
  });

  const verifyMutation = trpc.resourceVerification.verify.useMutation({
    onSuccess: () => {
      utils.resourceVerification.list.invalidate();
      utils.resourceVerification.audit.invalidate();
      toast.success("Resource verified — status updated.");
    },
  });

  const bulkVerifyMutation = trpc.resourceVerification.bulkVerify.useMutation({
    onSuccess: (data) => {
      utils.resourceVerification.list.invalidate();
      utils.resourceVerification.audit.invalidate();
      setSelected(new Set());
      toast.success(`Bulk verification complete — ${data.count} resources verified.`);
    },
  });

  const flagMutation = trpc.resourceVerification.flag.useMutation({
    onSuccess: () => {
      utils.resourceVerification.list.invalidate();
      utils.resourceVerification.audit.invalidate();
      setFlagDialog({ open: false, resourceId: null });
      setFlagReason("");
      toast.success("Resource flagged for review.");
    },
  });

  const deactivateMutation = trpc.resourceVerification.deactivate.useMutation({
    onSuccess: () => {
      utils.resourceVerification.list.invalidate();
      utils.resourceVerification.audit.invalidate();
      toast.success("Resource deactivated — removed from matching.");
    },
  });

  const reactivateMutation = trpc.resourceVerification.reactivate.useMutation({
    onSuccess: () => {
      utils.resourceVerification.list.invalidate();
      utils.resourceVerification.audit.invalidate();
      toast.success("Resource reactivated — restored to matching.");
    },
  });

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data?.resources) return;
    if (selected.size === data.resources.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.resources.map((r: any) => r.id)));
    }
  };

  const handleBulkVerify = () => {
    if (selected.size === 0) return;
    bulkVerifyMutation.mutate({ resourceIds: Array.from(selected) });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
          </Badge>
        );
      case "flagged":
        return (
          <Badge variant="destructive" className="gap-1">
            <Flag className="h-3 w-3" /> Flagged
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1">
            <Clock className="h-3 w-3" /> Unverified
          </Badge>
        );
    }
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return "Never";
    return new Date(Number(ts)).toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search resources..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setTimeout(() => setDebouncedSearch(e.target.value), 300);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>

            <Select
              value={verificationStatus}
              onValueChange={(v) => {
                setVerificationStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={domain}
              onValueChange={(v) => {
                setDomain(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {(filterOptions?.domains || []).map((d: string) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={resourceType}
              onValueChange={(v) => {
                setResourceType(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {filterOptions?.resourceTypes.map((t: string) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Checkbox
                id="staleOnly"
                checked={staleOnly}
                onCheckedChange={(v) => {
                  setStaleOnly(!!v);
                  setPage(1);
                }}
              />
              <label htmlFor="staleOnly" className="text-sm text-muted-foreground cursor-pointer">
                Stale only (90d+)
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            size="sm"
            onClick={handleBulkVerify}
            disabled={bulkVerifyMutation.isPending}
            className="gap-1"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {bulkVerifyMutation.isPending ? "Verifying..." : "Verify Selected"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Resource Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading resources...</div>
          ) : !data?.resources.length ? (
            <div className="p-8 text-center text-muted-foreground">
              No resources match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="p-3 text-left w-8">
                      <Checkbox
                        checked={
                          data.resources.length > 0 && selected.size === data.resources.length
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-3 text-left">Resource</th>
                    <th className="p-3 text-left">Domain</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Last Verified</th>
                    <th className="p-3 text-left">Contact</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.resources.map((r: any) => (
                    <tr
                      key={r.id}
                      className={`border-b hover:bg-accent/30 transition-colors ${
                        !r.isActive ? "opacity-50" : ""
                      } ${r.verificationStatus === "flagged" ? "bg-red-500/5" : ""}`}
                    >
                      <td className="p-3">
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td className="p-3">
                        <p className="font-medium truncate max-w-[250px]">{r.name}</p>
                        {r.agency && (
                          <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                            {r.agency}
                          </p>
                        )}
                        {r.flaggedReason && (
                          <p className="text-xs text-red-400 mt-0.5 truncate max-w-[250px]">
                            Flag: {r.flaggedReason}
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="text-xs capitalize">{r.domain}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-xs capitalize">
                          {r.resourceType?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="p-3">{getStatusBadge(r.verificationStatus)}</td>
                      <td className="p-3">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(r.lastVerifiedAt)}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1.5">
                          {r.phone && (
                            <a
                              href={`tel:${r.phone}`}
                              className="text-muted-foreground hover:text-foreground"
                              title={r.phone}
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {r.email && (
                            <a
                              href={`mailto:${r.email}`}
                              className="text-muted-foreground hover:text-foreground"
                              title={r.email}
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {r.website && (
                            <a
                              href={r.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              title={r.website}
                            >
                              <Globe className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 justify-end">
                          {r.verificationStatus !== "verified" && r.isActive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                              onClick={() => verifyMutation.mutate({ resourceId: r.id })}
                              disabled={verifyMutation.isPending}
                              title="Mark as verified"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {r.verificationStatus !== "flagged" && r.isActive && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                              onClick={() =>
                                setFlagDialog({ open: true, resourceId: r.id })
                              }
                              title="Flag for review"
                            >
                              <Flag className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {r.isActive ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={() =>
                                deactivateMutation.mutate({ resourceId: r.id })
                              }
                              disabled={deactivateMutation.isPending}
                              title="Deactivate"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                              onClick={() =>
                                reactivateMutation.mutate({ resourceId: r.id })
                              }
                              disabled={reactivateMutation.isPending}
                              title="Reactivate"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(data.page - 1) * data.pageSize + 1}–
            {Math.min(data.page * data.pageSize, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm flex items-center px-2">
              Page {data.page} of {data.totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Flag Dialog */}
      <Dialog
        open={flagDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setFlagDialog({ open: false, resourceId: null });
            setFlagReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-amber-500" /> Flag Resource
            </DialogTitle>
            <DialogDescription>
              Flagged resources are excluded from matching results. Provide a reason for flagging.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Why is this resource being flagged? (e.g., phone number disconnected, program no longer active, incorrect information...)"
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setFlagDialog({ open: false, resourceId: null });
                setFlagReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!flagReason.trim() || flagMutation.isPending}
              onClick={() => {
                if (flagDialog.resourceId && flagReason.trim()) {
                  flagMutation.mutate({
                    resourceId: flagDialog.resourceId,
                    reason: flagReason.trim(),
                  });
                }
              }}
            >
              {flagMutation.isPending ? "Flagging..." : "Flag Resource"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ───

export default function ResourceVerification() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Resource Verification
        </h1>
        <p className="text-muted-foreground mt-1">
          Maintain data quality across {" "}
          <span className="font-medium text-foreground">unified support resources</span>. Verify,
          flag, or deactivate resources to ensure people receive accurate, current recommendations.
        </p>
      </div>

      <Tabs defaultValue="audit" className="space-y-4">
        <TabsList>
          <TabsTrigger value="audit" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Audit Dashboard
          </TabsTrigger>
          <TabsTrigger value="resources" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> All Resources
          </TabsTrigger>
        </TabsList>

        <TabsContent value="audit">
          <AuditDashboard />
        </TabsContent>

        <TabsContent value="resources">
          <ResourceList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
