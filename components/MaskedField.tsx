import { Lock } from "lucide-react";

import type { Field } from "@/lib/dto/personnel";

/**
 * Renders a field that may or may not have been masked on the server.
 *
 * This component does no masking. It cannot: by the time a value reaches the
 * browser the decision is already made and the real value is simply not in the
 * payload. That is the point — a component that masked would still have shipped
 * the secret inside the RSC payload, one devtools tab away.
 *
 * A masked field is shown, not hidden. "•••" with a reason on hover tells the
 * viewer the data exists and they may not see it; an empty cell would say the
 * soldier has no phone number on file, which is a different and wrong claim.
 */
export function MaskedField({
  field,
  fallback = "—",
}: {
  field: Field<string | null>;
  fallback?: string;
}) {
  if (field.masked) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-mask"
        title={field.reason}
      >
        <Lock aria-hidden className="size-3" />
        <span className="font-mono">{field.value}</span>
        <span className="sr-only">Hidden. {field.reason}</span>
      </span>
    );
  }

  if (field.value === null || field.value === "") {
    return <span className="text-faint">{fallback}</span>;
  }

  return <span>{field.value}</span>;
}
