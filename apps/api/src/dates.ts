export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: Date, days: number): Date {
  const copy = new Date(value.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function isCurrent(
  assignment: { startDate: Date; endDate: Date | null },
  at: Date = today(),
): boolean {
  return assignment.startDate <= at && (assignment.endDate === null || assignment.endDate >= at);
}

export function endOfDay(value: Date): Date {
  return new Date(value.getTime() + 24 * 60 * 60 * 1000 - 1);
}
