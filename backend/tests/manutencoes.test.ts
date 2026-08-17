import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();

const equipamentoAtivo = {
  id: 'eq-1',
  tombamento: '12345/2024',
  unidadeId: 'unidade-1',
  tipoEquipamentoId: 'tipo-1',
  status: 'ATIVO',
};

const manutencaoBase = {
  id: 'man-1',
  equipamentoId: 'eq-1',
  unidadeId: 'unidade-1',
  solicitanteId: 'user-2',
  descricaoProblema: 'Não atinge a temperatura adequada',
  justificativa: 'Compromete a esterilização',
  status: 'PENDENTE_APROVACAO',
  motivoNegacao: null,
  decididoPorId: null,
  contratoId: null,
  orcamentoValor: null,
  orcamentoDescricao: null,
  laudoBaixa: null,
  confirmadoUnidade: false,
  confirmadoGestor: false,
  estadoPosManutencao: null,
  custoFinal: null,
  dataEnvio: null,
  dataConclusao: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  equipamento: { ...equipamentoAtivo, tipoEquipamento: { nome: 'Autoclave' } },
  unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
  solicitante: { nome: 'Rodrigo' },
  decididoPor: null,
  contrato: null,
};

describe('Fluxo de manutenção (UC05-UC09, RF11-RF19)', () => {
  it('Unidade abre solicitação para equipamento próprio (RF11)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    prismaMock.manutencao.create.mockResolvedValue(manutencaoBase as never);
    const res = await request(app)
      .post('/manutencoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        equipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6',
        descricaoProblema: 'Não atinge a temperatura adequada',
        justificativa: 'Compromete a esterilização',
      });
    expect(res.status).toBe(201);
  });

  it('bloqueia solicitação para equipamento de outra unidade', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue({
      ...equipamentoAtivo,
      unidadeId: 'outra',
    } as never);
    const res = await request(app)
      .post('/manutencoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        equipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6',
        descricaoProblema: 'Problema qualquer',
        justificativa: 'Justificativa',
      });
    expect(res.status).toBe(403);
  });

  it('bloqueia nova solicitação para equipamento em manutenção (RN02/FA07)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue({
      ...equipamentoAtivo,
      status: 'EM_MANUTENCAO',
    } as never);
    const res = await request(app)
      .post('/manutencoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        equipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6',
        descricaoProblema: 'Problema qualquer',
        justificativa: 'Justificativa',
      });
    expect(res.status).toBe(422);
    expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
  });

  it('aprovação altera equipamento para EM_MANUTENCAO (RF12/RF13)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(manutencaoBase as never);
    prismaMock.manutencao.update.mockResolvedValue({
      ...manutencaoBase,
      status: 'AGUARDANDO_ORCAMENTO',
    } as never);
    prismaMock.usuario.findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .post('/manutencoes/man-1/aprovar')
      .set(auth('GESTOR_MANUTENCAO'))
      .send({});
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
      data: { status: 'EM_MANUTENCAO' },
    });
    expect(prismaMock.movimentacao.create).toHaveBeenCalled();
    expect(prismaMock.notificacao.create).toHaveBeenCalled();
  });

  it('negação registra motivo e notifica a unidade (FA01)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(manutencaoBase as never);
    prismaMock.manutencao.update.mockResolvedValue({
      ...manutencaoBase,
      status: 'NEGADA',
      motivoNegacao: 'Não justificada',
    } as never);
    const res = await request(app)
      .post('/manutencoes/man-1/negar')
      .set(auth('GESTOR_MANUTENCAO'))
      .send({ motivo: 'Não justificada' });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
    expect(prismaMock.notificacao.create).toHaveBeenCalled();
  });

  it('não permite aprovar manutenção já decidida', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'CONCLUIDA',
    } as never);
    const res = await request(app)
      .post('/manutencoes/man-1/aprovar')
      .set(auth('GESTOR_MANUTENCAO'))
      .send({});
    expect(res.status).toBe(422);
  });

  it('registra orçamento da terceirizada (RF14)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'AGUARDANDO_ORCAMENTO',
    } as never);
    prismaMock.manutencao.update.mockResolvedValue({
      ...manutencaoBase,
      status: 'ORCAMENTO_REGISTRADO',
      orcamentoValor: 1850,
    } as never);
    const res = await request(app)
      .post('/manutencoes/man-1/orcamento')
      .set(auth('GESTOR_MANUTENCAO'))
      .send({ valor: 1850 });
    expect(res.status).toBe(200);
  });

  it('orçamento rejeitado exige laudo e gera baixa + solicitação automática (FA02/RN07/RF16/RF17)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'ORCAMENTO_REGISTRADO',
      orcamentoValor: 3200,
    } as never);
    prismaMock.manutencao.update.mockResolvedValue({
      ...manutencaoBase,
      status: 'BAIXADO',
      laudoBaixa: '/uploads/laudos/laudo.pdf',
    } as never);
    prismaMock.solicitacao.create.mockResolvedValue({ id: 'sol-auto' } as never);
    prismaMock.usuario.findMany.mockResolvedValue([
      { email: 'gestor@jlle.gov' },
    ] as never);

    const res = await request(app)
      .post('/manutencoes/man-1/validar-orcamento')
      .set(auth('GESTOR_MANUTENCAO'))
      .field('aprovado', 'false')
      .attach('laudo', Buffer.from('%PDF-fake'), { filename: 'laudo.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    // Equipamento baixado
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
      data: { status: 'BAIXADO' },
    });
    // RN07 — solicitação automática de substituição
    expect(prismaMock.solicitacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'SUBSTITUICAO', equipamentoId: 'eq-1', automatica: true }),
      }),
    );
  });

  it('rejeitar orçamento sem laudo é bloqueado', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'ORCAMENTO_REGISTRADO',
    } as never);
    const res = await request(app)
      .post('/manutencoes/man-1/validar-orcamento')
      .set(auth('GESTOR_MANUTENCAO'))
      .field('aprovado', 'false');
    expect(res.status).toBe(422);
  });

  it('confirmação dupla: só conclui com Unidade + Gestor (RN11/RF18)', async () => {
    // 1ª confirmação: unidade — não conclui
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'AGUARDANDO_RETORNO',
      custoFinal: 1850,
    } as never);
    prismaMock.manutencao.update.mockResolvedValue({
      ...manutencaoBase,
      status: 'AGUARDANDO_RETORNO',
      confirmadoUnidade: true,
    } as never);
    let res = await request(app)
      .post('/manutencoes/man-1/confirmar-retorno')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ estadoPosManutencao: 'BOM' });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();

    // 2ª confirmação: gestor — conclui e reativa o equipamento
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'AGUARDANDO_RETORNO',
      confirmadoUnidade: true,
      custoFinal: 1850,
    } as never);
    prismaMock.manutencao.update.mockResolvedValue({
      ...manutencaoBase,
      status: 'CONCLUIDA',
      confirmadoUnidade: true,
      confirmadoGestor: true,
      estadoPosManutencao: 'BOM',
      custoFinal: 1850,
    } as never);
    res = await request(app)
      .post('/manutencoes/man-1/confirmar-retorno')
      .set(auth('GESTOR_MANUTENCAO'))
      .send({});
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'eq-1' },
        data: expect.objectContaining({ status: 'ATIVO' }),
      }),
    );
    expect(prismaMock.movimentacao.create).toHaveBeenCalled();
  });

  it('unidade de outra localidade não confirma retorno', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'AGUARDANDO_RETORNO',
    } as never);
    const res = await request(app)
      .post('/manutencoes/man-1/confirmar-retorno')
      .set(auth('UNIDADE', { unidadeId: 'outra-unidade' }))
      .send({});
    expect(res.status).toBe(403);
  });
});
