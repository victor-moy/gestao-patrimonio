import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InventarioPainel, type ResumoInventario } from '../pages/InventarioPainel';
import { mockFetch } from './mock-fetch';
const filtros = { busca: '', unidadeId: '', categoriaId: '', tipoEquipamentoId: '', status: '' };
const resumo: ResumoInventario = { total: 26, ativos: 24, emManutencao: 2, unidades: 1, categorias: 1, familias: 1, porUnidade: [{ id: 'u', nome: 'UBSF Centro', quantidade: 26 }], porCategoria: [{ id: 'c', nome: 'Climatização', quantidade: 26 }], porFamilia: [{ id: 't', nome: 'Ar-condicionado', quantidade: 26 }], atualizadoEm: '2026-11-17T13:00:00Z' };
describe('Painel gerencial do inventário', () => {
  it('consulta critérios combinados, mostra total completo e permite filtrar pelos grupos', async () => {
    const chamadas = mockFetch({ '/equipamentos/painel': { body: resumo } });
    const selecionar = vi.fn();
    render(<InventarioPainel filtros={{ ...filtros, unidadeId: 'u', categoriaId: 'c', tipoEquipamentoId: 't', busca: 'Ar' }} selecionar={selecionar} />);
    await screen.findByText('itens correspondem à seleção atual.', { exact: false });
    expect(chamadas[0].url).toContain('busca=Ar&unidadeId=u&categoriaId=c&tipoEquipamentoId=t');
    await userEvent.click(within(screen.getByRole('region', { name: 'Itens por categoria' })).getByRole('button'));
    expect(selecionar).toHaveBeenCalledWith('categoriaId', 'c');
    expect(screen.getByText('24 ativos · 2 em manutenção')).toBeInTheDocument();
  });
  it('distingue falha de carregamento de resultado vazio e permite tentar outra vez', async () => {
    let falhar = true;
    mockFetch({ '/equipamentos/painel': () => falhar ? { status: 500, body: { mensagem: 'Falha temporária' } } : { body: { ...resumo, total: 0, porUnidade: [], porCategoria: [], porFamilia: [] } } });
    render(<InventarioPainel filtros={filtros} selecionar={() => undefined} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária');
    falhar = false; await userEvent.click(screen.getByRole('button', { name: 'Atualizar painel' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findAllByText('Nenhum item nesta seleção.')).toHaveLength(3);
  });
});

it('combina os filtros visíveis da página e limpa a família ao trocar de categoria', async () => {
  const { App } = await import('../App');
  localStorage.setItem('sgp_token', 'token-teste');
  window.history.replaceState(null, '', '/inventario');
  const chamadas = mockFetch({
    '/auth/me': { body: { id: 'usuario', nome: 'Operador', perfil: 'OPERADOR', unidadeId: null } },
    '/equipamentos/painel': { body: resumo },
    '/equipamentos': { body: [] },
    '/unidades': { body: [{ id: 'u', nome: 'UBSF Centro' }] },
    '/categorias': { body: [{ id: 'c', nome: 'Climatização', tipos: [{ id: 't', nome: 'Ar-condicionado', categoriaId: 'c' }] }] },
  });
  render(<App />);
  await screen.findByRole('option', { name: 'Climatização' });
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por unidade' }), 'u');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por categoria' }), 'c');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por família' }), 't');
  await userEvent.type(screen.getByRole('textbox', { name: 'Buscar equipamentos' }), 'Ar');
  await waitFor(() => expect(chamadas.some(c => c.url.includes('/equipamentos/painel?busca=Ar&unidadeId=u&categoriaId=c&tipoEquipamentoId=t'))).toBe(true));
  expect(chamadas.some(c => c.url.endsWith('/equipamentos?busca=Ar&unidadeId=u&categoriaId=c&tipoEquipamentoId=t'))).toBe(true);
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por categoria' }), '');
  expect(screen.getByRole('combobox', { name: 'Filtrar por família' })).toHaveValue('');
});
