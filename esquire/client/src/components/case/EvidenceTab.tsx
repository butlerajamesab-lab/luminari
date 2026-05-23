import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Lock, CheckCircle, AlertCircle, Upload } from 'lucide-react';
import { useLocation } from 'wouter';
import type { Evidence, EvidenceConsentValidation } from '@/lib/types';

interface EvidenceTabProps {
  evidence: Evidence[];
  caseId: string;
}

export default function EvidenceTab({ evidence, caseId }: EvidenceTabProps) {
  const [, setLocation] = useLocation();
  const [validations, setValidations] = useState<Record<string, EvidenceConsentValidation[]>>({});

  useEffect(() => {
    async function fetchValidations() {
      if (evidence.length === 0) return;
      const { data } = await supabase
        .from('evidence_consent_validations')
        .select('*')
        .eq('case_id', caseId);
      if (data) {
        const grouped: Record<string, EvidenceConsentValidation[]> = {};
        (data as EvidenceConsentValidation[]).forEach((v) => {
          if (!grouped[v.evidence_id]) grouped[v.evidence_id] = [];
          grouped[v.evidence_id].push(v);
        });
        setValidations(grouped);
      }
    }
    fetchValidations();
  }, [evidence, caseId]);

  if (evidence.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <FileText className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No evidence uploaded yet.</p>
          <Button
            variant="outline"
            className="mt-4 gap-2"
            onClick={() => setLocation(`/cases/${caseId}/upload`)}
          >
            <Upload className="w-4 h-4" />
            Upload Evidence
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {evidence.map((item) => {
        const consentValidation = validations[item.id];
        const hasConsent = consentValidation?.some((v) => v.consent_obtained);
        return (
          <Card key={item.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-foreground text-sm truncate">{item.title}</h4>
                    <Badge variant="outline" className="text-xs capitalize shrink-0">
                      {item.evidence_type}
                    </Badge>
                  </div>

                  {item.summary && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
                  )}

                  {/* Hash display */}
                  {item.file_hash && (
                    <div className="mt-2 flex items-center gap-2">
                      <Lock className="w-3 h-3 text-primary shrink-0" />
                      <span className="hash-display text-muted-foreground">
                        SHA-256: {item.file_hash}
                      </span>
                    </div>
                  )}

                  {/* Consent chain */}
                  <div className="mt-2 flex items-center gap-2">
                    {hasConsent ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-xs text-emerald-400">Consent validated</span>
                      </>
                    ) : consentValidation ? (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-xs text-amber-400">Consent pending review</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">No consent record</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()}
                  </p>
                  {item.quality_weight && item.quality_weight !== 1 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Weight: {item.quality_weight}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
