import type { Response } from 'express';
import type { Paginated } from '@umu-hr/shared';

export function sendPaginated<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): void {
  const body: Paginated<T> = { items, page, pageSize, total };
  res.json(body);
}
