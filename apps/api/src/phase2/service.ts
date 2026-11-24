import type { Request } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { employeeWhere, canAccessEmployee } from '../access/policy.js';
import { notFound, forbidden } from '../errors.js';
import { findEmployeeOrThrow, currentUnitIds } from '../employees/service.js';

type Phase2Db = PrismaClient | Prisma.TransactionClient;

export function metadata(req: Request) {
  return {
    ipAddress: req.ip ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

export function requireOwnEmployee(req: Request): string {
  if (!req.auth?.employeeId) throw notFound('No employee profile is linked to this account');
  return req.auth.employeeId;
}

export async function requireEmployeeInScope(req: Request, id: string, permission: string) {
  const employee = await findEmployeeOrThrow(id);
  if (!canAccessEmployee(req.auth!, { id: employee.id, currentUnitIds: currentUnitIds(employee) }, permission)) {
    throw forbidden('This employee record is outside your access scope');
  }
  return employee;
}

export function accessibleEmployeeWhere(req: Request, permission: string): Prisma.EmployeeWhereInput {
  return employeeWhere(req.auth!, permission);
}

export function periodForDate(value: Date): string {
  return value.toISOString().slice(0, 7);
}

export function businessDaysBetween(start: Date, end: Date): number {
  let days = 0;
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function employeeName(employee: { firstName: string; lastName: string; preferredName?: string | null }): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

export function nextRequestReference(): string {
  return `HR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function userDisplayName(db: Phase2Db, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, employee: { select: { firstName: true, lastName: true } } },
  });
  if (!user) return null;
  if (user.employee) return employeeName(user.employee);
  return user.email;
}
