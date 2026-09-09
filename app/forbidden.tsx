import Link from "next/link";

/**
 * Rendered by `forbidden()` with a real 403.
 *
 * It names the thing that was refused and offers a way back, because the
 * common cause is not an attack — it is a Commander following a link a
 * Quartermaster sent them. "Something went wrong" would be both untrue and
 * unhelpful: nothing went wrong.
 */
export default function Forbidden() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md space-y-4 text-center">
        <p className="font-mono text-xs uppercase tracking-wider text-faint">
          403
        </p>
        <h1 className="text-lg font-semibold tracking-tight">
          Your role cannot view this
        </h1>
        <p className="text-sm text-muted">
          Access here is decided by role, not by rank — a Commander outranks a
          Medical Officer and still cannot write medical readiness. If you need
          this page, you need a different role, not a higher one.
        </p>
        <Link
          href="/personnel"
          className="inline-block rounded-md border border-line px-3 py-1.5 text-sm transition-colors hover:bg-surface-hi"
        >
          Back to personnel
        </Link>
      </div>
    </main>
  );
}
