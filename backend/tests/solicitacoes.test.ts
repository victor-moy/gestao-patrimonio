import request from 'supertest';
import { Prisma } from '@prisma/client';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();

const UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';
const UUID2 = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b7';

const equipamentoAtivo = {
  id: 'eq-1',
  tombamento: '12348/2023',
  unidadeId: 'unidade-1',
  tipoEquipamentoId: 'tipo-1',
  status: 'ATIVO',
};

const solicitacaoBase = {
  id: 'sol-1',
  tipo: 'CESSAO_USO',
  status: 'PENDENTE_APROVACAO',
  unidadeOrigemId: 'unidade-1',
  unidadeDestinoId: 'unidade-2',
  equipamentoId: 'eq-1',
  tipoEquipamentoId: null,
  quantidade: null,
  justificativa: 'Necessidade urgente',
  origemRecurso: null,
  ataId: null,
  valorVinculado: null,
  motivoNegacao: null,
  dataRetornoPrevista: null,
  estadoRecebimento: null,
  automatica: false,
  criadoPorId: 'user-2',
  decididoPorId: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  unidadeOrigem: { id: 'unidade-1', nome: 'UBS Sul', emailBase: 'sul@jlle.gov' },
  unidadeDestino: { id: 'unidade-2', nome: 'UBS Centro', emailBase: 'centro@jlle.gov' },
  equipamento: {
    id: 'eq-1',
    tombamento: '12348/2023',
    descricao: 'Autoclave 21L',
    status: 'ATIVO',
    emendaParlamentar: false,
  },
  tipoEquipamento: null,
  ata: null,
  criadoPor: { nome: 'Carlos' },
  decididoPor: null,
};

describe('Solicitações — criação (UC10/UC13/UC16, RN02, RN05)', () => {
  it('cria cessão de uso para equipamento próprio', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    prismaMock.solicitacao.create.mockResolvedValue(solicitacaoBase as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'CESSAO_USO',
        equipamentoId: UUID,
        unidadeDestinoId: UUID2,
        justificativa: 'Necessidade urgente de equipamento adicional',
      });
    expect(res.status).toBe(201);
  });

  it('bloqueia cessão de equipamento em manutenção (RN02)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue({
      ...equipamentoAtivo,
      status: 'EM_MANUTENCAO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'CESSAO_USO',
        equipamentoId: UUID,
        unidadeDestinoId: UUID2,
        justificativa: 'Justificativa qualquer',
      });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
  });

  it('bloqueia solicitação para equipamento de outra unidade', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue({
      ...equipamentoAtivo,
      unidadeId: 'outra',
    } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'CESSAO_USO',
        equipamentoId: UUID,
        unidadeDestinoId: UUID2,
        justificativa: 'Justificativa qualquer',
      });
    expect(res.status).toBe(403);
  });

  it('empréstimo dispensa aprovação e marca equipamento como EMPRESTADO (RN05/RF25)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    prismaMock.solicitacao.create.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'AGUARDANDO_RECEBIMENTO',
      dataRetornoPrevista: new Date('2026-08-01'),
    } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'EMPRESTIMO',
        equipamentoId: UUID,
        unidadeDestinoId: UUID2,
        dataRetornoPrevista: '2026-08-01',
        justificativa: 'Empréstimo durante manutenção do nosso equipamento',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('AGUARDANDO_RECEBIMENTO');
    // RN06 — tombamento permanece na origem; destino é detentor temporário
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EMPRESTADO' }),
      }),
    );
  });

  it('empréstimo exige data prevista de retorno (RF24)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'EMPRESTIMO',
        equipamentoId: UUID,
        unidadeDestinoId: UUID2,
        justificativa: 'Sem data de retorno',
      });
    expect(res.status).toBe(422);
  });

  it('cria solicitação de novo item com origem do recurso (RF28)', async () => {
    prismaMock.solicitacao.create.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'NOVO_ITEM',
      equipamentoId: null,
      tipoEquipamentoId: 'tipo-1',
      quantidade: 2,
    } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'NOVO_ITEM',
        tipoEquipamentoId: UUID,
        quantidade: 2,
        origemRecurso: 'EMENDA_PARLAMENTAR',
        justificativa: 'Ampliação da capacidade de atendimento',
      });
    expect(res.status).toBe(201);
  });
});

