import { prisma } from '../lib/prisma';
import { DIAS_PARA_CONFIRMAR_RESOLUCAO, resolverSemResposta } from '../modules/manutencoes/manutencoes.service';

// Chamado civil que aguarda a Unidade há mais de 7 dias corridos é dado como resolvido. A contagem parte de
// `aguardandoRetornoEm` (na falta dele, de `atualizadoEm`, para os chamados anteriores à regra).
export async function resolverRetornosSemResposta() {
  const limite = new Date(Date.now() - DIAS_PARA_CONFIRMAR_RESOLUCAO * 24 * 60 * 60 * 1000);
  const vencidos = await prisma.manutencao.findMany({
    where: {
      tipo: 'CIVIL',
      status: 'AGUARDANDO_RETORNO',
      OR: [{ aguardandoRetornoEm: { lt: limite } }, { aguardandoRetornoEm: null, atualizadoEm: { lt: limite } }],
    },
    select: { id: true },
  });
  let resolvidos = 0;
  for (const { id } of vencidos) {
    // Uma falha num chamado não impede os demais
    try {
      if (await resolverSemResposta(id)) resolvidos += 1;
    } catch (erro) {
      console.error(`Falha ao resolver automaticamente o chamado ${id}:`, erro);
    }
  }
  return resolvidos;
}
