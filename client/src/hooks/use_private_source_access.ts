import { useEffect, useState } from "react";

export function use_private_source_access(source_url: string | null | undefined) {
  const [access_url, set_access_url] = useState<string | null>(null);
  const [access_error, set_access_error] = useState<string | null>(null);
  const [is_resolving, set_is_resolving] = useState(false);
  const [generation, set_generation] = useState(0);

  useEffect(() => {
    if (!source_url) {
      set_access_url(null);
      set_access_error(null);
      set_is_resolving(false);
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    set_access_url(null);
    set_access_error(null);
    set_is_resolving(true);

    const bridge_url = new URL(source_url, window.location.origin);
    bridge_url.searchParams.set("access", "json");

    void fetch(bridge_url.href, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(`Source access failed with HTTP ${response.status}`);
      const payload = await response.json() as { url?: string };
      const final_url = payload.url;
      if (!final_url) {
        throw new Error("Private source bridge did not return a storage access URL");
      }
      if (!disposed) set_access_url(final_url);
    }).catch(error => {
      if (controller.signal.aborted || disposed) return;
      set_access_error(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (!disposed) set_is_resolving(false);
    });

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [source_url, generation]);

  return {
    access_url,
    access_error,
    is_resolving,
    retry_access: () => set_generation(value => value + 1),
  };
}
