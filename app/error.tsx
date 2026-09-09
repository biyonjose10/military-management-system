"use client";

/**
 * The last resort. It shows what went wrong in general terms and offers a
 * retry, and it deliberately does not print the error message: a Prisma or
 * auth error string describes the schema to whoever provoked it.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-lg font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-muted">
          The request could not be completed. If this keeps happening, sign out
          and back in — a revoked or expired session looks like this.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-line px-3 py-1.5 text-sm transition-colors hover:bg-surface-hi"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
