import Link from "next/link";
import { notFound } from "next/navigation";

import { MaskedField } from "@/components/MaskedField";
import { ReadinessBadge } from "@/components/ReadinessBadge";
import { requireScopeWith } from "@/lib/auth/session";
import { getPersonnel } from "@/lib/db/repositories/personnel";
import { toPersonnelDTO } from "@/lib/dto/personnel";
import { RANK_ABBREVIATIONS } from "@/lib/ranks";

export const metadata = { title: "Personnel record — MMS" };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function PersonnelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const scope = await requireScopeWith("personnel", "read");
  const { id } = await params;

  const row = await getPersonnel(scope, id);
  // `getPersonnel` returns null for a record in another unit exactly as it does
  // for one that never existed. Rendering the same 404 for both is what stops
  // this page confirming who is in a neighbouring platoon.
  if (!row) notFound();

  const person = toPersonnelDTO(row, scope.viewer.role);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/personnel" className="text-xs text-muted hover:text-ink">
          ← Personnel
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">
            <span className="font-mono text-muted">
              {RANK_ABBREVIATIONS[person.rank]}
            </span>{" "}
            {person.lastName}, {person.firstName}
          </h1>
          <p className="font-mono text-xs text-muted">
            {person.unitDesignation ?? "Unassigned"}
          </p>
        </div>
        <ReadinessBadge status={person.readiness} />
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Identity
        </h2>
        <dl className="grid gap-x-8 gap-y-3 rounded-lg border border-line bg-surface px-4 py-4 sm:grid-cols-2">
          <Row label="Service number">
            <MaskedField field={person.serviceId} />
          </Row>
          <Row label="Date of birth">
            <MaskedField field={person.dateOfBirth} />
          </Row>
          <Row label="Rank category">{person.rankCategory.toLowerCase()}</Row>
          <Row label="Enlisted">{formatDate(person.enlistedAt)}</Row>
          <Row label="Phone">
            <MaskedField field={person.phone} />
          </Row>
          <Row label="Email">
            <MaskedField field={person.email} />
          </Row>
          <Row label="Next of kin">
            <MaskedField field={person.emergencyContactName} />
          </Row>
          <Row label="Next of kin phone">
            <MaskedField field={person.emergencyContactPhone} />
          </Row>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Medical readiness
        </h2>

        {person.medical.masked ? (
          // Shown as withheld rather than omitted. An absent section reads as
          // "this soldier has no medical record", which is a different claim.
          <p className="rounded-lg border border-line bg-surface px-4 py-4 text-sm text-mask">
            {person.medical.reason}
          </p>
        ) : (
          <dl className="grid gap-x-8 gap-y-3 rounded-lg border border-line bg-surface px-4 py-4 sm:grid-cols-2">
            <Row label="Cleared until">
              {formatDate(person.medical.clearedUntil)}
            </Row>
            <Row label="Last physical">
              {formatDate(person.medical.lastPhysicalAt)}
            </Row>
            <div className="sm:col-span-2">
              <dt className="text-xs text-faint">Notes</dt>
              <dd className="mt-1 text-sm">
                {person.medical.notes ?? (
                  <span className="text-faint">No open notes.</span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Deployment
        </h2>
        <dl className="grid gap-x-8 gap-y-3 rounded-lg border border-line bg-surface px-4 py-4 sm:grid-cols-2">
          <Row label="Deployed until">{formatDate(person.deployedUntil)}</Row>
        </dl>
      </section>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
