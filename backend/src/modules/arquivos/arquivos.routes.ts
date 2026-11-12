import path from 'path';
import { Router } from 'express';
import { Perfil } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { FOTOS_DIR, LAUDOS_DIR, RELATOS_DIR } from '../../lib/uploads';
import { autenticar } from '../../middlewares/auth';
import { AppError } from '../../errors/AppError';

export const arquivosRouter = Router();

// Os nomes gravados pelo upload são sempre UUID + extensão; qualquer outra
// coisa (../, barras, nomes arbitrários) é recusada antes de tocar o disco.
const NOME_VALIDO = /^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;

function nomeSeguro(nome: string) {
  if (!NOME_VALIDO.test(nome)) throw new AppError('Arquivo não encontrado.', 404);
  return nome;
}

function enviar(res: import('express').Response, pasta: string, nome: string) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(path.join(pasta, nome), (erro) => {
    if (erro && !res.headersSent) res.status(404).json({ mensagem: 'Arquivo não encontrado.' });
  });
}

// Anexos de solicitação e fotos de manutenção civil: mesma regra de leitura do registro de origem
arquivosRouter.get('/solicitacoes/:arquivo', autenticar, async (req, res) => {
  const nome = nomeSeguro(req.params.arquivo);
  const url = `/uploads/solicitacoes/${nome}`;
  const { perfil, unidadeId, prestadorId } = req.usuario!;
  const solicitacao = await prisma.solicitacao.findFirst({
    where: { anexoUrl: url },
    select: { unidadeOrigemId: true, unidadeDestinoId: true },
  });
  if (solicitacao) {
    // Terceirizada não participa de solicitações (a lista de permissão já barra, mas a regra fica explícita aqui)
    if (perfil === Perfil.TERCEIRIZADA) throw new AppError('Arquivo não encontrado.', 404);
    // Unidade só vê as que envolvem a própria unidade
    if (perfil === Perfil.UNIDADE && solicitacao.unidadeOrigemId !== unidadeId && solicitacao.unidadeDestinoId !== unidadeId) {
      throw new AppError('Esta solicitação não envolve a sua unidade.', 403);
    }
    return enviar(res, FOTOS_DIR, nome);
  }
  // A mesma foto pode estar em mais de um chamado (reencaminhamento copia a referência, não o arquivo):
  // o acesso vale se qualquer um deles puder ser lido por quem pede
  const manutencoes = await prisma.manutencao.findMany({
    // Foto do chamado ou de um problema acrescentado a ele
    where: { OR: [{ fotos: { has: url } }, { problemasExtras: { some: { fotos: { has: url } } } }] },
    select: { unidadeId: true, contrato: { select: { prestadorId: true } } },
  });
  if (manutencoes.length === 0) throw new AppError('Arquivo não encontrado.', 404);
  if (perfil === Perfil.GALPAO) throw new AppError('Seu perfil não possui permissão para este arquivo.', 403);
  if (perfil === Perfil.UNIDADE && !manutencoes.some((m) => m.unidadeId === unidadeId)) {
    throw new AppError('Esta manutenção não pertence à sua unidade.', 403);
  }
  if (perfil === Perfil.TERCEIRIZADA && (!prestadorId || !manutencoes.some((m) => m.contrato?.prestadorId === prestadorId))) {
    throw new AppError('Esta manutenção não pertence a um contrato do seu prestador.', 403);
  }
  enviar(res, FOTOS_DIR, nome);
});

// Laudos de baixa: mesma regra de leitura da manutenção (Unidade só vê os da própria unidade)
arquivosRouter.get('/laudos/:arquivo', autenticar, async (req, res) => {
  const nome = nomeSeguro(req.params.arquivo);
  const { perfil, unidadeId, prestadorId } = req.usuario!;
  // OS assinada: Unidade do chamado, prestador do contrato e quem trabalha com manutenção
  // Cotações do orçamento prévio: prestador do contrato e quem trabalha com manutenção (a Unidade não vê valores de orçamento)
  const cotacao = await prisma.cotacaoOrcamento.findFirst({
    where: { arquivo: `/uploads/laudos/${nome}` },
    select: { manutencao: { select: { contrato: { select: { prestadorId: true } } } } },
  });
  if (cotacao) {
    if (perfil === Perfil.GALPAO || perfil === Perfil.UNIDADE) throw new AppError('Seu perfil não possui permissão para este arquivo.', 403);
    if (perfil === Perfil.TERCEIRIZADA && (!prestadorId || cotacao.manutencao.contrato?.prestadorId !== prestadorId)) {
      throw new AppError('Esta manutenção não pertence a um contrato do seu prestador.', 403);
    }
    return enviar(res, LAUDOS_DIR, nome);
  }
  const documento = await prisma.documentoOS.findFirst({
    where: { arquivo: `/uploads/laudos/${nome}` },
    select: { ordemServico: { select: { manutencao: { select: { unidadeId: true, contrato: { select: { prestadorId: true } } } } } } },
  });
  if (documento) {
    const chamado = documento.ordemServico.manutencao;
    if (perfil === Perfil.GALPAO) throw new AppError('Seu perfil não possui permissão para este arquivo.', 403);
    if (perfil === Perfil.UNIDADE && chamado.unidadeId !== unidadeId) throw new AppError('Esta manutenção não pertence à sua unidade.', 403);
    if (perfil === Perfil.TERCEIRIZADA && (!prestadorId || chamado.contrato?.prestadorId !== prestadorId)) {
      throw new AppError('Esta manutenção não pertence a um contrato do seu prestador.', 403);
    }
    return enviar(res, LAUDOS_DIR, nome);
  }
  const manutencao = await prisma.manutencao.findFirst({
    where: { laudoBaixa: `/uploads/laudos/${nome}` },
    select: { unidadeId: true },
  });
  if (!manutencao) throw new AppError('Arquivo não encontrado.', 404);
  if (perfil === Perfil.UNIDADE && manutencao.unidadeId !== unidadeId) {
    throw new AppError('Esta manutenção não pertence à sua unidade.', 403);
  }
  // Laudo de baixa é de equipamento: a terceirizada não o lê por este caminho
  if (perfil === Perfil.TERCEIRIZADA) throw new AppError('Arquivo não encontrado.', 404);
  enviar(res, LAUDOS_DIR, nome);
});

// Anexos de relato de problema: só quem administra usuários (o Administrador, que lê os relatos) abre
arquivosRouter.get('/relatos/:arquivo', autenticar, async (req, res) => {
  const nome = nomeSeguro(req.params.arquivo);
  const { perfil, permissoes } = req.usuario!;
  if (perfil !== Perfil.OPERADOR || !permissoes.includes('USUARIOS_ADMINISTRAR')) {
    throw new AppError('Seu perfil não possui permissão para este arquivo.', 403);
  }
  const relato = await prisma.relatoProblema.findFirst({
    where: { anexos: { has: `/uploads/relatos/${nome}` } },
    select: { id: true },
  });
  if (!relato) throw new AppError('Arquivo não encontrado.', 404);
  enviar(res, RELATOS_DIR, nome);
});
