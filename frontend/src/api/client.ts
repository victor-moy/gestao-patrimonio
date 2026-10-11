const API_URL = import.meta.env.VITE_API_URL ?? '/api';

// Só para arquivos públicos (imagens do catálogo de tipos). Anexos e laudos
// exigem autenticação: use baixarArquivoProtegido.
export function urlArquivo(caminho: string) {
  return `${API_URL}${caminho}`;
}

// Contagem de requisições em andamento: alimenta a barra de carregamento global
let pendentes = 0;
const ouvintes = new Set<() => void>();
function mudarPendentes(delta: number) {
  pendentes += delta;
  ouvintes.forEach((avisar) => avisar());
}
export function assinarRequisicoes(avisar: () => void) {
  ouvintes.add(avisar);
  return () => {
    ouvintes.delete(avisar);
  };
}
export const requisicoesPendentes = () => pendentes;

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

// Guarda o token do usuário "mestre" enquanto ele está impersonando outra
// conta, pra dar pra voltar depois sem precisar logar de novo.
export function setTokenMestre(tokenMestre: string) {
  storage()?.setItem('sgp_token_mestre', tokenMestre);
}

export function getTokenMestre() {
  return storage()?.getItem('sgp_token_mestre') ?? null;
}

export function limparTokenMestre() {
  storage()?.removeItem('sgp_token_mestre');
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
  mudarPendentes(1);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } finally {
    mudarPendentes(-1);
  }
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
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// Baixa um arquivo protegido (anexo/laudo) com o token da sessão e devolve uma
// URL temporária do navegador, já que <a href> e <img src> não enviam o Authorization.
export async function baixarArquivoProtegido(caminho: string): Promise<string> {
  const tokenAtual = getToken();
  const res = await fetch(`${API_URL}${caminho}`, {
    headers: tokenAtual ? { Authorization: `Bearer ${tokenAtual}` } : {},
  });
  if (res.status === 401 && onUnauthorized) onUnauthorized();
  if (!res.ok) {
    throw new ApiError(res.status === 403 ? 'Você não tem acesso a este arquivo.' : 'Não foi possível abrir o arquivo.', res.status);
  }
  return URL.createObjectURL(await res.blob());
}
