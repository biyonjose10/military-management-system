"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  CreatePanel,
  FormError,
  SelectField,
  TextField,
  UnitOptions,
} from "@/components/CreatePanel";
import { ApiError, fetchJson, postJson } from "@/app/providers";
import type { EquipmentDTO } from "@/lib/dto/equipment";

type UnitsResponse = {
  units: { id: number; designation: string; name: string; depth: number }[];
};

const CATEGORIES = [
  ["WEAPON", "Weapon"],
  ["VEHICLE", "Vehicle"],
  ["COMMS", "Comms"],
  ["RATIONS", "Rations"],
] as const;

/**
 * Add an item to the property book.
 *
 * Rendered only where `can(role, "equipment", "create")` — a Quartermaster.
 * A Commander reads the property book and cannot add to it, which is the same
 * shape of rule as a Commander reading medical readiness and not writing it.
 *
 * Two fields the create schema accepts and this form does not offer:
 *
 *   `status` — not on the schema at all. Equipment status is a consequence of
 *   maintenance logs, so a new item is OPERATIONAL and gets deadlined by
 *   opening a fault, never by typing it.
 *
 *   `assignedToId` — issuing an item is its own action against a specific
 *   soldier, and doing it inside the create form would need a roster search
 *   here for no gain. New items land in the unit pool.
 */
export function NewEquipmentForm() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);

  const units = useQuery<UnitsResponse>({
    queryKey: ["units"],
    queryFn: () => fetchJson<UnitsResponse>("/api/units"),
    staleTime: Infinity,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      postJson<EquipmentDTO>("/api/equipment", body),
  });

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    close: () => void,
  ) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();

    const nextService = text("nextServiceDueAt");

    try {
      const created = await create.mutateAsync({
        serialNumber: text("serialNumber"),
        nsn: text("nsn"),
        name: text("name"),
        category: text("category"),
        unitId: Number(form.get("unitId")),
        acquiredAt: text("acquiredAt"),
        // Explicit null, not omission: the column is nullable and "no service
        // scheduled" is a real answer, distinct from "not stated".
        nextServiceDueAt: nextService || null,
      });

      await queryClient.invalidateQueries({ queryKey: ["equipment"] });
      router.refresh();
      close();
      router.push(`/equipment/${created.id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, "Could not reach the server."),
      );
    }
  }

  return (
    <CreatePanel
      title="Add equipment"
      description="New items start Operational and unissued. Status changes come from maintenance logs."
      openLabel="Add equipment"
    >
      {(close) => (
        <form onSubmit={(event) => submit(event, close)} className="space-y-4">
          <FormError error={error} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="name"
              label="Item"
              placeholder="M4A1 Carbine"
              error={error}
              required
              maxLength={120}
              autoComplete="off"
            />
            <SelectField
              name="category"
              label="Category"
              error={error}
              required
              defaultValue="WEAPON"
            >
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>

            <TextField
              name="serialNumber"
              label="Serial number"
              error={error}
              required
              minLength={3}
              maxLength={60}
              autoComplete="off"
              className="font-mono"
            />
            <TextField
              name="nsn"
              label="NSN"
              hint="NNNN-NN-NNN-NNNN"
              placeholder="1005-01-231-0973"
              error={error}
              required
              autoComplete="off"
              className="font-mono"
            />

            <SelectField
              name="unitId"
              label="Unit"
              hint={
                units.isPending
                  ? "Loading units…"
                  : "Only units within your command are listed."
              }
              error={error}
              required
              disabled={units.isPending || !!units.error}
            >
              <UnitOptions units={units.data?.units ?? []} />
            </SelectField>

            <TextField
              name="acquiredAt"
              label="Acquired"
              type="date"
              error={error}
              required
            />
            <TextField
              name="nextServiceDueAt"
              label="Next service due"
              type="date"
              error={error}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md border border-line bg-surface-hi px-3 py-1.5 text-sm text-ink transition-opacity disabled:opacity-50"
            >
              {create.isPending ? "Adding…" : "Add to property book"}
            </button>
            <p className="text-xs text-faint">
              Recorded in the audit trail as a CREATE against your account.
            </p>
          </div>
        </form>
      )}
    </CreatePanel>
  );
}
