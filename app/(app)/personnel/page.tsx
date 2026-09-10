import { NewPersonnelForm } from "@/components/NewPersonnelForm";
import { PersonnelTable } from "@/components/PersonnelTable";
import { ReadinessBadge } from "@/components/ReadinessBadge";
import { can } from "@/lib/auth/policy";
import { requirePageScope } from "@/lib/auth/session";
import { readinessBreakdown } from "@/lib/db/repositories/personnel";

export const metadata = { title: "Personnel — MMS" };

/**
 * The rollup is read server-side through the repository, while the table below
 * fetches through /api/personnel. Both go through the same scope, so the counts
 * and the rows can never describe different populations.
 */
export default async function PersonnelPage() {
  const scope = await requirePageScope("personnel", "read");
  const counts = await readinessBreakdown(scope);
  const total = counts.DEPLOYABLE + counts.LIMITED_DUTY + counts.NON_DEPLOYABLE;

  // Presentation only. POST /api/personnel runs the same check itself, so a
  // role that reaches the endpoint directly is refused whether or not this
  // page decided to draw the button.
  const mayCreate = can(scope.viewer.role, "personnel", "create");

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Personnel</h1>
        <p className="text-sm text-muted">
          {scope.ownUnitOnly
            ? "Your unit only."
            : "Your unit and everything below it."}{" "}
          {total} {total === 1 ? "record" : "records"} in scope.
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["DEPLOYABLE", "Deployable"],
            ["LIMITED_DUTY", "Limited duty"],
            ["NON_DEPLOYABLE", "Non-deployable"],
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
              <ReadinessBadge status={status} />
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

      {mayCreate ? <NewPersonnelForm /> : null}

      <PersonnelTable />
    </div>
  );
}
