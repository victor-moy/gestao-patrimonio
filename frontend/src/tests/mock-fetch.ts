import { vi } from 'vitest';
import { GRUPOS_PERMISSOES } from '../utils/permissoes';

const TODAS = GRUPOS_PERMISSOES.flatMap((g) => g.permissoes.map((p) => p.id));

type Resposta = { status?: number; body: unknown };

export function mockFetch(rotas: Record<string, Resposta | ((init?: RequestInit) => Resposta)>) {
  const chamadas: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      const chave = Object.keys(rotas).find((r) => url.includes(r));
      const def = chave ? rotas[chave] : undefined;
      // Home sempre pede pendências e atualizações; testes que não exercitam isso recebem lista vazia
      const padraoHome: Resposta | undefined =
        !def && url.includes('/avisos')
          ? { body: { itens: [], total: 0 } }
          : !def && url.includes('/dashboard/alertas')
            ? { body: [] }
            : undefined;
      const resposta = typeof def === 'function' ? def(init) : (def ?? padraoHome);
      const status = resposta?.status ?? (resposta ? 200 : 404);
      let body = resposta?.body ?? { mensagem: 'Não encontrado' };
      // O operador de teste tem todas as permissões, salvo quando o teste define as dele
      if (url.includes('/auth/me') && (body as { perfil?: string }).perfil === 'OPERADOR' && !('permissoes' in (body as object))) {
        body = { ...(body as object), permissoes: TODAS };
      }
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


// Abre o menu "Ações" do detalhe e escolhe uma ação (as ações do chamado ficam todas nesse menu)
export async function acao(nome: string | RegExp) {
  const { screen } = await import('@testing-library/react');
  const userEvent = (await import('@testing-library/user-event')).default;
  await userEvent.click(await screen.findByRole('button', { name: 'Ações' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: nome }));
}
