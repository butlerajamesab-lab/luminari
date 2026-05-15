import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface Activation {
  id: number;
  clusterId: string;
  procedureType: "alert" | "track" | "record";
  steps: string[];
  status: "pending" | "in_progress" | "completed";
  createdAt: number;
  updatedAt: number;
}

interface SystemStats {
  signals: { pending: number; approved: number; rejected: number; deferred: number; total: number };
  registry: number;
  patterns: number;
  strategies: number;
  procedures: number;
  activations: { pending: number; in_progress: number; completed: number; total: number };
  timestamp: string;
}

export function ActivationControl() {
  const [activations, setActivations] = useState<Activation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [stats, setStats] = useState<SystemStats | null>(null);

  // Fetch system stats
  const fetchStats = async () => {
    try {
      const response = await fetch("/api/trpc/system.stats");
      const data = await response.json();
      
      if (data.result?.data) {
        setStats(data.result.data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  // Fetch all activations
  const fetchActivations = async () => {
    try {
      const response = await fetch("/api/trpc/activation.getAll");
      const data = await response.json();
      
      if (data.result?.data) {
        setActivations(data.result.data);
        setLastUpdated(new Date());
        setIsLive(true);
      }
    } catch (error) {
      console.error("Failed to fetch activations:", error);
    } finally {
      setLoading(false);
    }
    
    // Also fetch stats
    await fetchStats();
  };

  // Start activation
  const handleStart = async (clusterId: string) => {
    try {
      setActionLoading(clusterId);
      const response = await fetch("/api/trpc/activation.start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      
      const data = await response.json();
      if (data.result?.data?.success) {
        await fetchActivations();
      }
    } catch (error) {
      console.error("Failed to start activation:", error);
    } finally {
      setActionLoading(null);
    }
  };

  // Complete activation
  const handleComplete = async (clusterId: string) => {
    try {
      setActionLoading(clusterId);
      const response = await fetch("/api/trpc/activation.complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      
      const data = await response.json();
      if (data.result?.data?.success) {
        await fetchActivations();
      }
    } catch (error) {
      console.error("Failed to complete activation:", error);
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchActivations();

    // Set up polling interval (10 seconds)
    const intervalId = setInterval(() => {
      fetchActivations();
    }, 10000);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, []);

  const formatTime = (date: Date | null) => {
    if (!date) return "Never";
    return date.toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getProcedureColor = (type: string) => {
    switch (type) {
      case "alert":
        return "bg-red-100 text-red-800";
      case "track":
        return "bg-purple-100 text-purple-800";
      case "record":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading && activations.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Activation Control</h1>
            <p className="text-gray-600">Manage and execute procedural activations</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${isLive ? "bg-green-500" : "bg-gray-400"}`} />
              <span className="text-sm font-medium">{isLive ? "Live" : "Updating..."}</span>
            </div>
            <p className="text-xs text-gray-500">Last updated: {formatTime(lastUpdated)}</p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="mb-8 grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Signals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.signals.total}</div>
              <p className="text-xs text-gray-500 mt-1">Approved: {stats.signals.approved}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Registry</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.registry}</div>
              <p className="text-xs text-gray-500 mt-1">Approved signals</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.patterns}</div>
              <p className="text-xs text-gray-500 mt-1">Clusters</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Strategies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.strategies}</div>
              <p className="text-xs text-gray-500 mt-1">Generated</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Procedures</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.procedures}</div>
              <p className="text-xs text-gray-500 mt-1">Actions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Activations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activations.total}</div>
              <p className="text-xs text-gray-500 mt-1">Pending: {stats.activations.pending}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {activations.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-gray-500">No activations available</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {activations.map((activation) => (
            <Card key={activation.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{activation.clusterId}</CardTitle>
                    <CardDescription>Cluster ID</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={getProcedureColor(activation.procedureType)}>
                      {activation.procedureType}
                    </Badge>
                    <Badge className={getStatusColor(activation.status)}>
                      {activation.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Steps:</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {activation.steps.map((step, idx) => (
                        <li key={idx} className="text-sm text-gray-700">
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex gap-2 pt-4">
                    {activation.status === "pending" && (
                      <Button
                        onClick={() => handleStart(activation.clusterId)}
                        disabled={actionLoading === activation.clusterId}
                        variant="default"
                      >
                        {actionLoading === activation.clusterId && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Start
                      </Button>
                    )}

                    {activation.status === "in_progress" && (
                      <Button
                        onClick={() => handleComplete(activation.clusterId)}
                        disabled={actionLoading === activation.clusterId}
                        variant="default"
                      >
                        {actionLoading === activation.clusterId && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Complete
                      </Button>
                    )}

                    {activation.status === "completed" && (
                      <Button disabled variant="outline">
                        Completed
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
