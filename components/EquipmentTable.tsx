"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MaskedField } from "@/components/MaskedField";
import { EquipmentStatusBadge } from "@/components/ReadinessBadge";
import { Input } from "@/components/ui/input";
import { fetchJson } from "@/app/providers";
import type { EquipmentDTO } from "@/lib/dto/equipment";
import { RANK_ABBREVIATIONS } from "@/lib/ranks";

type Response = {
  equipment: EquipmentDTO[];
  total: number;
  take: number;
  skip: number;
};

const CATEGORY_FILTERS = [
  { value: "", label: "All" },
  { value: "WEAPON", label: "Weapons" },
  { value: "VEHICLE", label: "Vehicles" },
  { value: "COMMS", label: "Comms" },
  { value: "RATIONS", label: "Sustainment" },
] as const;

/**
 * The property book. Fetched through /api/equipment for the same reason the
 * roster is — it exercises the authorization stack an external client would
 * hit, not a shortcut only the UI takes.
 *
 * The assignee column is the interesting one: it renders a person inside a
 * logistics screen, and their service number arrives already masked or not
 * according to the viewer's role. This component makes no such decision.
 */
export function EquipmentTable() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(0);

  const take = 25;

  const params = useMemo(() => {
    const qs = new URLSearchParams({ take: String(take), skip: String(page * take) });
    if (search.trim()) qs.set("q", search.trim());
    if (category) qs.set("category", category);
    if (overdueOnly) qs.set("overdue", "true");
    return qs.toString();
  }, [search, category, overdueOnly, page]);

  const { data, error, isPending, isPlaceholderData } = useQuery<Response>({
    queryKey: ["equipment", params],
    queryFn: () => fetchJson<Response>(`/api/equipment?${params}`),
    placeholderData: keepPreviousData,
  });

  const rows = data?.equipment ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / take) - 1);

  const reset = () => setPage(0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="property-search" className="sr-only">
            Search by serial number, stock number or item
          </label>
          <Input
            id="property-search"
            placeholder="Search serial, NSN or item…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              reset();
            }}
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border border-line p-0.5">
          {CATEGORY_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={category === filter.value}
              onClick={() => {
                setCategory(filter.value);
                reset();
              }}
              className={
                category === filter.value
                  ? "rounded px-2.5 py-1 text-xs bg-surface-hi text-ink"
                  : "rounded px-2.5 py-1 text-xs text-muted hover:text-ink"
              }
            >
              {filter.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(event) => {
              setOverdueOnly(event.target.checked);
              reset();
            }}
            className="size-3.5 accent-warn"
          />
          Service overdue only
        </label>
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
              <th scope="col" className="px-3 py-2 font-medium">Serial</th>
              <th scope="col" className="px-3 py-2 font-medium">Item</th>
              <th scope="col" className="px-3 py-2 font-medium">Unit</th>
              <th scope="col" className="px-3 py-2 font-medium">Issued to</th>
              <th scope="col" className="px-3 py-2 font-medium">Next service</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isPending ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  Loading property book…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  No equipment matches that filter within your command.
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-line/60 last:border-0 hover:bg-surface"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/equipment/${item.id}`} className="hover:underline">
                      {item.serialNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span>{item.name}</span>
                    <span className="ms-2 font-mono text-xs text-faint">{item.nsn}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">
                    {item.unitDesignation ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {item.assignedTo ? (
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span>
                          {RANK_ABBREVIATIONS[item.assignedTo.rank]}{" "}
                          {item.assignedTo.lastName}
                        </span>
                        <span className="font-mono text-faint">
                          <MaskedField field={item.assignedTo.serviceId} />
                        </span>
                      </span>
                    ) : (
                      <span className="text-faint">Unit pool</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {item.nextServiceDueAt ? (
                      <span className={item.serviceOverdue ? "text-warn" : "text-muted"}>
                        {item.nextServiceDueAt.slice(0, 10)}
                        {item.serviceOverdue ? " · overdue" : ""}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <EquipmentStatusBadge status={item.status} />
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
            ? "No items"
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
