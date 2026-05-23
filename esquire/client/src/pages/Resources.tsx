import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, ExternalLink, Globe } from 'lucide-react';
import type { ProSeResource } from '@/lib/types';
import AppShell from '@/components/AppShell';

export default function Resources() {
  const [resources, setResources] = useState<ProSeResource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchResources() {
      const { data } = await supabase
        .from('pro_se_resources')
        .select('*')
        .eq('is_active', true)
        .order('resource_name');

      if (data) setResources(data as ProSeResource[]);
      setLoading(false);
    }
    fetchResources();
  }, []);

  // Group by type
  const grouped = resources.reduce<Record<string, ProSeResource[]>>((acc, r) => {
    const key = r.resource_type || 'general';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-serif text-foreground mb-2">Pro Se Resources</h1>
          <p className="text-sm text-muted-foreground">
            Educational materials and tools for self-represented litigants. These resources are publicly available.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-card animate-pulse rounded-lg" />
            ))}
          </div>
        ) : resources.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BookOpen className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No resources available at this time.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([type, items]) => (
              <section key={type}>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 capitalize">
                  {type.replace(/_/g, ' ')}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {items.map((resource) => (
                    <Card key={resource.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm font-medium text-foreground">{resource.resource_name}</h3>
                          {resource.jurisdiction && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {resource.jurisdiction}
                            </Badge>
                          )}
                        </div>
                        {resource.description && (
                          <p className="text-xs text-muted-foreground mb-3">{resource.description}</p>
                        )}
                        {resource.url && (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Visit Resource
                          </a>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
