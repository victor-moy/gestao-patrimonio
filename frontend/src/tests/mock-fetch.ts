import { vi } from 'vitest';

type Resposta = { status?: number; body: unknown };

export function mockFetch(rotas: Record<string, Resposta | ((init?: RequestInit) => Resposta)>) {
  const chamadas: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      const chave = Object.keys(rotas).find((r) => url.includes(r));
      const def = chave ? rotas[chave] : undefined;
      const resposta = typeof def === 'function' ? def(init) : def;
      const status = resposta?.status ?? (resposta ? 200 : 404);
      const body = resposta?.body ?? { mensagem: 'Não encontrado' };
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => body,
      } as Response;
    }),
  );
  return chamadas;
}
