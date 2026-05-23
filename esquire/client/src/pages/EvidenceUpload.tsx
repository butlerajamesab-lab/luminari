import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { computeFileSHA256 } from '@/lib/hash';
import { logAuditAction } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Upload, Lock, AlertTriangle, CheckCircle, FileText, Loader2 } from 'lucide-react';
import { EVIDENCE_TYPES } from '@/lib/constants';
import type { Case, CaseEvent, JurisdictionRecordingLaw, EvidenceType } from '@/lib/types';
import AppShell from '@/components/AppShell';

export default function EvidenceUpload() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const caseId = params.id;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [events, setEvents] = useState<CaseEvent[]>([]);
  const [recordingLaws, setRecordingLaws] = useState<JurisdictionRecordingLaw[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState('');
  const [hashing, setHashing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('document');
  const [eventId, setEventId] = useState('');
  const [consentObtained, setConsentObtained] = useState(false);
  const [allPartiesConsented, setAllPartiesConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const requiresConsentValidation = ['audio', 'video'].includes(evidenceType);

  useEffect(() => {
    async function fetchData() {
      if (!caseId) return;

      const [{ data: c }, { data: e }, { data: laws }] = await Promise.all([
        supabase.from('cases').select('*').eq('id', caseId).single(),
        supabase.from('events').select('*').eq('case_id', caseId).order('event_date', { ascending: false }),
        supabase.from('jurisdiction_recording_laws').select('*'),
      ]);

      if (c) setCaseData(c as Case);
      if (e) setEvents(e as CaseEvent[]);
      if (laws) setRecordingLaws(laws as JurisdictionRecordingLaw[]);
      setLoading(false);
    }
    fetchData();
  }, [caseId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setFileHash('');
    setHashing(true);

    try {
      const hash = await computeFileSHA256(selectedFile);
      setFileHash(hash);
    } catch (err) {
      setError('Failed to compute file hash.');
    }
    setHashing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId || !file || !fileHash) return;

    // Consent validation for audio/video
    if (requiresConsentValidation && !consentObtained) {
      setError('Consent validation is required for audio/video evidence.');
      return;
    }

    setSubmitting(true);
    setError('');

    const evidenceId = crypto.randomUUID();

    // Insert evidence record
    const { error: insertError } = await supabase.from('evidence').insert({
      id: evidenceId,
      case_id: caseId,
      event_id: eventId || null,
      evidence_type: evidenceType,
      title: title.trim(),
      description: description.trim() || null,
      file_hash: fileHash,
      raw_file_hash: fileHash,
      source_type: 'upload',
      file_path: file.name,
      raw_file_path: file.name,
    });

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    // If consent validation needed, record it
    if (requiresConsentValidation) {
      const jurisdictionCode = caseData?.jurisdiction || '';

      // Call validate_recording_consent RPC
      await supabase.rpc('validate_recording_consent', {
        p_evidence_id: evidenceId,
        p_case_id: caseId,
        p_jurisdiction_code: jurisdictionCode,
        p_evidence_type: evidenceType,
      });

      // Also insert consent validation record
      await supabase.from('evidence_consent_validations').insert({
        evidence_id: evidenceId,
        case_id: caseId,
        jurisdiction_code: jurisdictionCode,
        evidence_type: evidenceType,
        consent_obtained: consentObtained,
        all_parties_consented: allPartiesConsented,
        validation_result: consentObtained ? 'valid' : 'pending',
        risk_level: allPartiesConsented ? 'low' : 'medium',
      });
    }

    // Audit log
    await logAuditAction({
      case_id: caseId,
      action: 'upload_evidence',
      entity_type: 'evidence',
      entity_id: evidenceId,
      new_value: { title, evidence_type: evidenceType, file_hash: fileHash },
    });

    setSuccess(true);
    setSubmitting(false);
  };

  // Get recording laws for case jurisdiction
  const jurisdictionLaws = recordingLaws.filter(
    (law) => caseData && law.jurisdiction_code.toLowerCase() === caseData.jurisdiction.toLowerCase()
  );

  if (loading) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto">
          <div className="h-8 w-48 bg-card animate-pulse rounded mb-4" />
          <div className="h-96 bg-card animate-pulse rounded" />
        </div>
      </AppShell>
    );
  }

  if (success) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle className="w-12 h-12 text-emerald-400 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Evidence Uploaded</h3>
              <p className="text-sm text-muted-foreground mb-2">File hash recorded for integrity verification.</p>
              <p className="hash-display text-muted-foreground mb-6">SHA-256: {fileHash}</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setLocation(`/cases/${caseId}`)}>
                  Back to Case
                </Button>
                <Button onClick={() => { setSuccess(false); setFile(null); setFileHash(''); setTitle(''); setDescription(''); }}>
                  Upload Another
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setLocation(`/cases/${caseId}`)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Case
        </button>

        <h1 className="text-2xl font-serif text-foreground mb-2">Upload Evidence</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Files are hashed client-side (SHA-256) before submission to ensure integrity.
        </p>

        {/* Recording Laws Notice */}
        {requiresConsentValidation && jurisdictionLaws.length > 0 && (
          <Card className="mb-6 border-amber-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-medium text-amber-300">Recording Laws — {caseData?.jurisdiction}</h3>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {jurisdictionLaws.map((law) => (
                <div key={law.id} className="text-sm">
                  <p className="text-foreground font-medium">{law.jurisdiction_name} — {law.consent_type} consent</p>
                  {law.statute_citation && (
                    <p className="text-xs text-muted-foreground mt-0.5">{law.statute_citation}</p>
                  )}
                  {law.summary && (
                    <p className="text-xs text-muted-foreground mt-1">{law.summary}</p>
                  )}
                  {law.penalty_criminal && (
                    <p className="text-xs text-red-400 mt-1">Criminal penalty: {law.penalty_criminal}</p>
                  )}
                  {law.penalty_civil && (
                    <p className="text-xs text-amber-400 mt-0.5">Civil penalty: {law.penalty_civil}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="p-6 space-y-5">
              {error && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* File Upload */}
              <div className="space-y-2">
                <Label htmlFor="file">Select File</Label>
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileChange}
                  className="file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary/10 file:text-primary"
                  required
                />
                {hashing && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Computing SHA-256 hash...
                  </div>
                )}
                {fileHash && (
                  <div className="flex items-center gap-2 mt-2 p-2 rounded bg-background/50 border border-border/50">
                    <Lock className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="hash-display text-muted-foreground">
                      SHA-256: {fileHash}
                    </span>
                  </div>
                )}
              </div>

              {/* Evidence Type */}
              <div className="space-y-2">
                <Label>Evidence Type</Label>
                <Select value={evidenceType} onValueChange={(v) => setEvidenceType(v as EvidenceType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Lease Agreement — Signed Copy"
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="desc">Description (optional)</Label>
                <Textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this evidence show?"
                  rows={3}
                />
              </div>

              {/* Link to Event */}
              <div className="space-y-2">
                <Label>Link to Event (optional)</Label>
                <Select value={eventId} onValueChange={setEventId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an event..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No event link</SelectItem>
                    {events.map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>
                        {ev.title} ({new Date(ev.event_date).toLocaleDateString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Consent Validation for Audio/Video */}
              {requiresConsentValidation && (
                <div className="space-y-3 p-4 rounded-lg border border-amber-500/20 bg-amber-600/5">
                  <h4 className="text-sm font-medium text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Consent Validation Required
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Audio and video evidence requires consent validation before it can be stored.
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="consent"
                        checked={consentObtained}
                        onCheckedChange={(v) => setConsentObtained(v === true)}
                      />
                      <Label htmlFor="consent" className="text-sm font-normal">
                        I confirm that consent was obtained for this recording
                      </Label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="allParties"
                        checked={allPartiesConsented}
                        onCheckedChange={(v) => setAllPartiesConsented(v === true)}
                      />
                      <Label htmlFor="allParties" className="text-sm font-normal">
                        All parties to the recording consented
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit */}
              <div className="pt-4 border-t border-border/50">
                <Button
                  type="submit"
                  disabled={!file || !fileHash || !title.trim() || submitting || (requiresConsentValidation && !consentObtained)}
                  className="w-full gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {submitting ? 'Uploading...' : 'Upload Evidence'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </AppShell>
  );
}
