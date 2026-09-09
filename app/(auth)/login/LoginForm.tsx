"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";

import { authenticate } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_PASSWORD, DEMO_USERS } from "@/lib/demo-users";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/personnel";

  const [error, formAction, pending] = useActionState(authenticate, undefined);
  const [email, setEmail] = useState(DEMO_USERS[0].email);

  return (
    <div className="w-full max-w-lg space-y-8">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">
          Military Management System
        </h1>
        <p className="text-sm text-muted">
          Personnel readiness, equipment logistics and chain-of-command access
          control.{" "}
          <span className="text-faint">
            Demonstration system. Every soldier, unit and serial number below is
            fictional.
          </span>
        </p>
      </header>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue={DEMO_PASSWORD}
          />
        </div>

        {error ? (
          // aria-live so the failure is announced; the form does not navigate,
          // so a screen reader would otherwise hear nothing at all.
          <p role="alert" aria-live="polite" className="text-sm text-bad">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">
          Demo accounts — password {DEMO_PASSWORD}
        </h2>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {DEMO_USERS.map((user) => (
            <li key={user.email}>
              <button
                type="button"
                onClick={() => setEmail(user.email)}
                className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-hi"
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-xs">{user.email}</span>
                  <span className="text-xs text-muted">
                    {user.role.replace(/_/g, " ").toLowerCase()}
                  </span>
                </span>
                <span className="text-xs text-faint">{user.demonstrates}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
