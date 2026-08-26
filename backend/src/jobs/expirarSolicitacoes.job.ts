import { prisma } from '../lib/prisma';
import { registrarAuditoria } from '../services/auditoria.service';
import { notificar } from '../services/notificacao.service';

const SLA_DIAS = 7;

// Solicitação sem retorno do Gestor de Patrimônio por SLA_DIAS dias é
// fechada automaticamente pelo sistema ("chamado fechado por falta de
// retorno", confirmado pelo cliente). Só PENDENTE_APROVACAO — uma vez
// aprovada, AGUARDANDO_DISPONIBILIDADE pode esperar indefinidamente
// (confirmado com o cliente: não tem prazo).
export async function expirarSolicitacoesPendentes() {
  const limite = new Date(Date.now() - SLA_DIAS * 24 * 60 * 60 * 1000);
  const pendentes = await prisma.solicitacao.findMany({
    where: {
      status: 'PENDENTE_APROVACAO',
      atualizadoEm: { lt: limite },
    },
    include: {
      unidadeOrigem: { select: { nome: true, emailBase: true } },
    },
  });

  for (const solicitacao of pendentes) {
    await prisma.$transaction(async (tx) => {
      await tx.solicitacao.update({
        where: { id: solicitacao.id },
        data: { status: 'EXPIRADA' },
      });
      await registrarAuditoria(
        {
          acao: 'EXPIRAR_SOLICITACAO_SLA',
          entidade: 'solicitacao',
          entidadeId: solicitacao.id,
          dadosAntes: { status: solicitacao.status },
          dadosDepois: { status: 'EXPIRADA', slaDias: SLA_DIAS },
        },
        tx,
      );
    });
    await notificar(
      solicitacao.unidadeOrigem.emailBase,
      'Solicitação encerrada por falta de retorno',
      `Sua solicitação foi fechada automaticamente pelo sistema após ${SLA_DIAS} dias sem retorno do Gestor de Patrimônio.`,
    );
    const gestores = await prisma.usuario.findMany({
      where: { perfil: 'GESTOR_PATRIMONIO', ativo: true },
      select: { email: true },
    });
    for (const gestor of gestores) {
      await notificar(
        gestor.email,
        'Solicitação expirada por SLA',
        `A solicitação da unidade ${solicitacao.unidadeOrigem.nome} foi fechada automaticamente após ${SLA_DIAS} dias sem resposta.`,
      );
    }
  }

  return { expiradas: pendentes.length };
}
