import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';

type AuditDb = PrismaClient | Prisma.TransactionClient;

export interface AuditInput {
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  reason?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(input: AuditInput, db: AuditDb = prisma): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorUserId: input.actorId ?? null,
      actorLabel: input.actorLabel ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      reason: input.reason ?? null,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export function auditFields<T extends object>(source: T, fields: readonly string[]): Prisma.JsonObject {
  const result: Prisma.JsonObject = {};
  const record = source as Record<string, unknown>;
  for (const field of fields) {
    const value = record[field];
    if (value === undefined) continue;
    result[field] = (value instanceof Date ? value.toISOString() : value) as Prisma.JsonValue;
  }
  return result;
}
