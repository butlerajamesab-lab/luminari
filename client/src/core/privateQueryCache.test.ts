import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { clearPrivateQueryCache } from "./privateQueryCache";

describe("clearPrivateQueryCache", () => {
  it("resets enabled and disabled observers before removal without refetching", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const activeQueryFn = vi.fn().mockResolvedValue("new active value");
    const disabledQueryFn = vi.fn().mockResolvedValue("new disabled value");
    const activeKey = ["private", "active"] as const;
    const disabledKey = ["private", "disabled"] as const;

    queryClient.setQueryData(activeKey, "active secret");
    queryClient.setQueryData(disabledKey, "disabled secret");

    const activeObserver = new QueryObserver(queryClient, {
      queryKey: activeKey,
      queryFn: activeQueryFn,
      staleTime: Infinity,
    });
    const disabledObserver = new QueryObserver(queryClient, {
      queryKey: disabledKey,
      queryFn: disabledQueryFn,
      enabled: false,
    });
    const unsubscribeActive = activeObserver.subscribe(() => undefined);
    const unsubscribeDisabled = disabledObserver.subscribe(() => undefined);

    expect(queryClient.getQueryCache().find({ queryKey: activeKey })?.isActive()).toBe(true);
    expect(queryClient.getQueryCache().find({ queryKey: disabledKey })?.isActive()).toBe(false);
    expect(activeObserver.getCurrentResult().data).toBe("active secret");
    expect(disabledObserver.getCurrentResult().data).toBe("disabled secret");

    const lifecycle: string[] = [];
    const unsubscribeCache = queryClient.getQueryCache().subscribe(event => {
      if (event.type === "updated" && event.action.type === "setState") {
        lifecycle.push(`reset:${event.query.queryHash}`);
      }
      if (event.type === "removed") {
        expect(activeObserver.getCurrentResult().data).toBeUndefined();
        expect(disabledObserver.getCurrentResult().data).toBeUndefined();
        lifecycle.push(`removed:${event.query.queryHash}`);
      }
    });

    clearPrivateQueryCache(queryClient);

    expect(lifecycle).toEqual([
      'reset:["private","active"]',
      'reset:["private","disabled"]',
      'removed:["private","active"]',
      'removed:["private","disabled"]',
    ]);
    expect(activeObserver.getCurrentResult().data).toBeUndefined();
    expect(disabledObserver.getCurrentResult().data).toBeUndefined();
    expect(activeQueryFn).not.toHaveBeenCalled();
    expect(disabledQueryFn).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);

    unsubscribeCache();
    unsubscribeActive();
    unsubscribeDisabled();
  });

  it("allows public data to be fetched normally after the purge", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["private"], "secret");

    clearPrivateQueryCache(queryClient);

    await expect(queryClient.fetchQuery({
      queryKey: ["public"],
      queryFn: async () => "public value",
    })).resolves.toBe("public value");
  });
});
