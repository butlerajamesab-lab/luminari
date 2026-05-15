import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Users,
  Shield,
  ShieldCheck,
  Search,
  Crown,
  Clock,
  Mail,
  UserCog,
  ArrowUpDown,
  Link2,
  Copy,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
  advocacy: { label: "Advocacy", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  family_advocacy: { label: "Family Advocacy", color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  analyst: { label: "Analyst", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  professional: { label: "Professional", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  enterprise: { label: "Enterprise", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();
  const { data: users, isLoading } = trpc.usersAdmin.list.useQuery();
  const { data: invites, isLoading: invitesLoading } = trpc.invites.list.useQuery();
  const [search, setSearch] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    userId: number;
    userName: string;
    action: "promote" | "demote";
  } | null>(null);
  const [planDialog, setPlanDialog] = useState<{
    userId: number;
    userName: string;
    currentPlan: string;
  } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("");

  // Invite form state
  const [inviteRole, setInviteRole] = useState<"user" | "admin">("user");
  const [invitePlan, setInvitePlan] = useState("advocacy");
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [inviteExpDays, setInviteExpDays] = useState(7);

  const updateRoleMutation = trpc.usersAdmin.updateRole.useMutation({
    onSuccess: () => {
      utils.usersAdmin.list.invalidate();
      setConfirmDialog(null);
      toast.success("User role updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePlanMutation = trpc.usersAdmin.updatePlan.useMutation({
    onSuccess: () => {
      utils.usersAdmin.list.invalidate();
      setPlanDialog(null);
      toast.success("User plan updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const createInviteMutation = trpc.invites.create.useMutation({
    onSuccess: (data) => {
      utils.invites.list.invalidate();
      const url = `${window.location.origin}/invite/${data.token}`;
      navigator.clipboard.writeText(url);
      toast.success("Invite link created and copied to clipboard!");
      setInviteLabel("");
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeInviteMutation = trpc.invites.revoke.useMutation({
    onSuccess: () => {
      utils.invites.list.invalidate();
      toast.success("Invite revoked");
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredUsers = users?.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const adminCount = users?.filter((u) => u.role === "admin").length ?? 0;
  const totalCount = users?.length ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <UserCog className="h-6 w-6 text-primary" />
          User Management
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage user roles, access levels, and invite links.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              <p className="text-xs text-muted-foreground">Total Users</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <ShieldCheck className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{adminCount}</p>
              <p className="text-xs text-muted-foreground">Administrators</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Link2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {invites?.filter((i) => i.inviteStatus === "active" && i.expiresAt > Date.now() && i.useCount < i.maxUses).length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Active Invites</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="invites" className="gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Invite Links
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or role..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">All Users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-muted-foreground font-medium">User</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Role</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Plan</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> Last Active
                        </span>
                      </th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Joined</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers?.map((u) => {
                      const isCurrentUser = u.id === currentUser?.id;
                      const planInfo = PLAN_LABELS[u.plan] || PLAN_LABELS.free;
                      return (
                        <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                                {(u.name || "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-foreground flex items-center gap-1.5">
                                  {u.name || "Unnamed"}
                                  {isCurrentUser && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">You</Badge>
                                  )}
                                </p>
                                {u.email && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Mail className="h-3 w-3" />{u.email}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            {u.role === "admin" ? (
                              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1">
                                <Crown className="h-3 w-3" /> Admin
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <Shield className="h-3 w-3" /> User
                              </Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge className={`${planInfo.color} cursor-pointer`} onClick={() => {
                              if (!isCurrentUser) {
                                setSelectedPlan(u.plan);
                                setPlanDialog({ userId: u.id, userName: u.name || "Unnamed", currentPlan: u.plan });
                              }
                            }}>
                              {planInfo.label}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {new Date(u.lastSignedIn).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="p-3 text-right">
                            {isCurrentUser ? (
                              <span className="text-xs text-muted-foreground italic">—</span>
                            ) : u.role === "admin" ? (
                              <Button variant="outline" size="sm" className="gap-1 text-xs"
                                onClick={() => setConfirmDialog({ userId: u.id, userName: u.name || "Unnamed", action: "demote" })}>
                                <ArrowUpDown className="h-3 w-3" /> Demote
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" className="gap-1 text-xs"
                                onClick={() => setConfirmDialog({ userId: u.id, userName: u.name || "Unnamed", action: "promote" })}>
                                <ArrowUpDown className="h-3 w-3" /> Promote
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredUsers?.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No users match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invites Tab */}
        <TabsContent value="invites" className="space-y-4">
          {/* Create Invite Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" /> Generate Invite Link
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Label (optional)</Label>
                  <Input
                    placeholder="e.g., For legal aid team"
                    value={inviteLabel}
                    onChange={(e) => setInviteLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "user" | "admin")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigned Plan</Label>
                  <Select value={invitePlan} onValueChange={setInvitePlan}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="advocacy">Advocacy</SelectItem>
                      <SelectItem value="family_advocacy">Family Advocacy</SelectItem>
                      <SelectItem value="analyst">Analyst</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Uses</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={inviteMaxUses}
                    onChange={(e) => setInviteMaxUses(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Expires In (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={inviteExpDays}
                    onChange={(e) => setInviteExpDays(Number(e.target.value))}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => createInviteMutation.mutate({
                      targetRole: inviteRole,
                      targetPlan: invitePlan as any,
                      label: inviteLabel || undefined,
                      maxUses: inviteMaxUses,
                      expiresInDays: inviteExpDays,
                    })}
                    disabled={createInviteMutation.isPending}
                    className="w-full"
                  >
                    {createInviteMutation.isPending ? "Creating..." : "Generate Link"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active Invites List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Invite Links</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-muted-foreground font-medium">Label</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Role / Plan</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Usage</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Status</th>
                      <th className="text-left p-3 text-muted-foreground font-medium">Expires</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitesLoading ? (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading...</td></tr>
                    ) : invites?.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No invite links yet.</td></tr>
                    ) : invites?.map((inv) => {
                      const isExpired = inv.expiresAt < Date.now();
                      const isRevoked = inv.inviteStatus === "revoked";
                      const isMaxed = inv.inviteStatus === "exhausted" || inv.useCount >= inv.maxUses;
                      const isActive = inv.inviteStatus === "active" && !isExpired && !isMaxed;
                      const planInfo = PLAN_LABELS[inv.targetPlan] || PLAN_LABELS.free;

                      return (
                        <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <span className="text-foreground font-medium">
                              {inv.label || <span className="text-muted-foreground italic">No label</span>}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <Badge variant={inv.targetRole === "admin" ? "default" : "outline"} className="text-xs">
                                {inv.targetRole}
                              </Badge>
                              <Badge className={`${planInfo.color} text-xs`}>
                                {planInfo.label}
                              </Badge>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {inv.useCount} / {inv.maxUses}
                          </td>
                          <td className="p-3">
                            {isActive ? (
                              <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </Badge>
                            ) : isRevoked ? (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" /> Revoked
                              </Badge>
                            ) : isExpired ? (
                              <Badge variant="secondary" className="gap-1">
                                <Clock className="h-3 w-3" /> Expired
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <XCircle className="h-3 w-3" /> Used Up
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {new Date(inv.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isActive && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                                    onClick={() => {
                                      navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`);
                                      toast.success("Link copied!");
                                    }}>
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => revokeInviteMutation.mutate({ id: inv.id })}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Role Confirmation Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.action === "promote" ? "Promote to Admin" : "Demote to User"}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.action === "promote"
                ? `This will give ${confirmDialog?.userName} full admin access, including user management, feedback review, and analytics.`
                : `This will remove admin privileges from ${confirmDialog?.userName}. They will retain access to their own cases and data.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button
              variant={confirmDialog?.action === "demote" ? "destructive" : "default"}
              disabled={updateRoleMutation.isPending}
              onClick={() => {
                if (!confirmDialog) return;
                updateRoleMutation.mutate({
                  userId: confirmDialog.userId,
                  role: confirmDialog.action === "promote" ? "admin" : "user",
                });
              }}
            >
              {updateRoleMutation.isPending ? "Updating..." : confirmDialog?.action === "promote" ? "Promote to Admin" : "Demote to User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan Change Dialog */}
      <Dialog open={!!planDialog} onOpenChange={() => setPlanDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Plan for {planDialog?.userName}</DialogTitle>
            <DialogDescription>
              Select a new plan tier for this user. This controls feature access levels.
            </DialogDescription>
          </DialogHeader>
          <Select value={selectedPlan} onValueChange={setSelectedPlan}>
            <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="advocacy">Advocacy</SelectItem>
              <SelectItem value="family_advocacy">Family Advocacy</SelectItem>
              <SelectItem value="analyst">Analyst</SelectItem>
              <SelectItem value="professional">Professional</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanDialog(null)}>Cancel</Button>
            <Button
              disabled={updatePlanMutation.isPending || selectedPlan === planDialog?.currentPlan}
              onClick={() => {
                if (!planDialog || !selectedPlan) return;
                updatePlanMutation.mutate({ userId: planDialog.userId, plan: selectedPlan as any });
              }}
            >
              {updatePlanMutation.isPending ? "Updating..." : "Update Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
