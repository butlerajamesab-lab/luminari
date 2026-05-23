import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, Loader2, AlertCircle } from 'lucide-react';

interface FullViewTabProps {
  caseId: string;
}

export default function FullViewTab({ caseId }: FullViewTabProps) {
  const [data, setData] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const loadFullView = async () => {
    setLoading(true);
    setError('');

    const { data: result, error: rpcError } = await supabase.rpc('get_esquire_view', {
      p_case_id: caseId,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setData(result);
      setLoaded(true);
    }
    setLoading(false);
  };

  if (!loaded) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Eye className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            Load the complete aggregated case view from the Esquire system.
          </p>
          <Button onClick={loadFullView} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            {loading ? 'Loading...' : 'Load Full View'}
          </Button>
          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Esquire Full View
        </h3>
        <Button variant="ghost" size="sm" onClick={loadFullView} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <pre className="text-xs text-foreground font-mono whitespace-pre-wrap overflow-x-auto max-h-[600px] overflow-y-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
