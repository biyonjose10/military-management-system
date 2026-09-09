import Link from "next/link";
import { notFound } from "next/navigation";

import { MaskedField } from "@/components/MaskedField";
import { EquipmentStatusBadge } from "@/components/ReadinessBadge";
import { requireScopeWith } from "@/lib/auth/session";
import { getEquipment } from "@/lib/db/repositories/equipment";
import { toEquipmentDTO } from "@/lib/dto/equipment";
import { RANK_ABBREVIATIONS } from "@/lib/ranks";

export const metadata = { title: "Equipment record — MMS" };

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const scope = await requireScopeWith("equipment", "read");
  const { id } = await params;

  const row = await getEquipment(scope, id);
  // Same 404 for "not yours" as for "does not exist".
  if (!row) notFound();

  const item = toEquipmentDTO(row, scope.viewer.role);
  const logs = item.maintenanceLogs ?? [];
  const open = logs.filter((log) => log.closedAt === null);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/equipment" className="text-xs text-muted hover:text-ink">
          ← Equipment
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">{item.name}</h1>
          <p className="font-mono text-xs text-muted">
            {item.serialNumber} · NSN {item.nsn} · {item.unitDesignation ?? "Unassigned"}
          </p>
        </div>
        <EquipmentStatusBadge status={item.status} />
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Accountability
        </h2>
        <dl className="grid gap-x-8 gap-y-3 rounded-lg border border-line bg-surface px-4 py-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-faint">Issued to</dt>
            <dd className="mt-0.5 text-sm">
              {item.assignedTo ? (
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span>
                    {RANK_ABBREVIATIONS[item.assignedTo.rank]}{" "}
                    {item.assignedTo.lastName}, {item.assignedTo.firstName}
                  </span>
                  <span className="font-mono text-xs">
                    <MaskedField field={item.assignedTo.serviceId} />
                  </span>
                </span>
              ) : (
                <span className="text-faint">Unit pool</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Category</dt>
            <dd className="mt-0.5 text-sm">{item.category.toLowerCase()}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Acquired</dt>
            <dd className="mt-0.5 text-sm">{day(item.acquiredAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Last serviced</dt>
            <dd className="mt-0.5 text-sm">{day(item.lastServicedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Next service due</dt>
            <dd className={`mt-0.5 text-sm ${item.serviceOverdue ? "text-warn" : ""}`}>
              {day(item.nextServiceDueAt)}
              {item.serviceOverdue ? " · overdue" : ""}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Maintenance history
          {open.length > 0 ? (
            <span className="ms-2 text-warn">
              {open.length} open
            </span>
          ) : null}
        </h2>

        {logs.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-4 text-sm text-faint">
            No maintenance has ever been opened against this item.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {logs.map((log) => (
              <li key={log.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{log.summary}</span>
                  <EquipmentStatusBadge status={log.status} />
                </div>
                <p className="font-mono text-xs text-faint">
                  {day(log.openedAt)} →{" "}
                  {log.closedAt ? day(log.closedAt) : "open"} · {log.technician}
                  {log.laborHours !== null ? ` · ${log.laborHours}h` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
