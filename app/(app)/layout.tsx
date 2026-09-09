import { redirect } from "next/navigation";
import Link from "next/link";

import { signOut } from "@/lib/auth/config";
import { requireViewer } from "@/lib/auth/session";
import { can } from "@/lib/auth/policy";

/**
 * The authenticated shell.
 *
 * `requireViewer()` runs here as well as in every route handler. That is not
 * redundancy for its own sake — the layout needs the viewer to render, and
 * running the same check means a revoked session loses the chrome at the same
 * moment it loses the data, instead of rendering a shell around an error.
 *
 * The nav is filtered by `can()`, which is presentation only. A quartermaster
 * who types /audit anyway is refused by the route, not by the missing link.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await requireViewer().catch(() => null);
  if (!viewer) redirect("/login");

  const links = [
    { href: "/personnel", label: "Personnel", show: can(viewer.role, "personnel", "read") },
    { href: "/equipment", label: "Equipment", show: can(viewer.role, "equipment", "read") },
    { href: "/audit", label: "Audit", show: can(viewer.role, "audit", "read") },
  ].filter((link) => link.show);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href="/personnel" className="text-sm font-semibold tracking-tight">
            MMS
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-2.5 py-1 text-muted transition-colors hover:bg-surface-hi hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-3 text-xs">
            <span className="hidden text-faint sm:inline">{viewer.name}</span>
            <span
              className="rounded-md border border-line bg-surface-hi px-2 py-1 font-medium"
              title="Your access role. Determines which fields you can see."
            >
              {viewer.role.replace(/_/g, " ")}
            </span>
            <span
              className="rounded-md border border-line px-2 py-1 font-mono text-muted"
              title="Your unit. You can only see records at or below it."
            >
              {viewer.unitDesignation}
            </span>

            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="rounded-md px-2 py-1 text-muted transition-colors hover:bg-surface-hi hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>

      <footer className="border-t border-line px-6 py-4">
        <p className="mx-auto w-full max-w-7xl text-xs text-faint">
          Demonstration system. All personnel, units, serial numbers and medical
          records are fictional.
        </p>
      </footer>
    </div>
  );
}
