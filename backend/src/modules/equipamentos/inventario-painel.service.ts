import { prisma } from '../../lib/prisma';
import type { AuthPayload } from '../../middlewares/auth';
import { montarFiltroInventario, type FiltrosInventario } from './equipamentos.service';

type Grupo = { id: string; nome: string; quantidade: number };
function somar(mapa: Map<string, Grupo>, id: string, nome: string, quantidade: number) {
  const atual = mapa.get(id);
  mapa.set(id, { id, nome, quantidade: (atual?.quantidade ?? 0) + quantidade });
}
function ordenar(mapa: Map<string, Grupo>) {
  return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Conta tombamentos uma única vez. Unidade do agrupamento é sempre a proprietária (RN06). */
export async function consultarPainel(usuario: AuthPayload, filtros: FiltrosInventario) {
  const grupos = await prisma.equipamento.groupBy({
    by: ['unidadeId', 'tipoEquipamentoId', 'status'],
    where: montarFiltroInventario(usuario, filtros),
    _count: { _all: true },
  });
  const [unidades, tipos] = grupos.length ? await Promise.all([
    prisma.unidade.findMany({ where: { id: { in: [...new Set(grupos.map(g => g.unidadeId))] } }, select: { id: true, nome: true } }),
    prisma.tipoEquipamento.findMany({ where: { id: { in: [...new Set(grupos.map(g => g.tipoEquipamentoId))] } }, select: { id: true, nome: true, categoriaId: true, categoria: { select: { nome: true } } } }),
  ]) : [[], []];
  const unidadePorId = new Map(unidades.map(u => [u.id, u.nome]));
  const tipoPorId = new Map(tipos.map(t => [t.id, t]));
  const porUnidade = new Map<string, Grupo>(), porCategoria = new Map<string, Grupo>(), porFamilia = new Map<string, Grupo>();
  let total = 0, ativos = 0, emManutencao = 0;
  for (const g of grupos) {
    const quantidade = g._count._all, tipo = tipoPorId.get(g.tipoEquipamentoId);
    total += quantidade;
    if (g.status === 'ATIVO') ativos += quantidade;
    if (g.status === 'EM_MANUTENCAO') emManutencao += quantidade;
    somar(porUnidade, g.unidadeId, unidadePorId.get(g.unidadeId) ?? 'Unidade não identificada', quantidade);
    somar(porFamilia, g.tipoEquipamentoId, tipo?.nome ?? 'Tipo não identificado', quantidade);
    somar(porCategoria, tipo?.categoriaId ?? 'sem-categoria', tipo?.categoria.nome ?? 'Sem categoria', quantidade);
  }
  return { total, ativos, emManutencao, unidades: porUnidade.size, categorias: porCategoria.size, familias: porFamilia.size,
    porUnidade: ordenar(porUnidade), porCategoria: ordenar(porCategoria), porFamilia: ordenar(porFamilia),
    criterioUnidade: 'PROPRIETARIA', atualizadoEm: new Date().toISOString() };
}
