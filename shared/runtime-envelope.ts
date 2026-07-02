export type RuntimeAvailability = "available" | "partial" | "empty" | "unavailable";

export type RuntimeState = {
  availability: RuntimeAvailability;
  dry_run?: boolean;
  can_apply?: boolean;
  blockers: string[];
};

export type RuntimeDiagnostic = {
  code: string;
  message?: string;
  detail?: unknown;
};

export type RuntimeDiagnostics = {
  errors: RuntimeDiagnostic[];
  warnings: RuntimeDiagnostic[];
  backend?: unknown;
};

export type RuntimeEnvelope<TData = unknown, TState extends RuntimeState = RuntimeState> = {
  success: boolean;
  source: string;
  action?: string;
  data: TData | null;
  state: TState;
  diagnostics: RuntimeDiagnostics;
  counts?: Record<string, number>;
  flags?: Record<string, boolean | string | number | null>;
  meta?: Record<string, unknown>;
};

export type RuntimeEnvelopeOptions<TData = unknown> = {
  source: string;
  action?: string;
  data?: TData | null;
  availability?: RuntimeAvailability;
  dry_run?: boolean;
  can_apply?: boolean;
  blockers?: string[];
  errors?: RuntimeDiagnostic[];
  warnings?: RuntimeDiagnostic[];
  backend?: unknown;
  counts?: Record<string, number>;
  flags?: Record<string, boolean | string | number | null>;
  meta?: Record<string, unknown>;
};

function compactNumberRecord(value: Record<string, unknown>): Record<string, number> | undefined {
  const entries = Object.entries(value)
    .filter(([, entry]) => typeof entry === "number" && Number.isFinite(entry)) as Array<[string, number]>;
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function createRuntimeEnvelope<TData = unknown>(options: RuntimeEnvelopeOptions<TData>): RuntimeEnvelope<TData> {
  const errors = options.errors ?? [];
  const blockers = options.blockers ?? errors.map((error) => error.code).filter(Boolean);
  return {
    success: errors.length === 0,
    source: options.source,
    ...(options.action ? { action: options.action } : {}),
    data: options.data ?? null,
    state: {
      availability: options.availability ?? (errors.length ? "unavailable" : "available"),
      ...(options.dry_run === undefined ? {} : { dry_run: options.dry_run }),
      ...(options.can_apply === undefined ? {} : { can_apply: options.can_apply }),
      blockers,
    },
    diagnostics: {
      errors,
      warnings: options.warnings ?? [],
      ...(options.backend === undefined ? {} : { backend: options.backend }),
    },
    ...(options.counts ? { counts: options.counts } : {}),
    ...(options.flags ? { flags: options.flags } : {}),
    ...(options.meta ? { meta: options.meta } : {}),
  };
}

export function withRuntimeEnvelope<TPayload extends Record<string, any>, TData = TPayload>(
  payload: TPayload,
  options: RuntimeEnvelopeOptions<TData>,
): TPayload & RuntimeEnvelope<TData> {
  const errorCode = typeof payload.error === "string" ? payload.error : undefined;
  const warningCode = typeof payload.warning === "string" ? payload.warning : undefined;
  const envelope = createRuntimeEnvelope<TData>({
    ...options,
    action: options.action ?? (typeof payload.action === "string" ? payload.action : undefined),
    dry_run: options.dry_run ?? (typeof payload.dry_run === "boolean" ? payload.dry_run : undefined),
    errors: options.errors ?? (payload.success === false && errorCode ? [{ code: errorCode, message: typeof payload.message === "string" ? payload.message : undefined }] : []),
    warnings: options.warnings ?? (warningCode ? [{ code: warningCode, message: typeof payload.message === "string" ? payload.message : undefined }] : []),
  });
  return { ...payload, ...envelope, success: envelope.success };
}

export function inferRuntimeCounts(payload: Record<string, unknown>, keys: string[]): Record<string, number> | undefined {
  return compactNumberRecord(Object.fromEntries(keys.map((key) => [key, payload[key]])));
}
