const API_URL = import.meta.env.VITE_API_URL ?? '/api';

const storage = () => globalThis.localStorage as Storage | undefined;

let token: string | null = storage()?.getItem('sgp_token') ?? null;
let onUnauthorized: (() => void) | null = null;

export function setToken(novoToken: string | null) {
  token = novoToken;
  if (novoToken) storage()?.setItem('sgp_token', novoToken);
  else storage()?.removeItem('sgp_token');
}

export function getToken() {
  token = token ?? storage()?.getItem('sgp_token') ?? null;
  return token;
}

export function setOnUnauthorized(handler: () => void) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const tokenAtual = getToken();
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...(tokenAtual ? { Authorization: `Bearer ${tokenAtual}` } : {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401 && onUnauthorized) {
    onUnauthorized();
  }
  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(body?.mensagem ?? 'Erro ao comunicar com o servidor.', res.status);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
