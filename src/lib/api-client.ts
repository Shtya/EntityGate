"use client";

/** Typed fetch wrapper for /api/v1 — unwraps the { data } / { error } envelope. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((d) => [d.path, d.message]));
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(`/api/v1${path}`, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const e = payload?.error;
    throw new ApiError(e?.code ?? "INTERNAL", e?.message ?? "Request failed", res.status, e?.details);
  }
  return payload?.data as T;
}
