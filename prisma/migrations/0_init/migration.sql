-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('COMMANDER', 'MEDICAL_OFFICER', 'QUARTERMASTER', 'SQUAD_LEADER');

-- CreateEnum
CREATE TYPE "Echelon" AS ENUM ('BRIGADE', 'BATTALION', 'COMPANY', 'PLATOON', 'SQUAD');

-- CreateEnum
CREATE TYPE "RankCategory" AS ENUM ('OFFICER', 'WARRANT', 'ENLISTED');

-- CreateEnum
CREATE TYPE "Rank" AS ENUM ('PRIVATE', 'PRIVATE_FIRST_CLASS', 'SPECIALIST', 'CORPORAL', 'SERGEANT', 'STAFF_SERGEANT', 'SERGEANT_FIRST_CLASS', 'MASTER_SERGEANT', 'FIRST_SERGEANT', 'SERGEANT_MAJOR', 'WARRANT_OFFICER_1', 'CHIEF_WARRANT_OFFICER_2', 'CHIEF_WARRANT_OFFICER_3', 'CHIEF_WARRANT_OFFICER_4', 'CHIEF_WARRANT_OFFICER_5', 'SECOND_LIEUTENANT', 'FIRST_LIEUTENANT', 'CAPTAIN', 'MAJOR', 'LIEUTENANT_COLONEL', 'COLONEL');

-- CreateEnum
CREATE TYPE "ReadinessStatus" AS ENUM ('DEPLOYABLE', 'LIMITED_DUTY', 'NON_DEPLOYABLE');

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('WEAPON', 'VEHICLE', 'COMMS', 'RATIONS');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('OPERATIONAL', 'IN_MAINTENANCE', 'DEADLINE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'PERMISSION_DENIED');

-- CreateTable
CREATE TABLE "Unit" (
    "id" SERIAL NOT NULL,
    "designation" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "echelon" "Echelon" NOT NULL,
    "parentId" INTEGER,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "unitId" INTEGER NOT NULL,
    "unitPath" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Personnel" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "rank" "Rank" NOT NULL,
    "rankCategory" "RankCategory" NOT NULL,
    "unitId" INTEGER NOT NULL,
    "readiness" "ReadinessStatus" NOT NULL DEFAULT 'DEPLOYABLE',
    "medicalNotes" TEXT,
    "medicalClearedUntil" TIMESTAMP(3),
    "lastPhysicalAt" TIMESTAMP(3),
    "phone" TEXT,
    "email" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "enlistedAt" TIMESTAMP(3) NOT NULL,
    "deployedUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "nsn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EquipmentCategory" NOT NULL,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "unitId" INTEGER NOT NULL,
    "assignedToId" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL,
    "lastServicedAt" TIMESTAMP(3),
    "nextServiceDueAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "status" "EquipmentStatus" NOT NULL,
    "summary" TEXT NOT NULL,
    "technician" TEXT NOT NULL,
    "laborHours" DOUBLE PRECISION,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL,
    "actorRole" "Role" NOT NULL,
    "actorUnitPath" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "changedFields" TEXT[],
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Unit_designation_key" ON "Unit"("designation");

-- CreateIndex
CREATE INDEX "Unit_path_idx" ON "Unit"("path");

-- CreateIndex
CREATE INDEX "Unit_parentId_idx" ON "Unit"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_unitId_idx" ON "User"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Personnel_serviceId_key" ON "Personnel"("serviceId");

-- CreateIndex
CREATE INDEX "Personnel_unitId_idx" ON "Personnel"("unitId");

-- CreateIndex
CREATE INDEX "Personnel_readiness_idx" ON "Personnel"("readiness");

-- CreateIndex
CREATE INDEX "Personnel_deletedAt_idx" ON "Personnel"("deletedAt");

-- CreateIndex
CREATE INDEX "Personnel_lastName_firstName_idx" ON "Personnel"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_serialNumber_key" ON "Equipment"("serialNumber");

-- CreateIndex
CREATE INDEX "Equipment_unitId_idx" ON "Equipment"("unitId");

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");

-- CreateIndex
CREATE INDEX "Equipment_category_idx" ON "Equipment"("category");

-- CreateIndex
CREATE INDEX "Equipment_assignedToId_idx" ON "Equipment"("assignedToId");

-- CreateIndex
CREATE INDEX "Equipment_deletedAt_idx" ON "Equipment"("deletedAt");

-- CreateIndex
CREATE INDEX "MaintenanceLog_equipmentId_idx" ON "MaintenanceLog"("equipmentId");

-- CreateIndex
CREATE INDEX "MaintenanceLog_openedAt_idx" ON "MaintenanceLog"("openedAt");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_resource_targetId_idx" ON "AuditLog"("resource", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUnitPath_idx" ON "AuditLog"("actorUnitPath");

-- CreateIndex
CREATE INDEX "AuditLog_actorEmail_idx" ON "AuditLog"("actorEmail");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Personnel" ADD CONSTRAINT "Personnel_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Personnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

