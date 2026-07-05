import { useEffect, useState } from "react";
import { MissionControlPayload, normalizeMissionControlPayload } from "./missionControlPayload";

const PRIMARY_ENDPOINT = "/api/roots/schema/ledger";
const FALLBACK_ENDPOINT = "/api/system/schema";

async function fetchMissionControlPayload(): Promise<MissionControlPayload> {
  const primaryResponse = await fetch(PRIMARY_ENDPOINT, { cache: "no-store" });
  if (primaryResponse.ok) {
    return normalizeMissionControlPayload(await primaryResponse.json());
  }

  const fallbackResponse = await fetch(FALLBACK_ENDPOINT, { cache: "no-store" });
  return normalizeMissionControlPayload(await fallbackResponse.json());
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
    load();
  }, []);

  return { payload, isLoading, error, refetch: load };
}
