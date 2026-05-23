import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Phone, Globe, Clock, AlertTriangle } from 'lucide-react';
import type { SafetyResource } from '@/lib/types';
import { JURISDICTIONS } from '@/lib/constants';
import AppShell from '@/components/AppShell';

export default function SafetyResourcesPage() {
  const [resources, setResources] = useState<SafetyResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [jurisdiction, setJurisdiction] = useState('');

  useEffect(() => {
    async function fetchResources() {
      let query = supabase.from('safety_resources').select('*').order('is_24_7', { ascending: false });
      if (jurisdiction) {
        query = query.eq('jurisdiction', jurisdiction);
      }
      const { data } = await query;
      if (data) setResources(data as SafetyResource[]);
      setLoading(false);
    }
    setLoading(true);
    fetchResources();
  }, [jurisdiction]);

  const emergencyResources = resources.filter((r) => r.is_24_7);
  const otherResources = resources.filter((r) => !r.is_24_7);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Emergency Banner */}
        <div className="mb-6 p-4 rounded-lg bg-red-600/10 border border-red-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-300">If you are in immediate danger, call 911</p>
              <p className="text-xs text-red-300/70 mt-1">
                National Domestic Violence Hotline: 1-800-799-7233 (24/7)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-serif text-foreground mb-2">Safety Resources</h1>
            <p className="text-sm text-muted-foreground">
              Support services and emergency contacts by jurisdiction.
            </p>
          </div>
          <div className="w-full sm:w-48">
            <Select value={jurisdiction} onValueChange={setJurisdiction}>
              <SelectTrigger>
                <SelectValue placeholder="All jurisdictions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jurisdictions</SelectItem>
                {JURISDICTIONS.map((j) => (
                  <SelectItem key={j} value={j}>{j}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-card animate-pulse rounded-lg" />
            ))}
          </div>
        ) : resources.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Shield className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {jurisdiction ? `No safety resources found for ${jurisdiction}.` : 'No safety resources available.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* 24/7 Services */}
            {emergencyResources.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  24/7 Emergency Services
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {emergencyResources.map((resource) => (
                    <Card key={resource.id} className="border-primary/30">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-sm font-medium text-foreground">{resource.resource_name}</h3>
                          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30 shrink-0">
                            24/7
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground capitalize mb-1">{resource.resource_type}</p>
                        <p className="text-xs text-muted-foreground mb-1">{resource.jurisdiction}</p>
                        {resource.description && (
                          <p className="text-xs text-muted-foreground mb-3">{resource.description}</p>
                        )}
                        <div className="space-y-1.5">
                          {resource.phone && (
                            <a
                              href={`tel:${resource.phone}`}
                              className="flex items-center gap-2 text-sm text-primary hover:underline font-medium"
                            >
                              <Phone className="w-4 h-4" />
                              {resource.phone}
                            </a>
                          )}
                          {resource.website && (
                            <a
                              href={resource.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-xs text-primary hover:underline"
                            >
                              <Globe className="w-3 h-3" />
                              Website
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* Other Resources */}
            {otherResources.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Additional Resources
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {otherResources.map((resource) => (
                    <Card key={resource.id}>
                      <CardContent className="p-4">
                        <h3 className="text-sm font-medium text-foreground mb-1">{resource.resource_name}</h3>
                        <p className="text-xs text-muted-foreground capitalize mb-1">{resource.resource_type}</p>
                        <p className="text-xs text-muted-foreground mb-1">{resource.jurisdiction}</p>
                        {resource.description && (
                          <p className="text-xs text-muted-foreground mb-3">{resource.description}</p>
                        )}
                        <div className="space-y-1">
                          {resource.phone && (
                            <a
                              href={`tel:${resource.phone}`}
                              className="flex items-center gap-2 text-xs text-primary hover:underline"
                            >
                              <Phone className="w-3 h-3" />
                              {resource.phone}
                            </a>
                          )}
                          {resource.website && (
                            <a
                              href={resource.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-xs text-primary hover:underline"
                            >
                              <Globe className="w-3 h-3" />
                              Website
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
