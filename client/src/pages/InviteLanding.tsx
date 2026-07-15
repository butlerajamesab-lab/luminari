import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Shield, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  advocacy: "Advocacy",
  family_advocacy: "Family Advocacy",
  analyst: "Analyst",
  professional: "Professional",
  enterprise: "Enterprise",
};

type RedeemResponse = {
  ok: boolean;
  target_role?: string;
  target_plan?: string;
  error?: string;
};

async function getInviteSessionToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - nowSeconds < 60) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed.session?.access_token) {
      return refreshed.session.access_token;
    }
  }

  return session.access_token;
}

export default function InviteLanding() {
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [redeemed, setRedeemed] = useState(false);
  const [redeemPending, setRedeemPending] = useState(false);
  const [redeemAttempted, setRedeemAttempted] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const { data: validation, isLoading } = trpc.invites.validate.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  const redeemInvite = async () => {
    if (!token || redeemPending) return;
    setRedeemPending(true);
    setRedeemError(null);
    setRedeemAttempted(true);
    try {
      const sessionToken = await getInviteSessionToken();
      if (!sessionToken) {
        throw new Error("Sign in before redeeming this invite.");
      }

      const response = await fetch("/api/invites/redeem", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-lighthouse-supabase-session": sessionToken,
        },
        body: JSON.stringify({ token }),
      });
      const result = (await response.json()) as RedeemResponse;
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Invite redemption failed.");
      }
      setRedeemed(true);
      const planKey = result.target_plan ?? "advocacy";
      toast.success(`Welcome! You've been upgraded to ${PLAN_LABELS[planKey] || planKey} plan.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invite redemption failed.";
      setRedeemError(message);
      toast.error(message);
    } finally {
      setRedeemPending(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && validation?.valid && !redeemed && !redeemAttempted) {
      void redeemInvite();
    }
  }, [isAuthenticated, validation?.valid, token, redeemed, redeemAttempted]);

  const handleLogin = () => {
    sessionStorage.setItem("luminari-invite-return", `/invite/${token}`);
    window.location.href = getLoginUrl();
  };

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Validating invite...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/50 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Luminari Invite</CardTitle>
          <CardDescription>You've been invited to join Luminari</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!validation?.valid ? (
            <div className="text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-muted-foreground">{validation?.reason || "This invite link is not valid."}</p>
              <Button variant="outline" onClick={() => setLocation("/welcome")}>Go to Luminari</Button>
            </div>
          ) : redeemed ? (
            <div className="text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="font-medium text-foreground">Invite Redeemed!</p>
                <p className="text-sm text-muted-foreground mt-1">Your account has been upgraded.</p>
              </div>
              <Button onClick={() => setLocation("/welcome")} className="w-full">
                <Sparkles className="mr-2 h-4 w-4" />
                Get Started
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {validation.invite && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  {validation.invite.label && <p className="text-sm text-muted-foreground">{validation.invite.label}</p>}
                  {(() => {
                    const inv = validation.invite as any;
                    const role = inv.target_role;
                    const plan = inv.target_plan;
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Role:</span>
                          <Badge variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Plan:</span>
                          <Badge variant="outline">{PLAN_LABELS[plan] || plan}</Badge>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {isAuthenticated ? (
                redeemError ? (
                  <div className="space-y-3 text-center">
                    <p className="text-sm text-destructive">{redeemError}</p>
                    <Button onClick={() => void redeemInvite()} disabled={redeemPending} className="w-full">
                      {redeemPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Retry Invite
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Applying invite...</p>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground text-center">
                    Sign in to redeem this invite and unlock your upgraded access.
                  </p>
                  <Button onClick={handleLogin} className="w-full" size="lg">
                    Sign In to Redeem
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
