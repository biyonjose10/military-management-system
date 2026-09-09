"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { fetchJson } from "@/app/providers";
import type { AuditEntryDTO } from "@/lib/dto/audit";

type Response = {
  entries: AuditEntryDTO[];
  total: number;
  take: number;
  skip: number;
};

const ACTION_FILTERS = [
  { value: "", label: "All" },
  { value: "CREATE", label: "Created" },
  { value: "UPDATE", label: "Updated" },
  { value: "DELETE", label: "Deleted" },
] as const;

/** Tone by consequence, not by category: deletions are the ones to notice. */
const ACTION_TONE: Record<string, string> = {
  CREATE: "text-ok",
  UPDATE: "text-muted",
  DELETE: "text-bad",
  RESTORE: "text-warn",
  LOGIN_SUCCESS: "text-muted",
  LOGIN_FAILURE: "text-warn",
  PERMISSION_DENIED: "text-bad",
};

export function AuditTable() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string>("");
  const [page, setPage] = useState(0);

  const take = 25;

  const params = useMemo(() => {
    const qs = new URLSearchParams({ take: String(take), skip: String(page * take) });
    if (search.trim()) qs.set("q", search.trim());
    if (action) qs.set("action", action);
    return qs.toString();
  }, [search, action, page]);

  const { data, error, isPending, isPlaceholderData } = useQuery<Response>({
    queryKey: ["audit", params],
    queryFn: () => fetchJson<Response>(`/api/audit?${params}`),
    placeholderData: keepPreviousData,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / take) - 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="audit-search" className="sr-only">
            Search by actor or target
          </label>
          <Input
            id="audit-search"
            placeholder="Search actor or target…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border border-line p-0.5">
          {ACTION_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={action === filter.value}
              onClick={() => {
                setAction(filter.value);
                setPage(0);
              }}
              className={
                action === filter.value
                  ? "rounded px-2.5 py-1 text-xs bg-surface-hi text-ink"
                  : "rounded px-2.5 py-1 text-xs text-muted hover:text-ink"
              }
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad-dim px-3 py-2 text-sm text-bad">
          {error.message}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-4xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
              <th scope="col" className="px-3 py-2 font-medium">When</th>
              <th scope="col" className="px-3 py-2 font-medium">Actor</th>
              <th scope="col" className="px-3 py-2 font-medium">Action</th>
              <th scope="col" className="px-3 py-2 font-medium">Target</th>
              <th scope="col" className="px-3 py-2 font-medium">Fields changed</th>
              <th scope="col" className="px-3 py-2 font-medium">From</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  Loading trail…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  Nothing has been recorded in your command yet. Every mutation
                  writes an entry, so an empty trail means no changes have been
                  made — not that logging is off.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-line/60 last:border-0 hover:bg-surface"
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted whitespace-nowrap">
                    {entry.at.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="font-mono">{entry.actorEmail}</span>
                    <span className="ms-2 text-faint">
                      {entry.actorRole.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-xs font-medium ${ACTION_TONE[entry.action] ?? "text-muted"}`}>
                    {entry.action.replace(/_/g, " ").toLowerCase()}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span>{entry.targetLabel}</span>
                    <span className="ms-2 text-faint">{entry.resource}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {entry.changedFields.length === 0 ? (
                      <span className="text-faint">—</span>
                    ) : (
                      // Names only, never values. An audit viewer that showed
                      // the old and new value of medicalNotes would be a
                      // complete bypass of the masking layer.
                      <span className="font-mono text-faint">
                        {entry.changedFields.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-faint">
                    {entry.ip ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <p aria-live="polite">
          {total === 0
            ? "No entries"
            : `${page * take + 1}–${Math.min((page + 1) * take, total)} of ${total} within your command`}
          {isPlaceholderData ? " · updating…" : ""}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            disabled={page >= lastPage}
            className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
