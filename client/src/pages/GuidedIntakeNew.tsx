import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

// Category options for guided intake
const CATEGORIES = [
  { value: "housing", label: "🏠 Housing & Eviction" },
  { value: "employment", label: "💼 Employment & Wages" },
  { value: "benefits", label: "🍽️ Benefits & Food Assistance" },
  { value: "healthcare", label: "🏥 Healthcare & Insurance" },
  { value: "disability", label: "♿ Disability & Accommodations" },
  { value: "other", label: "⚠️ Other Crisis" },
];

interface IntakeFormData {
  category: string;
  jurisdiction: string;
}

interface WorkflowMatch {
  workflow_id: string;
  workflow_name: string;
  trigger_condition: string;
  steps: Array<{
    step_id: string;
    step_number: number;
    action: string;
    deadline?: string;
  }>;
  contacts: Array<{
    entity_id: string;
    entity_name: string;
    contact_type: string;
  }>;
  signals: Array<{
    signal_id: string;
    signal_type: string;
    priority: string;
    action_description: string;
  }>;
}

export default function GuidedIntakeNew() {
  const [location, setLocation] = useLocation();
  const [step, setStep] = useState<"intake" | "workflow" | "action">("intake");
  const [formData, setFormData] = useState<IntakeFormData>({
    category: "",
    jurisdiction: "",
  });
  const [workflowMatch, setWorkflowMatch] = useState<WorkflowMatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Query for jurisdictions
  const { data: jurisdictions = [] } = trpc.luminari.jurisdictions.useQuery() || {};

  // Query for workflow matching
  const matchWorkflow = async () => {
    if (!formData.category || !formData.jurisdiction) {
      setError("Please select both a situation and your location");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call tRPC to match workflow
      const result = await trpc.luminari.matchWorkflow.useQuery({
        category: formData.category,
        jurisdiction_id: formData.jurisdiction,
      });

      if (result?.data) {
        setWorkflowMatch(result.data);
        setStep("workflow");
      } else {
        setError("No workflow found for your situation. Please try another category.");
      }
    } catch (err: any) {
      setError(err?.message || "Error matching workflow. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCase = async () => {
    if (!formData.category || !formData.jurisdiction) return;

    try {
      // Create case in database
      const createCaseMutation = trpc.luminari.createCase.useMutation();
      const caseResult = await createCaseMutation.mutateAsync({
        category: formData.category,
        jurisdiction_id: formData.jurisdiction,
        workflow_id: workflowMatch?.workflow_id || "",
      });

      if (caseResult?.case_id) {
        // Navigate to action page
        setLocation(`/action/${caseResult.case_id}`);
      }
    } catch (err: any) {
      setError(err?.message || "Error creating case. Please try again.");
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Luminari: Your Action Path
          </h1>
          <p className="text-lg text-slate-600">
            Tell us what's happening. We'll show you exactly what to do next.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex justify-between mb-8">
          <div className={`flex items-center ${step === "intake" ? "text-blue-600" : "text-slate-400"}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
              step === "intake" ? "bg-blue-600 text-white" : "bg-slate-200"
            }`}>
              1
            </div>
            <span className="ml-2 font-semibold">Your Situation</span>
          </div>
          <div className={`flex items-center ${step === "workflow" ? "text-blue-600" : "text-slate-400"}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
              step === "workflow" ? "bg-blue-600 text-white" : "bg-slate-200"
            }`}>
              2
            </div>
            <span className="ml-2 font-semibold">Your Path</span>
          </div>
          <div className={`flex items-center ${step === "action" ? "text-blue-600" : "text-slate-400"}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
              step === "action" ? "bg-blue-600 text-white" : "bg-slate-200"
            }`}>
              3
            </div>
            <span className="ml-2 font-semibold">Take Action</span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-red-800">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* STEP 1: INTAKE */}
        {step === "intake" && (
          <Card>
            <CardHeader>
              <CardTitle>What's happening?</CardTitle>
              <CardDescription>
                Select the situation that best describes your crisis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Category Selection */}
              <div>
                <label className="block text-sm font-semibold mb-3 text-slate-900">
                  Situation
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setFormData({ ...formData, category: cat.value })}
                      className={`p-3 text-left rounded-lg border-2 transition-all ${
                        formData.category === cat.value
                          ? "border-blue-600 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <span className="font-medium text-slate-900">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Jurisdiction Selection */}
              <div>
                <label className="block text-sm font-semibold mb-3 text-slate-900">
                  Where are you located?
                </label>
                <Select value={formData.jurisdiction} onValueChange={(value) =>
                  setFormData({ ...formData, jurisdiction: value })
                }>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select your state or territory" />
                  </SelectTrigger>
                  <SelectContent>
                    {jurisdictions?.map((j) => (
                      <SelectItem key={j.id} value={j.id.toString()}>
                        {j.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Submit Button */}
              <Button
                onClick={matchWorkflow}
                disabled={!formData.category || !formData.jurisdiction || loading}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg font-semibold"
              >
                {loading ? "Finding your path..." : "Show Me My Path"}
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* STEP 2: WORKFLOW */}
        {step === "workflow" && workflowMatch && (
          <div className="space-y-6">
            {/* Workflow Card */}
            <Card>
              <CardHeader>
                <CardTitle>{workflowMatch.workflow_name}</CardTitle>
                <CardDescription>{workflowMatch.trigger_condition}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Steps */}
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-slate-900">Your Action Steps</h3>
                  <div className="space-y-3">
                    {workflowMatch.steps.map((step, idx) => (
                      <div key={step.step_id} className="flex gap-4 p-3 bg-slate-50 rounded-lg">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                            {step.step_number}
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">{step.action}</p>
                          {step.deadline && (
                            <p className="text-sm text-slate-600 mt-1">
                              ⏰ Deadline: {step.deadline}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contacts */}
                {workflowMatch.contacts.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-slate-900">Who to Contact</h3>
                    <div className="space-y-3">
                      {workflowMatch.contacts.map((contact) => (
                        <div key={contact.entity_id} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="font-medium text-slate-900">{contact.entity_name}</p>
                          <p className="text-sm text-slate-600">{contact.contact_type}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enforcement Signals */}
                {workflowMatch.signals.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-slate-900">⚠️ Critical Alerts</h3>
                    <div className="space-y-3">
                      {workflowMatch.signals.map((signal) => (
                        <div key={signal.signal_id} className={`p-3 rounded-lg border ${
                          signal.priority === "CRITICAL"
                            ? "bg-red-50 border-red-200"
                            : signal.priority === "HIGH"
                            ? "bg-orange-50 border-orange-200"
                            : "bg-yellow-50 border-yellow-200"
                        }`}>
                          <p className="font-medium text-slate-900">{signal.signal_type}</p>
                          <p className="text-sm text-slate-600 mt-1">{signal.action_description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <Button
                onClick={() => setStep("intake")}
                variant="outline"
                className="flex-1 py-6 text-lg"
              >
                Back
              </Button>
              <Button
                onClick={handleCreateCase}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-6 text-lg font-semibold"
              >
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Start Your Case
              </Button>
            </div>
          </div>
        )}

        {/* Success Message */}
        {step === "action" && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-green-900 mb-2">Case Created</h2>
              <p className="text-green-800">
                Your case has been created. You're now on your action path.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
