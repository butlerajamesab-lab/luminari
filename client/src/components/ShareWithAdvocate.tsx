import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Share2, Copy, Check, Clock, Eye, Trash2, Link2, Shield,
  ChevronDown, ChevronUp, Plus, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface ShareWithAdvocateProps {
  caseId: number;
}

export function ShareWithAdvocate({ caseId }: ShareWithAdvocateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [permissions, setPermissions] = useState<"read_only" | "read_export">("read_only");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { data: links, refetch } = trpc.share.list.useQuery(
    { caseId },
    { enabled: isOpen }
  );

  const createLink = trpc.share.create.useMutation({
    onSuccess: (data) => {
      const url = `${window.location.origin}/shared/${data.token}`;
      navigator.clipboard.writeText(url);
      toast.success("Share link created and copied to clipboard!", {
        description: "Send this link to your advocate. They can view your case without logging in.",
        duration: 6000,
      });
      setShowCreate(false);
      setLabel("");
      setExpiresInDays(7);
      refetch();
    },
    onError: () => {
      toast.error("Failed to create share link. Please try again.");
    },
  });

  const revokeLink = trpc.share.revoke.useMutation({
    onSuccess: () => {
      toast.success("Share link revoked.");
      refetch();
    },
  });

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/shared/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const activeLinks = links?.filter(l => !l.revokedAt && l.expiresAt > Date.now()) || [];
  const expiredOrRevoked = links?.filter(l => l.revokedAt || l.expiresAt <= Date.now()) || [];

  const formatExpiry = (expiresAt: number) => {
    const days = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return "Expired";
    if (days === 1) return "Expires tomorrow";
    return `Expires in ${days} days`;
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <button
        className="w-full text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">Share with My Advocate</CardTitle>
              {activeLinks.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {activeLinks.length} active
                </Badge>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
      </button>

      {isOpen && (
        <CardContent className="px-4 pb-4 pt-0 space-y-4">
          {/* Explanation */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
            <Shield className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Create a secure, time-limited link to share your case findings with an attorney,
              legal aid worker, or advocate. They can view your documents and analysis without
              needing an account. You can revoke access at any time.
            </p>
          </div>

          {/* Active links */}
          {activeLinks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Links</h4>
              {activeLinks.map(link => (
                <div key={link.id} className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-border/50 gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link2 className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-xs font-medium truncate">
                        {link.label || "Share link"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {formatExpiry(link.expiresAt as number)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-2.5 w-2.5" />
                        {link.accessCount} views
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => copyLink(link.token)}
                    >
                      {copiedToken === link.token ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => revokeLink.mutate({ id: link.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Expired/revoked links */}
          {expiredOrRevoked.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Expired / Revoked</h4>
              {expiredOrRevoked.map(link => (
                <div key={link.id} className="flex items-center p-2 rounded-lg bg-muted/30 opacity-60 gap-2">
                  <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {link.label || "Share link"}
                  </span>
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    {link.revokedAt ? "Revoked" : "Expired"}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          {/* Create new link */}
          {showCreate ? (
            <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <Input
                placeholder="Label (e.g., 'For my attorney')"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Expires in:</span>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs flex-1"
                >
                  <option value={1}>24 hours</option>
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Permissions:</span>
                <select
                  value={permissions}
                  onChange={(e) => setPermissions(e.target.value as "read_only" | "read_export")}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs flex-1"
                >
                  <option value="read_only">View only</option>
                  <option value="read_export">View & export</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs gap-1.5"
                  onClick={() => createLink.mutate({
                    caseId,
                    label: label || undefined,
                    expiresInDays,
                    permissions,
                  })}
                  disabled={createLink.isPending}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  {createLink.isPending ? "Creating..." : "Create & Copy Link"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Create New Share Link
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
