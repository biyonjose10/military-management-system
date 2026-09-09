import Link from "next/link";

import { EquipmentStatusBadge, ReadinessBadge } from "@/components/ReadinessBadge";
import { StatusBarChart, type StatusSeries } from "@/components/StatusBarChart";
import { requirePageScope } from "@/lib/auth/session";
import { equipmentBreakdown } from "@/lib/db/repositories/equipment";
import { readinessBreakdown } from "@/lib/db/repositories/personnel";
import {
  equipmentByCategory,
  overdueService,
  readinessBySubordinate,
} from "@/lib/db/repositories/rollups";

export const metadata = { title: "Command dashboard — MMS" };

const READINESS_SERIES: StatusSeries[] = [
  { key: "DEPLOYABLE", label: "Deployable", token: "--ok" },
  { key: "LIMITED_DUTY", label: "Limited duty", token: "--warn" },
  { key: "NON_DEPLOYABLE", label: "Non-deployable", token: "--bad" },
];

const EQUIPMENT_SERIES: StatusSeries[] = [
  { key: "OPERATIONAL", label: "Operational", token: "--ok" },
  { key: "IN_MAINTENANCE", label: "In maintenance", token: "--warn" },
  { key: "DEADLINE", label: "Deadlined", token: "--bad" },
];

const CATEGORY_LABELS: Record<string, string> = {
  WEAPON: "Weapons",
  VEHICLE: "Vehicles",
  COMMS: "Comms",
  RATIONS: "Sustainment",
};

/**
 * The command picture.
 *
 * Every figure comes through the same `Scope` as the drill-down pages, so a
 * rollup can never count more than the viewer could list row by row. A
 * dashboard that totalled a wider population would be a disclosure in
 * aggregate — "you may not see these soldiers, but six are non-deployable" is
 * still information about someone else's command.
 */
export default async function DashboardPage() {
  const scope = await requirePageScope("personnel", "read");

  const [readiness, equipment, byUnit, byCategory, overdue] = await Promise.all([
    readinessBreakdown(scope),
    equipmentBreakdown(scope),
    readinessBySubordinate(scope),
    equipmentByCategory(scope),
    overdueService(scope),
  ]);

  const soldiers =
    readiness.DEPLOYABLE + readiness.LIMITED_DUTY + readiness.NON_DEPLOYABLE;
  const items =
    equipment.OPERATIONAL + equipment.IN_MAINTENANCE + equipment.DEADLINE;

  // The one number a commander acts on. A hero figure rather than a chart,
  // because a single percentage is not a comparison.
  const deployableRate =
    soldiers > 0 ? Math.round((readiness.DEPLOYABLE / soldiers) * 100) : 0;

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Command dashboard</h1>
        <p className="text-sm text-muted">
          {scope.viewer.unitDesignation}
          {scope.ownUnitOnly ? " — your unit only." : " and everything below it."}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface px-4 py-4">
          <p className="text-xs uppercase tracking-wider text-faint">Deployable</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold text-ok">{deployableRate}%</span>
            <span className="text-xs text-faint">
              {readiness.DEPLOYABLE} of {soldiers}
            </span>
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface px-4 py-4">
          <p className="text-xs uppercase tracking-wider text-faint">
            Non-deployable
          </p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold">
              {readiness.NON_DEPLOYABLE}
            </span>
            <ReadinessBadge status="NON_DEPLOYABLE" />
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface px-4 py-4">
          <p className="text-xs uppercase tracking-wider text-faint">Deadlined</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-4xl font-semibold">{equipment.DEADLINE}</span>
            <EquipmentStatusBadge status="DEADLINE" />
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Readiness by subordinate unit</h2>
          <Link href="/personnel" className="text-xs text-muted hover:text-ink">
            View roster →
          </Link>
        </div>
        <StatusBarChart
          rows={byUnit.map((row) => ({ ...row, label: row.designation }))}
          series={READINESS_SERIES}
          labelKey="label"
          emptyMessage="No personnel within your command."
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">
            Equipment status by category
            <span className="ms-2 font-normal text-faint">{items} items</span>
          </h2>
          <Link href="/equipment" className="text-xs text-muted hover:text-ink">
            View property book →
          </Link>
        </div>
        <StatusBarChart
          rows={byCategory.map((row) => ({
            ...row,
            label: CATEGORY_LABELS[row.category] ?? row.category,
          }))}
          series={EQUIPMENT_SERIES}
          labelKey="label"
          emptyMessage="No equipment within your command."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Service overdue</h2>
        {overdue.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-6 text-sm text-faint">
            Nothing is past its scheduled service date.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {overdue.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <Link
                  href={`/equipment/${item.id}`}
                  className="font-mono text-xs hover:underline"
                >
                  {item.serialNumber}
                </Link>
                <span className="text-sm">{item.name}</span>
                <span className="font-mono text-xs text-faint">
                  {item.unit.designation}
                </span>
                <span className="ms-auto font-mono text-xs text-warn">
                  due {item.nextServiceDueAt?.toISOString().slice(0, 10)}
                </span>
                <EquipmentStatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
