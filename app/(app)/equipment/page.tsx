import { EquipmentTable } from "@/components/EquipmentTable";
import { EquipmentStatusBadge } from "@/components/ReadinessBadge";
import { requirePageScope } from "@/lib/auth/session";
import { equipmentBreakdown } from "@/lib/db/repositories/equipment";

export const metadata = { title: "Equipment — MMS" };

export default async function EquipmentPage() {
  const scope = await requirePageScope("equipment", "read");
  const counts = await equipmentBreakdown(scope);
  const total = counts.OPERATIONAL + counts.IN_MAINTENANCE + counts.DEADLINE;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Equipment</h1>
        <p className="text-sm text-muted">
          {scope.ownUnitOnly
            ? "Your unit only."
            : "Your unit and everything below it."}{" "}
          {total} {total === 1 ? "item" : "items"} on the property book.
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["OPERATIONAL", "Operational"],
            ["IN_MAINTENANCE", "In maintenance"],
            ["DEADLINE", "Deadlined"],
          ] as const
        ).map(([status, label]) => (
          <div
            key={status}
            className="rounded-lg border border-line bg-surface px-4 py-3"
          >
            <dt className="flex items-center justify-between gap-2">
              <span className="text-xs uppercase tracking-wider text-faint">
                {label}
              </span>
              <EquipmentStatusBadge status={status} />
            </dt>
            <dd className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{counts[status]}</span>
              <span className="text-xs text-faint">
                {total > 0 ? `${Math.round((counts[status] / total) * 100)}%` : "—"}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <EquipmentTable />
    </div>
  );
}