describe('Solicitações — aprovação e atas (UC17, RN08, RN09, FA03, FA04)', () => {
  const novoItemPendente = {
    ...solicitacaoBase,
    tipo: 'NOVO_ITEM',
    equipamentoId: null,
    equipamento: null,
    unidadeDestinoId: null,
    unidadeDestino: null,
    tipoEquipamentoId: 'tipo-1',
    tipoEquipamento: { id: 'tipo-1', nome: 'Autoclave', codigo: 'AUT' },
    quantidade: 1,
  };

  it('nega solicitação com motivo (FA03)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacaoBase as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      status: 'NEGADA',
      motivoNegacao: 'Sem disponibilidade',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/negar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ motivo: 'Sem disponibilidade' });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
    expect(prismaMock.notificacao.create).toHaveBeenCalled();
  });

  it('aprova novo item sem ata: APROVADA_AGUARDANDO_ATA (FA04)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(novoItemPendente as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...novoItemPendente,
      status: 'APROVADA_AGUARDANDO_ATA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APROVADA_AGUARDANDO_ATA');
  });

  it('bloqueia vínculo com ata vencida (RN08)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(novoItemPendente as never);
    prismaMock.ata.findUnique.mockResolvedValue({
      id: 'ata-1',
      numero: '045/2025',
      saldo: new Prisma.Decimal(100000),
      valorTotal: new Prisma.Decimal(100000),
      vencimento: new Date('2020-01-01'),
      ativo: true,
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/vincular-ata')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ ataId: UUID, valorVinculado: 5000 });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('vencida');
  });

  it('bloqueia aprovação acima do saldo da ata (RN09)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(novoItemPendente as never);
    prismaMock.ata.findUnique.mockResolvedValue({
      id: 'ata-1',
      numero: '045/2025',
      saldo: new Prisma.Decimal(1000),
      valorTotal: new Prisma.Decimal(100000),
      vencimento: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      ativo: true,
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/vincular-ata')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ ataId: UUID, valorVinculado: 5000 });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('Saldo insuficiente');
  });

  it('vincula ata válida com saldo e aprova (UC17/RF29)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(novoItemPendente as never);
    prismaMock.ata.findUnique.mockResolvedValue({
      id: 'ata-1',
      numero: '045/2025',
      saldo: new Prisma.Decimal(100000),
      valorTotal: new Prisma.Decimal(250000),
      vencimento: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      ativo: true,
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...novoItemPendente,
      status: 'APROVADA',
      ata: { id: 'ata-1', numero: '045/2025' },
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ ataId: UUID, valorVinculado: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('APROVADA');
  });
});

describe('Solicitações — cessão, empréstimo e entrada (UC12, UC14, UC15, UC18)', () => {
  it('destino confirma recebimento da cessão: tombamento atualizado (RF23)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      status: 'AGUARDANDO_RECEBIMENTO',
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      status: 'CONCLUIDA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('UNIDADE', { unidadeId: 'unidade-2' }))
      .send({ estadoRecebimento: 'BOM' });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unidadeId: 'unidade-2' }),
      }),
    );
  });

  it('empréstimo: receptor deve registrar o estado no recebimento (RF26)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'AGUARDANDO_RECEBIMENTO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('UNIDADE', { unidadeId: 'unidade-2' }))
      .send({});
    expect(res.status).toBe(422);
  });

  it('origem confirma retorno do empréstimo: equipamento volta a ATIVO (RF27)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'AGUARDANDO_RETORNO',
      dataRetornoPrevista: new Date('2026-05-01'),
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'CONCLUIDA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-retorno')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send();
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'ATIVO', unidadeTemporariaId: null },
      }),
    );
  });

  it('galpão registra entrada do novo item e o saldo da ata é debitado no recebimento', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'NOVO_ITEM',
      status: 'APROVADA',
      equipamentoId: null,
      equipamento: null,
      tipoEquipamentoId: 'tipo-1',
      ataId: 'ata-1',
      valorVinculado: new Prisma.Decimal(5000),
    } as never);
    prismaMock.equipamento.findMany.mockResolvedValue([] as never);
    prismaMock.equipamento.create.mockResolvedValue({ id: 'eq-novo', unidadeId: 'unidade-1' } as never);
    prismaMock.ata.findUnique.mockResolvedValue({
      id: 'ata-1',
      saldo: new Prisma.Decimal(100000),
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'NOVO_ITEM',
      status: 'CONCLUIDA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/registrar-entrada')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({
        itens: [
          { tombamento: '20001/2026', descricao: 'Autoclave nova', estadoConservacao: 'OTIMO' },
        ],
      });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.create).toHaveBeenCalled();
    // Consumo do saldo no recebimento (feedback 12/05/2026)
    expect(prismaMock.ata.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { saldo: 95000 } }),
    );
    expect(prismaMock.estoqueGalpao.upsert).toHaveBeenCalled();
  });

  it('galpão não registra entrada com tombamento duplicado (RN01)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'NOVO_ITEM',
      status: 'APROVADA',
      equipamentoId: null,
      equipamento: null,
      tipoEquipamentoId: 'tipo-1',
    } as never);
    prismaMock.equipamento.findMany.mockResolvedValue([{ tombamento: '20001/2026' }] as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/registrar-entrada')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({
        itens: [
          { tombamento: '20001/2026', descricao: 'Autoclave', estadoConservacao: 'OTIMO' },
        ],
      });
    expect(res.status).toBe(409);
  });

  it('unidade não vê solicitação de outras unidades', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacaoBase as never);
    const res = await request(app)
      .get('/solicitacoes/sol-1')
      .set(auth('UNIDADE', { unidadeId: 'unidade-999' }));
    expect(res.status).toBe(403);
  });
});
