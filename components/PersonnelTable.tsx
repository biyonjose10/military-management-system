"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MaskedField } from "@/components/MaskedField";
import { ReadinessBadge } from "@/components/ReadinessBadge";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/app/providers";
import type { PersonnelDTO } from "@/lib/dto/personnel";
import { RANK_ABBREVIATIONS } from "@/lib/ranks";

type Response = {
  personnel: PersonnelDTO[];
  total: number;
  take: number;
  skip: number;
  scope: { unitId: number; ownUnitOnly: boolean };
};

const READINESS_FILTERS = [
  { value: "", label: "All" },
  { value: "DEPLOYABLE", label: "Deployable" },
  { value: "LIMITED_DUTY", label: "Limited duty" },
  { value: "NON_DEPLOYABLE", label: "Non-deployable" },
] as const;

/**
 * The roster, fetched from /api/personnel rather than read in the server
 * component.
 *
 * Going through the HTTP endpoint is deliberate: it is the same path an
 * external client would take, so the Playwright segregation spec exercises the
 * real authorization stack instead of a shortcut only the UI uses. Everything
 * rendered here is already a DTO — masked fields arrive masked, and this
 * component could not unmask one if it tried.
 */
export function PersonnelTable() {
  const [search, setSearch] = useState("");
  const [readiness, setReadiness] = useState<string>("");
  const [page, setPage] = useState(0);

  const take = 25;

  const params = useMemo(() => {
    const qs = new URLSearchParams({ take: String(take), skip: String(page * take) });
    if (search.trim()) qs.set("q", search.trim());
    if (readiness) qs.set("readiness", readiness);
    return qs.toString();
  }, [search, readiness, page]);

  const { data, error, isPending, isPlaceholderData } = useQuery<Response>({
    queryKey: ["personnel", params],
    queryFn: () => fetchJson<Response>(`/api/personnel?${params}`),
    // Keeps the previous page on screen while the next one loads, so the table
    // does not collapse to a spinner on every keystroke.
    placeholderData: keepPreviousData,
  });

  const showing = data?.personnel ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / take) - 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="roster-search" className="sr-only">
            Search by name or service number
          </label>
          <Input
            id="roster-search"
            placeholder="Search name or service number…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border border-line p-0.5">
          {READINESS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={readiness === filter.value}
              onClick={() => {
                setReadiness(filter.value);
                setPage(0);
              }}
              className={
                readiness === filter.value
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
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-faint">
              <th scope="col" className="px-3 py-2 font-medium">Rank</th>
              <th scope="col" className="px-3 py-2 font-medium">Name</th>
              <th scope="col" className="px-3 py-2 font-medium">Service no.</th>
              <th scope="col" className="px-3 py-2 font-medium">Unit</th>
              <th scope="col" className="px-3 py-2 font-medium">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  Loading roster…
                </td>
              </tr>
            ) : showing.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  No personnel match that filter within your command.
                </td>
              </tr>
            ) : (
              showing.map((person) => (
                <tr
                  key={person.id}
                  className="border-b border-line/60 last:border-0 hover:bg-surface"
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {RANK_ABBREVIATIONS[person.rank]}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/personnel/${person.id}`}
                      className="hover:underline"
                    >
                      {person.lastName}, {person.firstName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    <MaskedField field={person.serviceId} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {person.unitDesignation ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ReadinessBadge status={person.readiness} />
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
            ? "No records"
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
