import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Phone, Globe, Clock, AlertTriangle } from 'lucide-react';
import { SAFETY_CONFIG } from '@/lib/constants';
import type { SafetyAssessment, SafetyResource, SafetyLevel } from '@/lib/types';

interface SafetyTabProps {
  safetyAssessments: SafetyAssessment[];
  safetyResources: SafetyResource[];
  safetyLevel: SafetyLevel;
}

export default function SafetyTab({ safetyAssessments, safetyResources, safetyLevel }: SafetyTabProps) {
  return (
    <div className="space-y-6">
      {/* Current Safety Level */}
      {SAFETY_CONFIG[safetyLevel].show && (
        <div className={`p-4 rounded-lg border ${
          safetyLevel === 'critical' ? 'bg-red-600/10 border-red-500/30' :
          safetyLevel === 'high' ? 'bg-red-600/10 border-red-500/20' :
          safetyLevel === 'medium' ? 'bg-orange-600/10 border-orange-500/20' :
          'bg-amber-600/10 border-amber-500/20'
        }`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`w-5 h-5 ${
              safetyLevel === 'critical' || safetyLevel === 'high' ? 'text-red-400' :
              safetyLevel === 'medium' ? 'text-orange-400' : 'text-amber-400'
            } ${safetyLevel === 'critical' ? 'safety-critical' : ''}`} />
            <div>
              <p className="text-sm font-medium text-foreground">
                Safety Level: <span className="capitalize">{safetyLevel}</span>
              </p>
              {safetyLevel === 'critical' && (
                <p className="text-xs text-red-300 mt-0.5">
                  If you are in immediate danger, call 911 now.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Safety Assessments */}
      {safetyAssessments.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Safety Assessments
          </h3>
          <div className="space-y-3">
            {safetyAssessments.map((assessment) => (
              <Card key={assessment.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={SAFETY_CONFIG[assessment.assessed_level]?.className || ''}>
                          {assessment.assessed_level}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Assessed: {new Date(assessment.assessed_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Factors */}
                      {assessment.factors ? (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Factors:</p>
                          <pre className="text-xs text-foreground bg-background/50 p-2 rounded overflow-x-auto">
                            {JSON.stringify(assessment.factors, null, 2)}
                          </pre>
                        </div>
                      ) : null}

                      {/* Safety Plan */}
                      {assessment.safety_plan ? (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Safety Plan:</p>
                          <pre className="text-xs text-foreground bg-background/50 p-2 rounded overflow-x-auto">
                            {JSON.stringify(assessment.safety_plan, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                    </div>

                    {assessment.reassess_by && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">Reassess by</p>
                        <p className="text-xs text-foreground font-medium">
                          {new Date(assessment.reassess_by).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Safety Resources */}
      <section>
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Safety Resources
        </h3>
        {safetyResources.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No jurisdiction-specific safety resources found.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {safetyResources.map((resource) => (
              <Card key={resource.id} className={resource.is_24_7 ? 'border-primary/30' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-sm font-medium text-foreground">{resource.resource_name}</h4>
                    {resource.is_24_7 && (
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30 shrink-0">
                        <Clock className="w-3 h-3 mr-1" />
                        24/7
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize mb-2">{resource.resource_type}</p>
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
        )}
      </section>
    </div>
  );
}
