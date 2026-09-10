"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Created in state, not at module scope: a module-level client is shared
  // across requests on the server and would leak one viewer's cached roster
  // into another's render.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Retrying a 403 just asks to be refused three more times.
            retry: (count, error) =>
              count < 2 && !(error instanceof ApiError && error.status < 500),
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** One field the server rejected, as `errorResponse()` reports a ZodError. */
export type ApiIssue = { path: string; message: string };

/** Carries the status through so the UI can say *why* a request failed. */
export class ApiError extends Error {
  readonly status: number;
  readonly field?: string;
  /** Per-field validation messages, present on a 400 from a Zod schema. */
  readonly issues: readonly ApiIssue[];
  constructor(
    status: number,
    message: string,
    field?: string,
    issues: readonly ApiIssue[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.field = field;
    this.issues = issues;
  }

  /**
   * The message to show next to one input.
   *
   * A 403 names its field directly (`canWriteField` refused it); a 400 carries
   * a list of Zod issues keyed by path. Both are per-field, so both resolve
   * here rather than in each form.
   */
  messageForField(name: string): string | undefined {
    if (this.field === name) return this.message;
    return this.issues.find((issue) => issue.path === name)?.message;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => ({}));
  return new ApiError(
    response.status,
    body.error ?? `Request failed (${response.status}).`,
    body.field,
    Array.isArray(body.issues) ? body.issues : [],
  );
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw await toApiError(response);
  return response.json() as Promise<T>;
}

/**
 * Writes go through the same JSON endpoints the read side uses.
 *
 * Deliberately not a server action: a server action is a private RPC channel
 * that would bypass the route handler, and the route handler is where
 * `requirePermission()` and the strict Zod schema live. Posting to the public
 * API means the form is held to exactly the rules an external client would be,
 * and the Playwright segregation spec covers both at once.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await toApiError(response);
  return response.json() as Promise<T>;
}
