import { describe, expect, it } from 'vitest';
import { chaveDeFila, compararFila, descreverSla } from '../utils/prazo';
import type { Manutencao } from '../types';

const chamado = (extra: Partial<Manutencao>) =>
  chaveDeFila({ status: 'AGUARDANDO_EXECUCAO', criadoEm: '2026-11-01T10:00:00Z', categoriaCivil: { id: 'c', nome: 'x', gravidade: 0 }, prioridade: 'MEDIA', sla: null, ...extra } as Manutencao);

describe('descreverSla', () => {
  it('não mostra nada sem SLA (equipamento ou chamado sem prioridade)', () => {
    expect(descreverSla(null)).toBeNull();
    expect(descreverSla(undefined)).toBeNull();
  });

  it('descreve restante, vencido, pausado e prazo não configurado, cada um com a sua cor', () => {
    expect(descreverSla({ situacao: 'NO_PRAZO', venceEm: null, minutosRestantes: 135, pausado: false })).toEqual({ texto: 'restam 2h 15min', valor: 'SLA_NO_PRAZO' });
    expect(descreverSla({ situacao: 'VENCIDO', venceEm: null, minutosRestantes: -90, pausado: false })).toEqual({ texto: 'Vencido há 1h 30min', valor: 'SLA_VENCIDO' });
    expect(descreverSla({ situacao: 'NO_PRAZO', venceEm: null, minutosRestantes: 30, pausado: true })?.valor).toBe('SLA_ATENCAO');
    expect(descreverSla({ situacao: 'NAO_CONFIGURADO', venceEm: null, minutosRestantes: null, pausado: false })).toEqual({ texto: 'Prazo não configurado', valor: 'SLA_ATENCAO' });
    expect(descreverSla({ situacao: 'NO_PRAZO', venceEm: null, minutosRestantes: 3000, pausado: false })?.texto).toBe('restam 2d 2h');
  });
});

describe('compararFila', () => {
  it('abertos antes dos encerrados, maior gravidade, prazo vencido, prioridade e mais antigo', () => {
    const fila = [
      { id: 'encerrado', k: chamado({ status: 'CONCLUIDA', categoriaCivil: { id: 'c', nome: 'x', gravidade: 3 } }) },
      { id: 'novo', k: chamado({ criadoEm: '2026-11-20T10:00:00Z' }) },
      { id: 'antigo', k: chamado({ criadoEm: '2026-10-01T10:00:00Z' }) },
      { id: 'vencido', k: chamado({ sla: { situacao: 'VENCIDO', venceEm: null, minutosRestantes: -5, pausado: false } }) },
      { id: 'grave', k: chamado({ categoriaCivil: { id: 'c', nome: 'x', gravidade: 2 }, prioridade: 'BAIXA' }) },
    ];
    expect(fila.sort((a, b) => compararFila(a.k, b.k)).map((x) => x.id)).toEqual(['grave', 'vencido', 'antigo', 'novo', 'encerrado']);
  });
});
