/**
 * The masking primitives, shared by every DTO.
 *
 * They live here rather than in personnel.ts because equipment shows who an
 * item is issued to, and that assignee is a person: two implementations of
 * "how do we redact a service number" would eventually disagree, and the one
 * that drifts is the one nobody is looking at.
 *
 * A masked field is never absent. It carries a placeholder plus `masked: true`
 * and a reason, so the UI can say "withheld, and here is why" instead of
 * rendering an empty cell that claims the data does not exist.
 */

export type Field<T> =
  | { masked: false; value: T }
  | { masked: true; value: string; reason: string };

export const PII_REASON =
  "Personally identifiable information is visible to Commanders and Medical Officers only.";

export const MEDICAL_REASON =
  "Medical readiness detail is visible to Commanders and Medical Officers only.";

/** Full redaction, for anything whose shape alone would be a hint. */
export const REDACTED = "•••";

/**
 * Service numbers keep their last four digits.
 *
 * A deliberate, narrow disclosure rather than an oversight: a quartermaster
 * signing a rifle out has to tell two soldiers apart on a form. Four digits do
 * that without handing over an identifier that indexes other systems. Every
 * other PII field is redacted whole.
 */
export function maskServiceId(serviceId: string): string {
  return `•••••${serviceId.slice(-4)}`;
}

export function visible<T>(value: T): Field<T> {
  return { masked: false, value };
}

export function hidden(value: string, reason: string): Field<never> {
  return { masked: true, value, reason };
}

export function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}
