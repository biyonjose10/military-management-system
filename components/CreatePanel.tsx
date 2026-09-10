"use client";

import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/app/providers";

/**
 * The chrome shared by the two create forms.
 *
 * A disclosure panel rather than a modal dialog, on purpose: a modal needs a
 * focus trap, a scroll lock and a portal to be accessible, and none of that is
 * earned by a form that is the only thing on the page anyone would be doing.
 * Inline also keeps the roster visible underneath, so it is obvious that the
 * new row appeared.
 */
export function CreatePanel({
  title,
  description,
  openLabel,
  children,
}: {
  title: string;
  description: string;
  openLabel: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={panelId}
        className="rounded-md border border-line px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
      >
        + {openLabel}
      </button>
    );
  }

  return (
    <section
      id={panelId}
      className="rounded-lg border border-line bg-surface p-4"
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <p className="text-xs text-muted">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
      </header>

      {children(() => setOpen(false))}
    </section>
  );
}

/**
 * One labelled control plus the server's complaint about it.
 *
 * The error text is read off the ApiError rather than re-validated in the
 * browser. Mirroring the Zod schema client-side would mean two definitions of
 * "valid" that drift, and the one that matters is the one the route enforces —
 * so the browser asks and reports the answer.
 */
export function Field({
  name,
  label,
  hint,
  error,
  required,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  error?: ApiError | null;
  required?: boolean;
  children?: React.ReactNode;
}) {
  const message = error?.messageForField(name);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-xs text-muted">
        {label}
        {required ? null : (
          <span className="text-faint font-normal">optional</span>
        )}
      </Label>
      {children}
      {message ? (
        <p role="alert" className="text-xs text-bad">
          {message}
        </p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/** A plain text/date input wired to `Field`'s id and invalid state. */
export function TextField({
  name,
  label,
  hint,
  error,
  required,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  error?: ApiError | null;
  required?: boolean;
} & React.ComponentProps<"input">) {
  return (
    <Field
      name={name}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <Input
        id={name}
        name={name}
        required={required}
        aria-invalid={error?.messageForField(name) ? true : undefined}
        {...props}
      />
    </Field>
  );
}

/**
 * A native `<select>`, not the Radix one.
 *
 * The unit picker can hold every unit in a brigade; a native select gets
 * type-ahead, mobile pickers and keyboard paging from the platform for free,
 * and inside a form the value is read the same way as any other control.
 */
export function SelectField({
  name,
  label,
  hint,
  error,
  required,
  children,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  error?: ApiError | null;
  required?: boolean;
} & React.ComponentProps<"select">) {
  return (
    <Field
      name={name}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <select
        id={name}
        name={name}
        required={required}
        aria-invalid={error?.messageForField(name) ? true : undefined}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}

/** The banner for errors that belong to the request, not to one field. */
export function FormError({ error }: { error: ApiError | null }) {
  if (!error) return null;

  // A field-level complaint is already rendered under its input; repeating it
  // up here would read as two separate problems.
  const isFieldOnly =
    (error.issues.length > 0 && error.status === 400) ||
    (error.field !== undefined && error.status === 403);
  if (isFieldOnly) {
    return (
      <p
        role="alert"
        className="rounded-md border border-bad/30 bg-bad-dim px-3 py-2 text-sm text-bad"
      >
        {error.status === 403
          ? error.message
          : "Some fields need attention — see below."}
      </p>
    );
  }

  return (
    <p
      role="alert"
      className="rounded-md border border-bad/30 bg-bad-dim px-3 py-2 text-sm text-bad"
    >
      {error.message}
    </p>
  );
}

/** The unit dropdown, shared because both forms need the same scoped list. */
export function UnitOptions({
  units,
}: {
  units: { id: number; designation: string; depth: number }[];
}) {
  return (
    <>
      {units.map((unit) => (
        <option key={unit.id} value={unit.id}>
          {/* Figure-space indent: an ordinary space collapses in a native
              option on some platforms, which flattens the hierarchy. */}
          {" ".repeat(unit.depth * 2)}
          {unit.designation}
        </option>
      ))}
    </>
  );
}
