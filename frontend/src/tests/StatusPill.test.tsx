import { render, screen } from '@testing-library/react';
import { corDoStatus, StatusPill } from '../components/StatusPill';
import { ROTULO_STATUS_EQUIPAMENTO, ROTULO_STATUS_MANUTENCAO, ROTULO_STATUS_SOLICITACAO } from '../utils/format';

describe('Cores de status', () => {
  it('segue a regra: verde concluído, azul em andamento, amarelo ação pendente, vermelho problema, cinza encerrado', () => {
    expect(corDoStatus('CONCLUIDA')).toBe('green');
    expect(corDoStatus('ATIVO')).toBe('green');
    expect(corDoStatus('BOM')).toBe('green');
    expect(corDoStatus('EM_EXECUCAO')).toBe('blue');
    expect(corDoStatus('AGUARDANDO_ORCAMENTO')).toBe('blue');
    expect(corDoStatus('EMPRESTADO')).toBe('blue');
    expect(corDoStatus('PENDENTE_APROVACAO')).toBe('yellow');
    expect(corDoStatus('AGUARDANDO_SAIDA')).toBe('yellow');
    expect(corDoStatus('ORCAMENTO_REGISTRADO')).toBe('yellow');
    expect(corDoStatus('EM_MANUTENCAO')).toBe('yellow');
    expect(corDoStatus('REGULAR')).toBe('yellow');
    expect(corDoStatus('NEGADA')).toBe('red');
    expect(corDoStatus('VENCIDA')).toBe('red');
    expect(corDoStatus('ESGOTADO')).toBe('red');
    expect(corDoStatus('ATRASADO')).toBe('red');
    expect(corDoStatus('BAIXADO')).toBe('gray');
    expect(corDoStatus('EXPIRADA')).toBe('gray');
    expect(corDoStatus('INATIVO')).toBe('gray');
  });

  it('valor desconhecido cai em cinza e roxo nunca é cor de status', () => {
    expect(corDoStatus('QUALQUER_COISA')).toBe('gray');
    const todos = [
      ...Object.keys(ROTULO_STATUS_EQUIPAMENTO),
      ...Object.keys(ROTULO_STATUS_MANUTENCAO),
      ...Object.keys(ROTULO_STATUS_SOLICITACAO),
    ];
    for (const valor of todos) expect(['green', 'blue', 'yellow', 'red', 'gray']).toContain(corDoStatus(valor));
  });

  it('todo status de equipamento, manutenção e solicitação tem cor explícita (nenhum cai no cinza por acidente)', () => {
    const cinzasEsperados = new Set(['BAIXADO', 'CEDIDO', 'EXPIRADA']);
    const todos = [
      ...Object.keys(ROTULO_STATUS_EQUIPAMENTO),
      ...Object.keys(ROTULO_STATUS_MANUTENCAO),
      ...Object.keys(ROTULO_STATUS_SOLICITACAO),
    ];
    for (const valor of todos) {
      if (corDoStatus(valor) === 'gray') expect(cinzasEsperados.has(valor)).toBe(true);
    }
  });

  it('StatusPill mostra o texto com a classe do tom', () => {
    render(<StatusPill valor="NEGADA">Negada</StatusPill>);
    expect(screen.getByText('Negada')).toHaveClass('inventario-status--tom-red');
  });
});
