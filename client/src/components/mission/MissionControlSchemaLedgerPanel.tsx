import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MissionControlPayload } from "@/hooks/mission/missionControlPayload";
import { useMissionControlSchemaLedger } from "@/hooks/mission/useMissionControlSchemaLedger";
import { CorpusFootprintPanel } from "./CorpusFootprintPanel";

export function MissionControlSchemaLedgerPanel({ payload: payloadOverride }: { payload?: MissionControlPayload }) {
  const { payload: hookPayload, isLoading, error } = useMissionControlSchemaLedger();
  const payload = payloadOverride ?? hookPayload;

  const tables = payload.tables.items;
  const views = payload.views.items;
  const foreignKeys = payload.foreign_keys.items;

  if (!payloadOverride && isLoading) {
    return (
      <div className="space-y-3">
        <CorpusFootprintPanel compact />
        <Card className="bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Schema Ledger</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Loading schema ledger…</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <CorpusFootprintPanel />
      <Card className="bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Schema Ledger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <div><span className="text-muted-foreground">Tables</span><div className="font-mono">{tables.length}</div></div>
            <div><span className="text-muted-foreground">Views</span><div className="font-mono">{views.length}</div></div>
            <div><span className="text-muted-foreground">Foreign Keys</span><div className="font-mono">{foreignKeys.length}</div></div>
          </div>

          {tables.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">Top tables</div>
              <div className="space-y-0.5">
                {tables.slice(0, 5).map((row) => (
                  <div key={row.table_name} className="flex justify-between">
                    <span>{row.table_name}</span>
                    <span className="font-mono">{row.column_count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && !payloadOverride && <div className="text-red-300">{error}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
