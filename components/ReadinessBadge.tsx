import type { EquipmentStatus, ReadinessStatus } from "@prisma/client";

import { cn } from "cn";

/**
 * The only place colour is used for anything but status.
 *
 * Colour is never the sole carrier of meaning — every badge also spells the
 * status out, so the roster reads correctly in greyscale, to a colour-blind
 * viewer, and on a printed muster sheet.
 */

const READINESS: Record<ReadinessStatus, { label: string; tone: Tone }> = {
  DEPLOYABLE: { label: "Deployable", tone: "ok" },
  LIMITED_DUTY: { label: "Limited duty", tone: "warn" },
  NON_DEPLOYABLE: { label: "Non-deployable", tone: "bad" },
};

const EQUIPMENT: Record<EquipmentStatus, { label: string; tone: Tone }> = {
  OPERATIONAL: { label: "Operational", tone: "ok" },
  IN_MAINTENANCE: { label: "In maintenance", tone: "warn" },
  DEADLINE: { label: "Deadlined", tone: "bad" },
};

type Tone = "ok" | "warn" | "bad";

const TONES: Record<Tone, string> = {
  ok: "text-ok bg-ok-dim border-ok/25",
  warn: "text-warn bg-warn-dim border-warn/25",
  bad: "text-bad bg-bad-dim border-bad/25",
};

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

export function ReadinessBadge({ status }: { status: ReadinessStatus }) {
  return <StatusPill {...READINESS[status]} />;
}

export function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  return <StatusPill {...EQUIPMENT[status]} />;
}
