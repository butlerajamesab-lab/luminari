import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Scale, Search, ChevronDown, ChevronUp, Shield, AlertTriangle, BookOpen } from "lucide-react";

function ProofCard({ proof }: { proof: any }) {
  const [expanded, setExpanded] = useState(false);
  const elements = proof.elementsOfProof ?? [];
  const burdenOfProof = proof.burdenOfProof ?? "";
  const typicalEvidence = proof.typicalEvidence ?? [];
  const commonDefenses = proof.commonDefenses ?? [];
  const causationStandard = proof.requiredCausation ?? "";

  return (
    <Card className="border-white/10">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Scale className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-base text-white">{proof.claimType}</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-xs">{proof.domain}</Badge>
                <Badge variant="outline" className="text-xs text-blue-400 border-blue-400/30">{burdenOfProof}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">{elements.length} elements</Badge>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Elements */}
          {elements.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Elements to Prove</h4>
              <ol className="space-y-1.5 list-none">
                {elements.map((el: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500/10 text-violet-400 text-xs flex items-center justify-center font-medium mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-white/80">{el}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Burden of Proof */}
          {burdenOfProof && (
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <h4 className="text-xs font-medium text-blue-400 mb-1 flex items-center gap-1">
                <Shield className="h-3 w-3" /> Burden of Proof
              </h4>
              <p className="text-sm text-white/80">{burdenOfProof}</p>
            </div>
          )}

          {/* Causation Standard */}
          {causationStandard && (
            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <h4 className="text-xs font-medium text-amber-400 mb-1">Causation Standard</h4>
              <p className="text-sm text-white/80">{causationStandard}</p>
            </div>
          )}

          {/* Typical Evidence */}
          {typicalEvidence.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <BookOpen className="h-3 w-3" /> Typical Evidence
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {typicalEvidence.map((ev: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">{ev}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Common Defenses */}
          {commonDefenses.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Common Defenses
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {commonDefenses.map((def: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs text-red-400 border-red-400/30">{def}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function ProofFrameworks() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = trpc.architectureMap.listProofFrameworks.useQuery(
    search ? { search } : undefined
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-white/5 rounded animate-pulse" />
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white/5 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Scale className="h-6 w-6 text-violet-400" />
          <h1 className="text-2xl font-bold text-white">Proof Framework Library</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          How each claim type is proven. Elements, burden-shifting steps, causation standards, typical evidence, and common defenses.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by claim type..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-3">
        {data && data.length > 0 ? (
          data.map((proof: any) => <ProofCard key={proof.id} proof={proof} />)
        ) : (
          <Card className="border-white/10">
            <CardContent className="p-8 text-center">
              <Scale className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No proof frameworks found.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
