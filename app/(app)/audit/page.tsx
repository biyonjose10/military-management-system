import { AuditTable } from "@/components/AuditTable";
import { requirePageScope } from "@/lib/auth/session";
import { auditBreakdown } from "@/lib/db/repositories/audit";

export const metadata = { title: "Audit — MMS" };

/**
 * The audit trail, readable only by a Commander.
 *
 * Entries are scoped by the ACTOR's unit path — you see what people at or
 * below you did. That is sound rather than merely convenient: an actor can
 * only mutate rows inside their own scope, so every target named in an entry
 * you can see was already within your subtree.
 */
export default async function AuditPage() {
  const scope = await requirePageScope("audit", "read");
  const counts = await auditBreakdown(scope);
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Audit trail</h1>
        <p className="text-sm text-muted">
          Every change made by anyone at or below your command.{" "}
          {total} {total === 1 ? "entry" : "entries"}.
        </p>
        <p className="text-xs text-faint">
          Entries record which fields changed, never what they changed to —
          otherwise this page would be a way around the masking everywhere else.
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["CREATE", "Created"],
            ["UPDATE", "Updated"],
            ["DELETE", "Deleted"],
          ] as const
        ).map(([action, label]) => (
          <div
            key={action}
            className="rounded-lg border border-line bg-surface px-4 py-3"
          >
            <dt className="text-xs uppercase tracking-wider text-faint">
              {label}
            </dt>
            <dd className="mt-2 text-2xl font-semibold">{counts[action] ?? 0}</dd>
          </div>
        ))}
      </dl>

      <AuditTable />
    </div>
  );
}
