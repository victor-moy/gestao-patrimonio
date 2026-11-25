import type { Manutencao, PrioridadeManutencao, SlaChamado } from '../types';

// Prioridade, gravidade e prazo (SLA) do chamado civil. O cálculo do prazo é do backend; aqui só se escolhe o texto e a cor.

export const ROTULO_PRIORIDADE: Record<PrioridadeManutencao, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  MUITO_ALTA: 'Muito alta',
};

export const PRIORIDADES = Object.entries(ROTULO_PRIORIDADE) as Array<[PrioridadeManutencao, string]>;

// Gravidade da categoria civil: só ordena a fila
export const ROTULO_GRAVIDADE = ['Normal', 'Alta', 'Muito alta', 'Crítica'];

function duracao(minutos: number) {
  const m = Math.abs(minutos);
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${m}min`;
}

/** Texto e cor (a mesma paleta do StatusPill) do prazo do chamado; nulo quando o chamado não tem SLA (equipamento, sem prioridade). */
export function descreverSla(sla?: SlaChamado | null): { texto: string; valor: string } | null {
  if (!sla) return null;
  switch (sla.situacao) {
    case 'AGUARDANDO':
      return { texto: 'Prazo ainda não iniciado', valor: 'SLA_NEUTRO' };
    case 'PLANEJADO':
      return { texto: 'Planejado, sem prazo', valor: 'SLA_NEUTRO' };
    case 'NAO_CONFIGURADO':
      return { texto: 'Prazo não configurado', valor: 'SLA_ATENCAO' };
    case 'NO_PRAZO':
      return { texto: `${sla.pausado ? 'Prazo pausado, ' : ''}restam ${duracao(sla.minutosRestantes ?? 0)}`, valor: sla.pausado ? 'SLA_ATENCAO' : 'SLA_NO_PRAZO' };
    case 'VENCIDO':
      return { texto: `Vencido há ${duracao(sla.minutosRestantes ?? 0)}`, valor: 'SLA_VENCIDO' };
    case 'CUMPRIDO':
      return { texto: 'Prazo cumprido', valor: 'SLA_NO_PRAZO' };
    case 'CUMPRIDO_COM_ATRASO':
      return { texto: 'Executado com atraso', valor: 'SLA_ATENCAO' };
    default:
      return { texto: 'Prazo encerrado', valor: 'SLA_NEUTRO' };
  }
}

const ENCERRADOS = ['NEGADA', 'ENCERRADA', 'CONCLUIDA'];
const RANK_PRIORIDADE: Record<PrioridadeManutencao, number> = { MUITO_ALTA: 0, MEDIA: 1, BAIXA: 2 };

export interface ChaveDeFila {
  status: string;
  gravidade: number;
  vencido: boolean;
  prioridade: PrioridadeManutencao | null;
  criadoEm: string;
}

export const chaveDeFila = (m: Manutencao): ChaveDeFila => ({
  status: m.status,
  gravidade: m.categoriaCivil?.gravidade ?? 0,
  vencido: m.sla?.situacao === 'VENCIDO',
  prioridade: m.prioridade ?? null,
  criadoEm: m.criadoEm,
});

/** Mesma ordem do backend para o chamado civil: abertos primeiro, maior gravidade, prazo vencido, prioridade e o mais antigo. */
export function compararFila(a: ChaveDeFila, b: ChaveDeFila) {
  return (
    Number(ENCERRADOS.includes(a.status)) - Number(ENCERRADOS.includes(b.status)) ||
    b.gravidade - a.gravidade ||
    Number(!a.vencido) - Number(!b.vencido) ||
    (a.prioridade ? RANK_PRIORIDADE[a.prioridade] : 3) - (b.prioridade ? RANK_PRIORIDADE[b.prioridade] : 3) ||
    a.criadoEm.localeCompare(b.criadoEm)
  );
}
