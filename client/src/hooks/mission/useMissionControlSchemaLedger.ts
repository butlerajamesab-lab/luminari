import { useEffect, useState } from "react";
import { MissionControlPayload, normalizeMissionControlPayload } from "./missionControlPayload";

const SCHEMA_LEDGER_ENDPOINT = "/api/system/schema";

async function fetchMissionControlPayload(): Promise<MissionControlPayload> {
  const response = await fetch(SCHEMA_LEDGER_ENDPOINT, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`schema_ledger_fetch_failed_${response.status}`);
  }
  return normalizeMissionControlPayload(await response.json());
}

export function useMissionControlSchemaLedger() {
  const [payload, setPayload] = useState<MissionControlPayload>(normalizeMissionControlPayload({}));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const normalized = await fetchMissionControlPayload();
      setPayload(normalized);
      setError(null);
    } catch (err) {
      setPayload(normalizeMissionControlPayload({}));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return { payload, isLoading, error, refetch: load };
}
