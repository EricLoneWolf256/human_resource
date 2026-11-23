import type { ApiErrorBody } from '@umu-hr/shared';

export class ClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = 'ClientError';
    this.status = status;
    this.code = body.error.code;
  }
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      error: { code: 'NETWORK_ERROR', message: `Request failed (${response.status})` },
    }))) as ApiErrorBody;
    throw new ClientError(response.status, body);
  }

  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  return (contentType.includes('json') ? await response.json() : await response.text()) as T;
}
