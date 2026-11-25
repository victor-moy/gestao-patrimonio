import type { Prisma, PrioridadeManutencao, StatusManutencao, TipoManutencao } from '@prisma/client';

// Prioridade, gravidade e prazo (SLA) do chamado civil.
// - Prioridade: definida pela triagem ao aprovar (Baixa, Média, Muito Alta).
// - Gravidade: campo da categoria civil; só ordena a fila, não muda prioridade nem prazo.
// - SLA: o relógio começa na primeira vez que o chamado fica AGUARDANDO_EXECUCAO (já com o prestador), com as horas do
//   item de contrato congeladas naquele momento; o tempo BLOQUEADO depois do início é descontado; para quando o prestador
//   marca como executado. Baixa é planejada, sem vencimento.

export type SituacaoSla =
  | 'AGUARDANDO' // ainda não foi ao prestador
  | 'PLANEJADO' // prioridade baixa: sem vencimento
  | 'NAO_CONFIGURADO' // o item de contrato não tem as horas dessa prioridade
  | 'NO_PRAZO'
  | 'VENCIDO'
  | 'CUMPRIDO'
  | 'CUMPRIDO_COM_ATRASO'
  | 'ENCERRADO'; // o chamado acabou sem o prestador executar (negado, encerrado, reencaminhado)

export interface SlaChamado {
  situacao: SituacaoSla;
  venceEm: string | null;
  // Negativo quando vencido; nulo sem vencimento ou depois de executado
  minutosRestantes: number | null;
  pausado: boolean;
}

interface EntradaSla {
  tipo: TipoManutencao;
  status: StatusManutencao;
  prioridade: PrioridadeManutencao | null;
  slaInicioEm: Date | null;
  slaHoras: number | null;
  slaFimEm: Date | null;
  slaBloqueadoSegundos: number;
  bloqueadoEm: Date | null;
}

const ENCERRADOS: StatusManutencao[] = ['NEGADA', 'ENCERRADA', 'CONCLUIDA'];

export function calcularSla(m: EntradaSla, agora: Date = new Date()): SlaChamado | null {
  if (m.tipo !== 'CIVIL' || !m.prioridade) return null;
  const sem = (situacao: SituacaoSla, extra: Partial<SlaChamado> = {}): SlaChamado => ({ situacao, venceEm: null, minutosRestantes: null, pausado: false, ...extra });
  if (!m.slaInicioEm) return ENCERRADOS.includes(m.status) ? sem('ENCERRADO') : sem('AGUARDANDO');
  if (m.prioridade === 'BAIXA') return sem('PLANEJADO');
  if (!m.slaHoras) return sem('NAO_CONFIGURADO');
  const pausado = m.status === 'BLOQUEADO' && m.bloqueadoEm !== null;
  const bloqueioAtual = pausado ? Math.max(0, agora.getTime() - m.bloqueadoEm!.getTime()) : 0;
  const venceMs = m.slaInicioEm.getTime() + m.slaHoras * 3_600_000 + m.slaBloqueadoSegundos * 1000 + bloqueioAtual;
  const venceEm = new Date(venceMs).toISOString();
  if (m.slaFimEm) return sem(m.slaFimEm.getTime() <= venceMs ? 'CUMPRIDO' : 'CUMPRIDO_COM_ATRASO', { venceEm });
  if (ENCERRADOS.includes(m.status)) return sem('ENCERRADO', { venceEm });
  const minutosRestantes = Math.ceil((venceMs - agora.getTime()) / 60_000);
  return { situacao: minutosRestantes < 0 ? 'VENCIDO' : 'NO_PRAZO', venceEm, minutosRestantes, pausado };
}

// Dados do início do SLA, gravados junto com o envio do chamado civil ao prestador. Não faz nada se não for civil, se o
// relógio já começou (reencaminhar ou voltar à execução não reinicia) ou se o chamado ainda não tem prioridade.
export async function dadosInicioSla(
  tx: Prisma.TransactionClient,
  atual: { tipo: TipoManutencao; prioridade: PrioridadeManutencao | null; slaInicioEm: Date | null },
  contratoItemId: string | null | undefined,
  prioridade: PrioridadeManutencao | null = atual.prioridade,
  agora: Date = new Date(),
): Promise<{ slaInicioEm?: Date; slaHoras?: number | null }> {
  if (atual.tipo !== 'CIVIL' || atual.slaInicioEm || !prioridade) return {};
  let slaHoras: number | null = null;
  if (prioridade !== 'BAIXA' && contratoItemId) {
    const item = await tx.contratoItem.findUnique({ where: { id: contratoItemId }, select: { slaHorasMedia: true, slaHorasMuitoAlta: true } });
    slaHoras = (prioridade === 'MUITO_ALTA' ? item?.slaHorasMuitoAlta : item?.slaHorasMedia) ?? null;
  }
  return { slaInicioEm: agora, slaHoras };
}

const RANK_PRIORIDADE: Record<PrioridadeManutencao, number> = { MUITO_ALTA: 0, MEDIA: 1, BAIXA: 2 };

// Fila do chamado civil: abertos antes dos encerrados; dentro deles, maior gravidade da categoria primeiro, depois prazo
// vencido, prioridade e, por fim, o mais antigo. Só ordena a exibição.
export function ordenarCivis<T extends EntradaSla & { id: string; criadoEm: Date; categoriaCivil?: { gravidade: number } | null }>(lista: T[], agora: Date = new Date()): T[] {
  const chave = (m: T) => ({
    fechado: ENCERRADOS.includes(m.status) ? 1 : 0,
    gravidade: m.categoriaCivil?.gravidade ?? 0,
    vencido: calcularSla(m, agora)?.situacao === 'VENCIDO' ? 0 : 1,
    prioridade: m.prioridade ? RANK_PRIORIDADE[m.prioridade] : 3,
  });
  return [...lista].sort((a, b) => {
    const x = chave(a);
    const y = chave(b);
    return x.fechado - y.fechado || y.gravidade - x.gravidade || x.vencido - y.vencido || x.prioridade - y.prioridade || a.criadoEm.getTime() - b.criadoEm.getTime() || a.id.localeCompare(b.id);
  });
}
