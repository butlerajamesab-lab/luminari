import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Scale, LogOut, FileText, Shield } from 'lucide-react';
import { STATUS_CONFIG, SAFETY_CONFIG, CASE_TYPE_LABELS } from '@/lib/constants';
import type { Case } from '@/lib/types';
import AppShell from '@/components/AppShell';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    async function fetchCases() {
      const { data, error } = await supabase
        .from('cases')
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data) {
        setCases(data as Case[]);
      }
      setLoading(false);
    }
    fetchCases();
  }, []);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-serif text-foreground">Your Cases</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage and track your legal matters
            </p>
          </div>
          <Button onClick={() => setLocation('/cases/new')} className="gap-2">
            <Plus className="w-4 h-4" />
            New Case
          </Button>
        </div>

        {/* Cases List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-card animate-pulse" />
            ))}
          </div>
        ) : cases.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No cases yet</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
                Create your first case to begin organizing evidence and building your court-ready packet.
              </p>
              <Button onClick={() => setLocation('/cases/new')} className="gap-2">
                <Plus className="w-4 h-4" />
                Create First Case
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {cases.map((c) => (
              <Card
                key={c.id}
                className="hover:border-primary/30 transition-colors cursor-pointer group"
                onClick={() => setLocation(`/cases/${c.id}`)}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {c.title}
                        </h3>
                        <Badge variant="outline" className={`shrink-0 text-xs ${STATUS_CONFIG[c.status].className}`}>
                          {STATUS_CONFIG[c.status].label}
                        </Badge>
                        {SAFETY_CONFIG[c.safety_level].show && (
                          <Badge variant="outline" className={`shrink-0 text-xs ${SAFETY_CONFIG[c.safety_level].className}`}>
                            <Shield className="w-3 h-3 mr-1" />
                            {SAFETY_CONFIG[c.safety_level].label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{CASE_TYPE_LABELS[c.case_type] || c.case_type}</span>
                        <span className="text-border">|</span>
                        <span>{c.jurisdiction}</span>
                        {c.opposing_party && (
                          <>
                            <span className="text-border">|</span>
                            <span>v. {c.opposing_party}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">
                        {new Date(c.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
