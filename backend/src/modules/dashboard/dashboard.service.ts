import { prisma } from '../../lib/prisma';

// Alertas do painel: atas críticas (RF35) + empréstimos atrasados (FA05)
export async function alertas() {
  const agora = new Date();
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [atas, emprestimosAtrasados] = await Promise.all([
    prisma.ata.findMany({ where: { ativo: true } }),
    prisma.solicitacao.findMany({
      where: {
        tipo: 'EMPRESTIMO',
        // Único status de empréstimo em aberto desde o redesenho do fluxo —
        // AGUARDANDO_RECEBIMENTO não existe mais nesse tipo.
        status: 'AGUARDANDO_RETORNO',
        dataRetornoPrevista: { lt: agora },
      },
      include: {
        equipamento: { select: { tombamento: true } },
        unidadeOrigem: { select: { nome: true } },
        unidadeDestino: { select: { nome: true } },
      },
    }),
  ]);

  const lista: Array<{ tipo: string; severidade: 'AVISO' | 'CRITICO'; mensagem: string }> = [];
  for (const ata of atas) {
    if (ata.vencimento < agora) {
      lista.push({ tipo: 'ATA_VENCIDA', severidade: 'CRITICO', mensagem: `Ata ${ata.numero} está vencida` });
    } else if (ata.vencimento <= em30dias) {
      const dias = Math.ceil((ata.vencimento.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
      lista.push({
        tipo: 'ATA_VENCIMENTO',
        severidade: 'AVISO',
        mensagem: `Ata ${ata.numero} vence em ${dias} dia${dias === 1 ? '' : 's'} — saldo restante: R$ ${Number(ata.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      });
    }
    const percentual = Number(ata.valorTotal) > 0 ? (Number(ata.saldo) / Number(ata.valorTotal)) * 100 : 0;
    if (percentual < 10 && ata.vencimento >= agora) {
      lista.push({
        tipo: 'ATA_SALDO_BAIXO',
        severidade: 'CRITICO',
        mensagem: `Ata ${ata.numero} com saldo baixo — apenas ${percentual.toFixed(1)}% do saldo disponível (R$ ${Number(ata.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
      });
    }
  }
  for (const emp of emprestimosAtrasados) {
    lista.push({
      tipo: 'EMPRESTIMO_ATRASADO',
      severidade: 'AVISO',
      mensagem: `Empréstimo do equipamento ${emp.equipamento?.tombamento} (${emp.unidadeOrigem.nome} → ${emp.unidadeDestino?.nome}) está com devolução atrasada`,
    });
  }
  return lista;
}
