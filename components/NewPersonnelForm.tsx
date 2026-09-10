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
import type { PersonnelDTO } from "@/lib/dto/personnel";
import { RANK_ABBREVIATIONS } from "@/lib/ranks";

type UnitsResponse = {
  units: { id: number; designation: string; name: string; depth: number }[];
};

/**
 * Ranks in the order the enum declares them, junior first, so the list reads
 * the way a promotion chart does rather than alphabetically.
 */
const RANKS = Object.keys(RANK_ABBREVIATIONS) as (keyof typeof RANK_ABBREVIATIONS)[];

const RANK_LABELS: Record<string, string> = Object.fromEntries(
  RANKS.map((rank) => [
    rank,
    `${RANK_ABBREVIATIONS[rank]} — ${rank
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase())}`,
  ]),
);

/**
 * Add a soldier to the roster.
 *
 * Rendered only where `can(role, "personnel", "create")` — a Commander. Hiding
 * it from everyone else is presentation, not protection: POST /api/personnel
 * calls `requirePermission()` itself and answers 403 to a Medical Officer who
 * finds the endpoint by hand. This component could be mounted for every role
 * and nothing would leak; it is hidden because an affordance that always fails
 * is a bad affordance, not because the button is the check.
 *
 * Note what is NOT on this form: `readiness`. A Commander may read deployability
 * and may not set it — `MEDICALLY_WRITABLE` in lib/auth/policy.ts — so a new
 * soldier lands on the schema default, DEPLOYABLE, and the Medical Officer
 * decides otherwise afterwards. Putting the dropdown here would let the create
 * path express a judgement the update path refuses, and the demo would be
 * telling two different stories about the same rule.
 */
export function NewPersonnelForm() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);

  const units = useQuery<UnitsResponse>({
    queryKey: ["units"],
    queryFn: () => fetchJson<UnitsResponse>("/api/units"),
    // The hierarchy does not change during a session.
    staleTime: Infinity,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      postJson<PersonnelDTO>("/api/personnel", body),
  });

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
    close: () => void,
  ) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();

    // Optional fields are omitted when blank rather than sent as "". The
    // schemas are strict and `email` is `z.email()`, so an empty string is a
    // validation error for a field the user simply left alone.
    const optional: Record<string, string> = {};
    for (const name of [
      "phone",
      "email",
      "emergencyContactName",
      "emergencyContactPhone",
    ]) {
      const value = text(name);
      if (value) optional[name] = value;
    }

    try {
      const created = await create.mutateAsync({
        serviceId: text("serviceId"),
        firstName: text("firstName"),
        lastName: text("lastName"),
        rank: text("rank"),
        unitId: Number(form.get("unitId")),
        dateOfBirth: text("dateOfBirth"),
        enlistedAt: text("enlistedAt"),
        ...optional,
      });

      // Two refreshes because two things are stale: the table reads through
      // react-query, the readiness rollup above it is rendered on the server.
      await queryClient.invalidateQueries({ queryKey: ["personnel"] });
      router.refresh();
      close();
      router.push(`/personnel/${created.id}`);
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
      title="Add a soldier"
      description="Readiness starts at Deployable — only a Medical Officer can change it."
      openLabel="Add soldier"
    >
      {(close) => (
        <form onSubmit={(event) => submit(event, close)} className="space-y-4">
          <FormError error={error} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="firstName"
              label="First name"
              error={error}
              required
              maxLength={60}
              autoComplete="off"
            />
            <TextField
              name="lastName"
              label="Last name"
              error={error}
              required
              maxLength={60}
              autoComplete="off"
            />
            <TextField
              name="serviceId"
              label="Service number"
              hint="NNN-NN-NNNN"
              placeholder="123-45-6789"
              error={error}
              required
              autoComplete="off"
              className="font-mono"
            />
            <SelectField name="rank" label="Rank" error={error} required defaultValue="PRIVATE">
              {RANKS.map((rank) => (
                <option key={rank} value={rank}>
                  {RANK_LABELS[rank]}
                </option>
              ))}
            </SelectField>

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
              name="enlistedAt"
              label="Enlisted"
              type="date"
              error={error}
              required
            />
            <TextField
              name="dateOfBirth"
              label="Date of birth"
              type="date"
              error={error}
              required
            />
            <TextField
              name="phone"
              label="Phone"
              error={error}
              maxLength={40}
              autoComplete="off"
            />
            <TextField
              name="email"
              label="Email"
              type="email"
              error={error}
              autoComplete="off"
            />
            <TextField
              name="emergencyContactName"
              label="Emergency contact"
              error={error}
              maxLength={120}
              autoComplete="off"
            />
            <TextField
              name="emergencyContactPhone"
              label="Emergency phone"
              error={error}
              maxLength={40}
              autoComplete="off"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-md border border-line bg-surface-hi px-3 py-1.5 text-sm text-ink transition-opacity disabled:opacity-50"
            >
              {create.isPending ? "Adding…" : "Add to roster"}
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
