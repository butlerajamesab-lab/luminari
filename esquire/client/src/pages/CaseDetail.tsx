import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Calendar, FileText, Shield, Workflow, Eye, Upload } from 'lucide-react';
import { STATUS_CONFIG, SAFETY_CONFIG, CASE_TYPE_LABELS } from '@/lib/constants';
import type { Case, CaseEvent, Evidence, PipelineRun, ProceduralOutput, AuthorityConflict, NarrativeBiasFlag, AlternativeInterpretation, SafetyAssessment, SafetyResource } from '@/lib/types';
import AppShell from '@/components/AppShell';
import TimelineTab from '@/components/case/TimelineTab';
import EvidenceTab from '@/components/case/EvidenceTab';
import PipelineTab from '@/components/case/PipelineTab';
import SafetyTab from '@/components/case/SafetyTab';
import FullViewTab from '@/components/case/FullViewTab';

export default function CaseDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [pipelineRuns, setPipelineRuns] = useState<PipelineRun[]>([]);
  const [proceduralOutputs, setProceduralOutputs] = useState<ProceduralOutput[]>([]);
  const [authorityConflicts, setAuthorityConflicts] = useState<AuthorityConflict[]>([]);
  const [biasFlags, setBiasFlags] = useState<NarrativeBiasFlag[]>([]);
  const [altInterpretations, setAltInterpretations] = useState<AlternativeInterpretation[]>([]);
  const [safetyAssessments, setSafetyAssessments] = useState<SafetyAssessment[]>([]);
  const [safetyResources, setSafetyResources] = useState<SafetyResource[]>([]);
  const [loading, setLoading] = useState(true);

  const caseId = params.id;

  useEffect(() => {
    if (!caseId) return;

    async function fetchAll() {
      const [
        { data: cData },
        { data: eData },
        { data: evData },
        { data: prData },
        { data: poData },
        { data: acData },
        { data: bfData },
        { data: aiData },
        { data: saData },
      ] = await Promise.all([
        supabase.from('cases').select('*').eq('id', caseId).single(),
        supabase.from('events').select('*').eq('case_id', caseId).order('event_date', { ascending: true }),
        supabase.from('evidence').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
        supabase.from('pipeline_runs').select('*').eq('case_id', caseId).order('started_at', { ascending: false }),
        supabase.from('procedural_outputs').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
        supabase.from('authority_conflicts').select('*').eq('case_id', caseId),
        supabase.from('narrative_bias_flags').select('*').eq('case_id', caseId),
        supabase.from('alternative_interpretations').select('*').eq('case_id', caseId),
        supabase.from('safety_assessments').select('*').eq('case_id', caseId).order('assessed_at', { ascending: false }),
      ]);

      if (cData) setCaseData(cData as Case);
      if (eData) setEvents(eData as CaseEvent[]);
      if (evData) setEvidence(evData as Evidence[]);
      if (prData) setPipelineRuns(prData as PipelineRun[]);
      if (poData) setProceduralOutputs(poData as ProceduralOutput[]);
      if (acData) setAuthorityConflicts(acData as AuthorityConflict[]);
      if (bfData) setBiasFlags(bfData as NarrativeBiasFlag[]);
      if (aiData) setAltInterpretations(aiData as AlternativeInterpretation[]);
      if (saData) setSafetyAssessments(saData as SafetyAssessment[]);

      // Fetch safety resources for the case's jurisdiction
      if (cData) {
        const { data: srData } = await supabase
          .from('safety_resources')
          .select('*')
          .eq('jurisdiction', (cData as Case).jurisdiction);
        if (srData) setSafetyResources(srData as SafetyResource[]);
      }

      setLoading(false);
    }

    fetchAll();
  }, [caseId]);

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-48 bg-card animate-pulse rounded mb-4" />
          <div className="h-64 bg-card animate-pulse rounded" />
        </div>
      </AppShell>
    );
  }

  if (!caseData) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto text-center py-16">
          <p className="text-muted-foreground">Case not found.</p>
          <Button variant="ghost" onClick={() => setLocation('/dashboard')} className="mt-4">
            Return to Dashboard
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        {/* Back */}
        <button
          onClick={() => setLocation('/dashboard')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          All Cases
        </button>

        {/* Case Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-serif text-foreground">{caseData.title}</h1>
              <Badge variant="outline" className={STATUS_CONFIG[caseData.status].className}>
                {STATUS_CONFIG[caseData.status].label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{CASE_TYPE_LABELS[caseData.case_type] || caseData.case_type}</span>
              <span className="text-border">•</span>
              <span>{caseData.jurisdiction}</span>
              {caseData.opposing_party && (
                <>
                  <span className="text-border">•</span>
                  <span>v. {caseData.opposing_party}</span>
                </>
              )}
              {SAFETY_CONFIG[caseData.safety_level].show && (
                <Badge variant="outline" className={`text-xs ${SAFETY_CONFIG[caseData.safety_level].className}`}>
                  <Shield className="w-3 h-3 mr-1" />
                  Safety: {SAFETY_CONFIG[caseData.safety_level].label}
                </Badge>
              )}
            </div>
          </div>
          <Button onClick={() => setLocation(`/cases/${caseId}/upload`)} className="gap-2 shrink-0">
            <Upload className="w-4 h-4" />
            Upload Evidence
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full justify-start overflow-x-auto bg-card border border-border/50 mb-6">
            <TabsTrigger value="overview" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="evidence" className="gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Evidence
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="gap-1.5">
              <Workflow className="w-3.5 h-3.5" />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="safety" className="gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Safety
            </TabsTrigger>
            <TabsTrigger value="fullview" className="gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Full View
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Case Information</h3>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className={STATUS_CONFIG[caseData.status].className}>
                      {STATUS_CONFIG[caseData.status].label}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="text-foreground">{CASE_TYPE_LABELS[caseData.case_type] || caseData.case_type}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Jurisdiction</span>
                    <span className="text-foreground">{caseData.jurisdiction}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Opposing Party</span>
                    <span className="text-foreground">{caseData.opposing_party || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Safety Level</span>
                    <span className="text-foreground capitalize">{caseData.safety_level}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Case ID</span>
                    <span className="font-mono text-xs text-muted-foreground">{caseData.case_id}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Summary</h3>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm">
                    <span className="text-muted-foreground block mb-1">Description</span>
                    <p className="text-foreground">{caseData.description || 'No description provided.'}</p>
                  </div>
                  <div className="pt-3 border-t border-border/50 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Events</span>
                      <span className="text-foreground font-medium">{events.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Evidence Items</span>
                      <span className="text-foreground font-medium">{evidence.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pipeline Runs</span>
                      <span className="text-foreground font-medium">{pipelineRuns.length}</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border/50">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Created {new Date(caseData.created_at).toLocaleDateString()}</span>
                      <span>Updated {new Date(caseData.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="timeline">
            <TimelineTab events={events} evidence={evidence} />
          </TabsContent>

          <TabsContent value="evidence">
            <EvidenceTab evidence={evidence} caseId={caseId!} />
          </TabsContent>

          <TabsContent value="pipeline">
            <PipelineTab
              pipelineRuns={pipelineRuns}
              proceduralOutputs={proceduralOutputs}
              authorityConflicts={authorityConflicts}
              biasFlags={biasFlags}
              altInterpretations={altInterpretations}
            />
          </TabsContent>

          <TabsContent value="safety">
            <SafetyTab
              safetyAssessments={safetyAssessments}
              safetyResources={safetyResources}
              safetyLevel={caseData.safety_level}
            />
          </TabsContent>

          <TabsContent value="fullview">
            <FullViewTab caseId={caseId!} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
