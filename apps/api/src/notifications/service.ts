import type { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { today } from '../dates.js';
import { buildAccessContext, canAccessEmployee } from '../access/policy.js';
import type { NotificationPriority } from '@umu-hr/shared';

type NotifyDb = PrismaClient | Prisma.TransactionClient;

interface NotifyInput {
  eventType: string;
  title: string;
  safeSummary: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  priority?: NotificationPriority;
}

export async function notifyUsers(
  db: NotifyDb,
  userIds: string[],
  input: NotifyInput,
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  await db.notification.createMany({
    data: unique.map((userId) => ({
      recipientUserId: userId,
      eventType: input.eventType,
      title: input.title,
      safeSummary: input.safeSummary,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      priority: input.priority ?? 'NORMAL',
    })),
  });
}

export async function notifyPermissionHolders(
  db: NotifyDb,
  input: NotifyInput & {
    permission: string;
    employeeId: string;
    employeeUnitIds: string[];
    excludeUserId?: string;
  },
): Promise<void> {
  const assignments = await db.roleAssignment.findMany({
    where: {
      revokedAt: null,
      role: { permissions: { some: { permissionKey: input.permission } } },
      startDate: { lte: today() },
      OR: [{ endDate: null }, { endDate: { gte: today() } }],
    },
    select: { userId: true },
  });

  const recipients: string[] = [];
  for (const userId of new Set(assignments.map((row) => row.userId))) {
    if (userId === input.excludeUserId) continue;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
        mustChangePassword: true,
        mfaEnabled: true,
        employeeId: true,
        lastLoginAt: true,
        employee: { select: { id: true, staffNumber: true, firstName: true, lastName: true, preferredName: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') continue;
    const ctx = await buildAccessContext(prisma, user, '', null, null);
    if (canAccessEmployee(ctx, { id: input.employeeId, currentUnitIds: input.employeeUnitIds }, input.permission)) {
      recipients.push(userId);
    }
  }

  await notifyUsers(db, recipients, input);
}
