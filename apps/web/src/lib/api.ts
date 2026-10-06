/**
 * Cliente HTTP. El token de acceso vive solo en memoria; el refresh token va en una
 * cookie httpOnly que el navegador envía automáticamente a /api/auth.
 */
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

/** Pide un nuevo token de acceso. Varias llamadas simultáneas comparten la misma petición. */
export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as { accessToken: string };
      return body.accessToken;
    })
    .catch(() => null)
    .then((token) => {
      accessToken = token;
      refreshing = null;
      return token;
    });
  return refreshing;
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `Error ${res.status}`;
  let details: unknown;
  try {
    details = await res.json();
    const m = (details as { message?: string | string[] }).message;
    if (m) message = Array.isArray(m) ? m.join('. ') : m;
  } catch {
    /* respuesta sin JSON */
  }
  return new ApiError(res.status, message, details);
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const doFetch = () => {
    const headers = new Headers(rest.headers);
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    if (json !== undefined) headers.set('Content-Type', 'application/json');
    return fetch(`/api${path}`, {
      ...rest,
      headers,
      credentials: 'same-origin',
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const token = await refreshAccessToken();
    if (token) {
      res = await doFetch();
    } else {
      onSessionExpired?.();
    }
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
