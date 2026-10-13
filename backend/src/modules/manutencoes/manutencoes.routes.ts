import { Router } from 'express';
import { z } from 'zod';
import { EstadoConservacao, Perfil, StatusManutencao } from '@prisma/client';
import { autenticar } from '../../middlewares/auth';
import { permitir } from '../../middlewares/rbac';
import { validarBody } from '../../middlewares/validate';
import { AppError } from '../../errors/AppError';
import { assinaturaPdf, uploadLaudoPdf } from '../../lib/uploads';
import * as service from './manutencoes.service';

export const manutencoesRouter = Router();

manutencoesRouter.use(autenticar);

// Leitura: só quem trabalha com manutenção. O Galpão não tem acesso (e a terceirizada só vê as do seu contrato)
const leitura = permitir(Perfil.OPERADOR, Perfil.UNIDADE, Perfil.TERCEIRIZADA);

// Minimização de dados: a terceirizada não precisa do e-mail institucional da unidade (usado só nos avisos do sistema)
function paraPerfil<T extends { unidade: { emailBase?: string | null } }>(perfil: Perfil, manutencao: T): T {
  if (perfil !== Perfil.TERCEIRIZADA) return manutencao;
  const unidade = { ...manutencao.unidade };
  delete unidade.emailBase;
  return { ...manutencao, unidade } as T;
}

const STATUS_MANUTENCAO = new Set<string>(Object.values(StatusManutencao));

manutencoesRouter.get('/', leitura, async (req, res) => {
  const bruto = req.query.status;
  if (bruto !== undefined && (typeof bruto !== 'string' || !STATUS_MANUTENCAO.has(bruto))) {
    throw new AppError('Status inválido.', 422);
  }
  const manutencoes = await service.listar(req.usuario!, {
    status: bruto as StatusManutencao | undefined,
    busca: typeof req.query.busca === 'string' ? req.query.busca : undefined,
  });
  res.json(manutencoes.map((m) => paraPerfil(req.usuario!.perfil, m)));
});

manutencoesRouter.get('/:id', leitura, async (req, res) => {
  res.json(paraPerfil(req.usuario!.perfil, await service.buscarPorId(req.usuario!, req.params.id)));
});

manutencoesRouter.get('/:id/historico', leitura, async (req, res) => {
  res.json(await service.historico(req.usuario!, req.params.id));
});

const solicitarSchema = z.object({
  equipamentoId: z.string().uuid(),
  titulo: z
    .string({ required_error: 'Informe o título.' })
    .trim()
    .min(1, 'Informe o título.')
    .max(80, 'O título pode ter no máximo 80 caracteres.'),
  descricaoProblema: z.string().min(5, 'descreva o problema'),
});

// UC05 — a Unidade solicita manutenção
manutencoesRouter.post(
  '/',
  permitir(Perfil.UNIDADE, Perfil.OPERADOR),
  validarBody(solicitarSchema),
  async (req, res) => {
    const manutencao = await service.solicitar(req.usuario!, req.body);
    res.status(201).json(manutencao);
  },
);

// RN03 — somente o Administrador decide
manutencoesRouter.post(
  '/:id/aprovar',
  permitir(Perfil.OPERADOR),
  validarBody(z.object({ contratoItemId: z.string().uuid('selecione o item de contrato que cobre a manutenção') })),
  async (req, res) => {
    res.json(await service.aprovar(req.usuario!, req.params.id, req.body.contratoItemId));
  },
);

manutencoesRouter.post(
  '/:id/negar',
  permitir(Perfil.OPERADOR),
  validarBody(z.object({ motivo: z.string().min(3, 'informe o motivo da negação') })),
  async (req, res) => {
    res.json(await service.negar(req.usuario!, req.params.id, req.body.motivo));
  },
);

// Enquanto aguarda orçamento: o Administrador troca o item (saldo/escopo) sem cancelar o chamado
manutencoesRouter.post(
  '/:id/item',
  permitir(Perfil.OPERADOR),
  validarBody(z.object({ contratoItemId: z.string().uuid('selecione o item de contrato que cobre a manutenção') })),
  async (req, res) => {
    res.json(await service.trocarItem(req.usuario!, req.params.id, req.body.contratoItemId));
  },
);

// Só a terceirizada do contrato lança o orçamento (o item de contrato é o escolhido na aprovação)
manutencoesRouter.post(
  '/:id/orcamento',
  permitir(Perfil.TERCEIRIZADA),
  validarBody(
    z.object({
      valor: z.number().positive('o valor do orçamento deve ser positivo'),
      descricao: z.string().optional(),
    }),
  ),
  async (req, res) => {
    res.json(paraPerfil(req.usuario!.perfil, await service.registrarOrcamento(req.usuario!, req.params.id, req.body)));
  },
);

// Aceita boolean (JSON) ou 'true'/'false' (campo de texto vindo de multipart/form-data)
const booleanFlexivel = z.union([z.boolean(), z.enum(['true', 'false'])]).transform((v) => v === true || v === 'true');

// Laudo de baixa (RF16) é um upload de PDF — só é exigido quando aprovado=false
manutencoesRouter.post(
  '/:id/validar-orcamento',
  permitir(Perfil.OPERADOR),
  uploadLaudoPdf.single('laudo'),
  assinaturaPdf,
  validarBody(z.object({ aprovado: booleanFlexivel })),
  async (req, res) => {
    const laudoUrl = req.file ? `/uploads/laudos/${req.file.filename}` : undefined;
    res.json(
      await service.validarOrcamento(req.usuario!, req.params.id, {
        aprovado: req.body.aprovado,
        laudoBaixa: laudoUrl,
      }),
    );
  },
);

// Só a terceirizada confirma que o reparo terminou; depois disso Unidade e Administrador confirmam o retorno.
// Em execução, o Administrador não emite baixa nem marca retorno: a baixa só nasce da rejeição do orçamento.
manutencoesRouter.post(
  '/:id/registrar-retorno',
  permitir(Perfil.TERCEIRIZADA),
  validarBody(z.object({ custoFinal: z.number().positive('informe o custo real do reparo').optional() })),
  async (req, res) => {
    res.json(paraPerfil(req.usuario!.perfil, await service.registrarRetorno(req.usuario!, req.params.id, req.body.custoFinal)));
  },
);

// RN11 — confirmação dupla (Unidade + Administrador)
manutencoesRouter.post(
  '/:id/confirmar-retorno',
  permitir(Perfil.UNIDADE, Perfil.OPERADOR),
  validarBody(z.object({ estadoPosManutencao: z.nativeEnum(EstadoConservacao).optional() })),
  async (req, res) => {
    res.json(
      await service.confirmarRetorno(req.usuario!, req.params.id, req.body.estadoPosManutencao),
    );
  },
);
