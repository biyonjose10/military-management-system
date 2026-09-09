import type { AuditAction, AuditLog, Role } from "@prisma/client";

/**
 * Audit entries need no masking, and that is a property of how they are
 * written rather than an exemption granted here.
 *
 * `changedFields` holds field NAMES only — never values — so an entry cannot
 * carry a medical note or a service number no matter who reads it. That is the
 * design decision in lib/audit/log.ts, and it is what makes this DTO a plain
 * shape conversion instead of another masking layer.
 *
 * The one thing that IS withheld is the client IP, unless the viewer is a
 * Commander. It identifies a person's location and is the only field here with
 * that property; the role check gates it rather than the field being dropped
 * for everyone, because tracing an action to a machine is the entire point of
 * recording it.
 */

export type AuditEntryDTO = {
  id: string;
  at: string;
  actorEmail: string;
  actorRole: Role;
  actorUnitPath: string;
  action: AuditAction;
  resource: string;
  targetId: string;
  targetLabel: string;
  changedFields: string[];
  ip: string | null;
};

export function toAuditEntryDTO(row: AuditLog, role: Role): AuditEntryDTO {
  return {
    id: row.id,
    at: row.at.toISOString(),
    actorEmail: row.actorEmail,
    actorRole: row.actorRole,
    actorUnitPath: row.actorUnitPath,
    action: row.action,
    resource: row.resource,
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    changedFields: row.changedFields,
    ip: role === "COMMANDER" ? row.ip : null,
  };
}
