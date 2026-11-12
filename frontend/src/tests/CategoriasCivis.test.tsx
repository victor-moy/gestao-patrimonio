import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { mockFetch } from './mock-fetch';

function entrarComo(permissoes: string[], caminho: string) {
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', caminho);
  return {
    '/auth/me': {
      body: { id: '1', nome: 'Admin', email: 'a@j.gov', matricula: '1', perfil: 'OPERADOR', permissoes, unidadeId: null, unidadeNome: null },
    },
  };
}

const hidraulica = {
  id: 'c1',
  nome: 'Hidráulica',
  ativo: true,
  ordem: 1,
  _count: { manutencoes: 3 },
  perguntas: [
    { id: 'p1', texto: 'O vazamento é contínuo?', tipo: 'OPCOES', opcoes: ['Sim', 'Não'], obrigatoria: true, ordem: 0, ativo: true },
    { id: 'p2', texto: 'Pergunta antiga', tipo: 'TEXTO', opcoes: [], obrigatoria: false, ordem: 1, ativo: false },
  ],
};
const eletrica = { id: 'c2', nome: 'Elétrica', ativo: false, ordem: 2, _count: { manutencoes: 0 }, perguntas: [] };

afterEach(() => localStorage.clear());

describe('Configurações › tipos de problema do chamado civil', () => {
  it('lista os tipos com o número de perguntas ativas e de chamados', async () => {
    mockFetch({ ...entrarComo(['CONFIGURACOES_GERENCIAR'], '/configuracoes/chamados/tipos-civis'), '/categorias-civis': { body: [hidraulica, eletrica] } });
    render(<App />);

    const link = await screen.findByRole('link', { name: 'Editar tipo Hidráulica' });
    const linha = link.closest('tr') as HTMLElement;
    // só a pergunta ativa conta
    expect(within(linha).getAllByRole('cell').map((c) => c.textContent)).toEqual(expect.arrayContaining(['1', '3']));
  });

  it('quem não tem CONFIGURACOES_GERENCIAR não acessa a página', async () => {
    mockFetch({ ...entrarComo(['MANUTENCAO_ESCREVER'], '/configuracoes/chamados/tipos-civis'), '/categorias-civis': { body: [hidraulica] } });
    render(<App />);

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Editar tipo Hidráulica' })).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Novo tipo' })).not.toBeInTheDocument();
  });

  it('cadastra um tipo com pergunta de opções e pergunta de texto corrido', async () => {
    const chamadas = mockFetch({
      ...entrarComo(['CONFIGURACOES_GERENCIAR'], '/configuracoes/chamados/tipos-civis/nova'),
      '/categorias-civis': (init) => (init?.method === 'POST' ? { status: 201, body: hidraulica } : { body: [] }),
    });
    render(<App />);

    const salvar = await screen.findByRole('button', { name: /Salvar|Cadastrar|Criar/ });
    expect(salvar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nome *'), 'Hidráulica');
    expect(salvar).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: '+ Adicionar pergunta' }));
    // pergunta de opções sem as duas opções mínimas bloqueia o salvar
    expect(salvar).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Pergunta *'), 'O vazamento é contínuo?');
    await userEvent.type(screen.getByLabelText(/Opções/), 'Sim{enter}Não');
    expect(salvar).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: '+ Adicionar pergunta' }));
    const grupo2 = screen.getByRole('group', { name: 'Pergunta 2' });
    await userEvent.type(within(grupo2).getByLabelText('Pergunta *'), 'Observação sobre o local');
    await userEvent.selectOptions(within(grupo2).getByLabelText('Tipo de resposta'), 'TEXTO');
    // texto corrido não tem lista de opções
    expect(within(grupo2).queryByLabelText(/Opções/)).not.toBeInTheDocument();
    await userEvent.click(within(grupo2).getByLabelText('Resposta obrigatória'));

    await userEvent.click(salvar);

    await waitFor(() => expect(chamadas.some((c) => c.init?.method === 'POST')).toBe(true));
    expect(JSON.parse(String(chamadas.find((c) => c.init?.method === 'POST')!.init!.body))).toEqual({
      nome: 'Hidráulica',
      ativo: true,
      perguntas: [
        { texto: 'O vazamento é contínuo?', tipo: 'OPCOES', opcoes: ['Sim', 'Não'], obrigatoria: true },
        { texto: 'Observação sobre o local', tipo: 'TEXTO', opcoes: [], obrigatoria: false },
      ],
    });
  });

  it('edita: mostra só as perguntas ativas, mantém o id ao salvar e permite reordenar', async () => {
    const chamadas = mockFetch({
      ...entrarComo(['CONFIGURACOES_GERENCIAR'], '/configuracoes/chamados/tipos-civis/c1'),
      '/categorias-civis': (init) => (init?.method === 'PATCH' ? { body: hidraulica } : { body: [hidraulica, eletrica] }),
    });
    render(<App />);

    expect(await screen.findByDisplayValue('O vazamento é contínuo?')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Pergunta antiga')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Resposta obrigatória'));
    await userEvent.click(screen.getByRole('button', { name: /Salvar|Atualizar/ }));

    await waitFor(() => expect(chamadas.some((c) => c.init?.method === 'PATCH')).toBe(true));
    expect(JSON.parse(String(chamadas.find((c) => c.init?.method === 'PATCH')!.init!.body)).perguntas).toEqual([
      { id: 'p1', texto: 'O vazamento é contínuo?', tipo: 'OPCOES', opcoes: ['Sim', 'Não'], obrigatoria: false },
    ]);
  });
});
