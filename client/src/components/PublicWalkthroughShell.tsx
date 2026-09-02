import { ArrowLeft, Eye, Shield } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PublicWalkthroughShellProps = {
  title: string;
  description: string;
  sections: readonly string[];
  backHref?: string;
};

export function PublicWalkthroughShell({
  title,
  description,
  sections,
  backHref = "/dashboard",
}: PublicWalkthroughShellProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <Button variant="outline" size="sm" asChild>
          <Link href={backHref}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Platform Dashboard
          </Link>
        </Button>

        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                <Eye className="mr-1 h-3 w-3" /> Public walkthrough
              </Badge>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                <Shield className="mr-1 h-3 w-3" /> Private records protected
              </Badge>
            </div>
            <CardTitle className="text-2xl">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          </CardContent>
        </Card>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <Card key={section} className="bg-card/60">
              <CardContent className="flex min-h-24 items-center p-4">
                <div>
                  <p className="text-sm font-medium">{section}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Workspace available for walkthrough; live operator data and actions are withheld.
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
