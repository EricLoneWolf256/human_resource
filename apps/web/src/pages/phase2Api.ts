import type { Paginated } from '@umu-hr/shared';
import { api, ClientError } from '../api';

const TOKEN_KEYS = [
  'accessToken',
  'access_token',
  'token',
  'hr_access_token',
  'umu_hr_access_token',
  'umu-hr-access-token',
];

function readAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of TOKEN_KEYS) {
        const value = storage.getItem(key);
        if (value?.trim()) return value.trim();
      }
    }
    for (const cookie of document.cookie.split(';')) {
      const [name, ...rest] = cookie.trim().split('=');
      if (name && TOKEN_KEYS.includes(name)) {
        const value = decodeURIComponent(rest.join('='));
        if (value.trim()) return value.trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function pageApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = readAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return api<T>(path, { ...init, headers });
}

export function listItems<T>(data: Paginated<T> | T[] | undefined): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.items;
}

export function listTotal<T>(data: Paginated<T> | T[] | undefined): number {
  if (!data) return 0;
  return Array.isArray(data) ? data.length : data.total;
}

export function pageErrorMessage(error: unknown): string {
  if (error instanceof ClientError && error.status === 403) {
    return 'You do not have permission to view this section. Contact an administrator if you need access.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
