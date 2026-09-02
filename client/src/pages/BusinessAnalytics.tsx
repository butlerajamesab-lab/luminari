import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/core/hooks/useAuth';

export default function BusinessAnalytics() {
  const [selectedEntity, setSelectedEntity] = useState<'product' | 'expense_category'>('product');
  const { user } = useAuth();
  const canAdminister = user?.role === 'admin';

  // Fetch baselines
  const { data: queriedBaselines, isLoading: baselinesLoading } = trpc.business.getBaselines.useQuery(undefined, {
    enabled: canAdminister,
    retry: false,
  });
  
  // Fetch analytics summary
  const { data: queriedSummary, isLoading: summaryLoading } = trpc.business.getAnalyticsSummary.useQuery(undefined, {
    enabled: canAdminister,
    retry: false,
  });
  const baselines = canAdminister ? queriedBaselines : undefined;
  const summary = canAdminister ? queriedSummary : undefined;

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Business Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Monitor product and expense baselines for anomaly detection
        </p>
        {!canAdminister && (
          <p className="text-xs text-amber-500 mt-1">
            Public read-only view. Private baseline records and changes remain protected.
          </p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Baselines</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="text-2xl font-bold">{summary?.totalBaselines || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Products</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="text-2xl font-bold">{summary?.productCount || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <div className="text-2xl font-bold">{summary?.expenseCategoryCount || 0}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Entity Type Selector */}
      <div className="flex gap-2">
        <Button
          variant={selectedEntity === 'product' ? 'default' : 'outline'}
          onClick={() => setSelectedEntity('product')}
        >
          Products
        </Button>
        <Button
          variant={selectedEntity === 'expense_category' ? 'default' : 'outline'}
          onClick={() => setSelectedEntity('expense_category')}
        >
          Expense Categories
        </Button>
      </div>

      {/* Baselines Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedEntity === 'product' ? 'Product' : 'Expense Category'} Baselines
          </CardTitle>
        </CardHeader>
        <CardContent>
          {baselinesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Entity ID</th>
                    <th className="text-right py-3 px-4 font-medium">Avg Amount</th>
                    <th className="text-right py-3 px-4 font-medium">Std Dev</th>
                    <th className="text-right py-3 px-4 font-medium">Sample Count</th>
                    <th className="text-left py-3 px-4 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {baselines
                    ?.filter(b => b.entityType === selectedEntity)
                    .map((baseline) => (
                      <tr key={`${baseline.entityType}-${baseline.entityId}`} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4">{baseline.entityId}</td>
                        <td className="text-right py-3 px-4 font-mono">
                          ${parseFloat(baseline.avgAmount).toFixed(2)}
                        </td>
                        <td className="text-right py-3 px-4 font-mono">
                          {baseline.stddevAmount ? `$${parseFloat(baseline.stddevAmount).toFixed(2)}` : '—'}
                        </td>
                        <td className="text-right py-3 px-4">{baseline.sampleCount}</td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {baseline.lastUpdated
                            ? new Date(baseline.lastUpdated).toLocaleDateString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!baselinesLoading && baselines?.filter(b => b.entityType === selectedEntity).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No baselines found for {selectedEntity === 'product' ? 'products' : 'expense categories'}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">About Business Analytics</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Business baselines are statistical averages used to detect anomalies in your business data.
          </p>
          <p>
            The system tracks average amounts and standard deviations for products and expense categories,
            enabling detection of unusual transactions or spending patterns.
          </p>
          <p>
            Baselines are automatically updated as new data is ingested and analyzed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
