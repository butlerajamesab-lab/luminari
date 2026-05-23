import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
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

export default function InviteLanding() {
  const { token } = useParams<{ token: string }>();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [redeemed, setRedeemed] = useState(false);

  const { data: validation, isLoading } = trpc.invites.validate.useQuery(
    { token: token || "" },
    { enabled: !!token }
  );

  const redeemMutation = trpc.invites.redeem.useMutation({
    onSuccess: (result) => {
      setRedeemed(true);
      const r = result as any;
      const planKey = r.assignedPlan ?? 'advocacy';
      toast.success(`Welcome! You've been upgraded to ${PLAN_LABELS[planKey] || planKey} plan.`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Auto-redeem if user is authenticated and invite is valid
  useEffect(() => {
    if (isAuthenticated && validation?.valid && !redeemed && !redeemMutation.isPending) {
      redeemMutation.mutate({ token: token || "" });
    }
  }, [isAuthenticated, validation?.valid, token, redeemed]);

  const handleLogin = () => {
    // Store the invite path so we return here after login
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
          <CardDescription>
            You've been invited to join Luminari
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!validation?.valid ? (
            <div className="text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-muted-foreground">{validation?.reason || "This invite link is not valid."}</p>
              <Button variant="outline" onClick={() => setLocation("/welcome")}>
                Go to Luminari
              </Button>
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
                  {validation.invite.label && (
                    <p className="text-sm text-muted-foreground">{validation.invite.label}</p>
                  )}
                  {(() => {
                    const inv = validation.invite as any;
                    const role = inv.assignedRole;
                    const plan = inv.assignedPlan;
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Role:</span>
                          <Badge variant={role === "admin" ? "default" : "secondary"}>
                            {role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Plan:</span>
                          <Badge variant="outline">
                            {PLAN_LABELS[plan] || plan}
                          </Badge>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {isAuthenticated ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Applying invite...</p>
                </div>
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
