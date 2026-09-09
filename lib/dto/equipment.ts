import type {
  Equipment,
  EquipmentCategory,
  EquipmentStatus,
  MaintenanceLog,
  Rank,
} from "@prisma/client";

import { can, type Role } from "@/lib/auth/policy";
import {
  hidden,
  iso,
  maskServiceId,
  PII_REASON,
  visible,
  type Field,
} from "@/lib/dto/mask";

/**
 * Serialization boundary for equipment.
 *
 * Equipment holds no PII of its own — a rifle has a serial number, not a
 * private life. The interesting part is the ASSIGNEE: an item issued to a
 * soldier drags that soldier's identity into a response the quartermaster is
 * entitled to see. So the assignee block goes through exactly the same PII
 * rules as the personnel DTO, from the same functions in mask.ts.
 *
 * The failure this prevents is specific and easy to write: joining `assignedTo`
 * into an equipment query and spreading the row into the response, which hands
 * a quartermaster every service number in the brigade through a door marked
 * "logistics".
 */

export type AssigneeDTO = {
  id: string;
  lastName: string;
  firstName: string;
  rank: Rank;
  serviceId: Field<string>;
};

export type MaintenanceLogDTO = {
  id: string;
  openedAt: string;
  closedAt: string | null;
  status: EquipmentStatus;
  summary: string;
  technician: string;
  laborHours: number | null;
};

export type EquipmentDTO = {
  id: string;
  serialNumber: string;
  nsn: string;
  name: string;
  category: EquipmentCategory;
  status: EquipmentStatus;
  unitId: number;
  unitDesignation: string | null;
  assignedTo: AssigneeDTO | null;
  acquiredAt: string;
  lastServicedAt: string | null;
  nextServiceDueAt: string | null;
  /** True when the service date has passed. Computed here so every surface agrees. */
  serviceOverdue: boolean;
  maintenanceLogs?: MaintenanceLogDTO[];
};

export type EquipmentRow = Equipment & {
  unit?: { id: number; designation: string; path: string } | null;
  assignedTo?: {
    id: string;
    lastName: string;
    firstName: string;
    rank: Rank;
    serviceId: string;
  } | null;
  maintenanceLogs?: MaintenanceLog[];
};

function toAssigneeDTO(
  row: NonNullable<EquipmentRow["assignedTo"]>,
  role: Role,
): AssigneeDTO {
  const seePii = can(role, "personnel.pii", "read");
  return {
    id: row.id,
    lastName: row.lastName,
    firstName: row.firstName,
    rank: row.rank,
    serviceId: seePii
      ? visible(row.serviceId)
      : hidden(maskServiceId(row.serviceId), PII_REASON),
  };
}

function toMaintenanceLogDTO(log: MaintenanceLog): MaintenanceLogDTO {
  return {
    id: log.id,
    openedAt: log.openedAt.toISOString(),
    closedAt: iso(log.closedAt),
    status: log.status,
    summary: log.summary,
    technician: log.technician,
    laborHours: log.laborHours,
  };
}

export function toEquipmentDTO(
  row: EquipmentRow,
  role: Role,
  /** Fixed "now" so a list and its rollup cannot disagree mid-request. */
  now: Date = new Date(),
): EquipmentDTO {
  return {
    id: row.id,
    serialNumber: row.serialNumber,
    nsn: row.nsn,
    name: row.name,
    category: row.category,
    status: row.status,

    unitId: row.unitId,
    unitDesignation: row.unit?.designation ?? null,

    // Null both when nothing is issued and when the row was not joined. The
    // caller decides which query to run; this never invents an assignee.
    assignedTo: row.assignedTo ? toAssigneeDTO(row.assignedTo, role) : null,

    acquiredAt: row.acquiredAt.toISOString(),
    lastServicedAt: iso(row.lastServicedAt),
    nextServiceDueAt: iso(row.nextServiceDueAt),
    serviceOverdue:
      row.nextServiceDueAt !== null && row.nextServiceDueAt < now,

    maintenanceLogs: row.maintenanceLogs?.map(toMaintenanceLogDTO),
  };
}
