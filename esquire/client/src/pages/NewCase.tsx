import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { logAuditAction } from '@/lib/audit';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowLeft, ArrowRight, Check, AlertTriangle } from 'lucide-react';
import { JURISDICTIONS, CASE_TYPES, CASE_TYPE_LABELS } from '@/lib/constants';
import type { SafetyLevel } from '@/lib/types';
import AppShell from '@/components/AppShell';

const STEPS = ['Jurisdiction', 'Case Type', 'Details', 'Opposing Party', 'Safety Check', 'Review'];

export default function NewCase() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [jurisdiction, setJurisdiction] = useState('');
  const [caseType, setCaseType] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [opposingParty, setOpposingParty] = useState('');
  const [safetyLevel, setSafetyLevel] = useState<SafetyLevel>('none');

  const canProceed = () => {
    switch (step) {
      case 0: return jurisdiction !== '';
      case 1: return caseType !== '';
      case 2: return title.trim() !== '';
      case 3: return true; // opposing party is optional
      case 4: return true; // safety level has default
      case 5: return true;
      default: return false;
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    setError('');

    const caseId = crypto.randomUUID();

    const { data, error: insertError } = await supabase.from('cases').insert({
      id: caseId,
      case_id: caseId,
      user_id: user.id,
      jurisdiction,
      case_type: caseType,
      title: title.trim(),
      description: description.trim() || null,
      opposing_party: opposingParty.trim() || null,
      safety_level: safetyLevel,
      status: 'intake',
    }).select().single();

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    await logAuditAction({
      case_id: caseId,
      action: 'create',
      entity_type: 'case',
      entity_id: caseId,
      new_value: { title, jurisdiction, case_type: caseType },
    });

    setLocation(`/cases/${caseId}`);
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => setLocation('/dashboard')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Cases
        </button>

        <h1 className="text-2xl font-serif text-foreground mb-2">New Case</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>

        {/* Progress */}
        <div className="flex gap-1 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-primary' : 'bg-border'
              }`}
            />
          ))}
        </div>

        <Card>
          <CardContent className="p-6">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Step 0: Jurisdiction */}
            {step === 0 && (
              <div className="space-y-4">
                <Label>Select Jurisdiction</Label>
                <Select value={jurisdiction} onValueChange={setJurisdiction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose state..." />
                  </SelectTrigger>
                  <SelectContent>
                    {JURISDICTIONS.map((j) => (
                      <SelectItem key={j} value={j}>{j}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This determines applicable recording laws and available resources.
                </p>
              </div>
            )}

            {/* Step 1: Case Type */}
            {step === 1 && (
              <div className="space-y-4">
                <Label>Case Type</Label>
                <Select value={caseType} onValueChange={setCaseType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose case type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CASE_TYPES.map((ct) => (
                      <SelectItem key={ct} value={ct}>{CASE_TYPE_LABELS[ct]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Step 2: Title & Description */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Case Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Wrongful Eviction — 123 Main St"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief summary of your case..."
                    rows={4}
                    className="mt-1.5"
                  />
                </div>
              </div>
            )}

            {/* Step 3: Opposing Party */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="opposing">Opposing Party (optional)</Label>
                  <Input
                    id="opposing"
                    value={opposingParty}
                    onChange={(e) => setOpposingParty(e.target.value)}
                    placeholder="e.g., ABC Property Management LLC"
                    className="mt-1.5"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    The person or entity you are filing against.
                  </p>
                </div>
              </div>
            )}

            {/* Step 4: Safety Check */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-md bg-amber-600/10 border border-amber-500/20 mb-4">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-300">Safety Assessment</p>
                    <p className="text-xs text-amber-300/70 mt-1">
                      If you are in immediate danger, call 911. This assessment helps us provide appropriate safety resources.
                    </p>
                  </div>
                </div>
                <Label>Current Safety Level</Label>
                <RadioGroup value={safetyLevel} onValueChange={(v) => setSafetyLevel(v as SafetyLevel)}>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="none" id="safety-none" />
                      <Label htmlFor="safety-none" className="font-normal">No safety concerns</Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="low" id="safety-low" />
                      <Label htmlFor="safety-low" className="font-normal">Low — Minor concerns, no immediate threat</Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="medium" id="safety-medium" />
                      <Label htmlFor="safety-medium" className="font-normal">Medium — Ongoing concerns, potential escalation</Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="high" id="safety-high" />
                      <Label htmlFor="safety-high" className="font-normal">High — Active threat, need safety planning</Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="critical" id="safety-critical" />
                      <Label htmlFor="safety-critical" className="font-normal">Critical — Immediate danger present</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Step 5: Review */}
            {step === 5 && (
              <div className="space-y-4">
                <h3 className="font-medium text-foreground">Review Your Case</h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Jurisdiction</dt>
                    <dd className="text-foreground font-medium">{jurisdiction}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Case Type</dt>
                    <dd className="text-foreground font-medium">{CASE_TYPE_LABELS[caseType]}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Title</dt>
                    <dd className="text-foreground font-medium">{title}</dd>
                  </div>
                  {opposingParty && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Opposing Party</dt>
                      <dd className="text-foreground font-medium">{opposingParty}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Safety Level</dt>
                    <dd className="text-foreground font-medium capitalize">{safetyLevel}</dd>
                  </div>
                </dl>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-8 pt-4 border-t border-border/50">
              <Button
                variant="ghost"
                onClick={() => setStep(step - 1)}
                disabled={step === 0}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>

              {step < STEPS.length - 1 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={!canProceed()}
                  className="gap-2"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="gap-2"
                >
                  <Check className="w-4 h-4" />
                  {submitting ? 'Creating...' : 'Create Case'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
