import request from 'supertest';
import { Prisma } from '@prisma/client';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();

const UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6';
const UUID2 = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b7';
const EQUIP_UUID = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b8';

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
  unidadeDestinoId: null,
  entidadeExternaNome: 'Hospital Regional (outro município)',
  equipamentoId: 'eq-1',
  tipoEquipamentoId: null,
  quantidade: null,
  justificativa: 'Necessidade urgente',
  origemRecurso: null,
  ataId: null,
  valorVinculado: null,
  motivoNegacao: null,
  anexoUrl: null,
  dataRetornoPrevista: null,
  estadoRecebimento: null,
  numeroPedidoBranet: null,
  prioridade: null,
  recebimentoOk: null,
  observacaoRecebimento: null,
  automatica: false,
  criadoPorId: 'user-2',
  decididoPorId: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
  unidadeOrigem: { id: 'unidade-1', nome: 'UBS Sul', emailBase: 'sul@jlle.gov' },
  unidadeDestino: null,
  equipamento: {
    id: 'eq-1',
    tombamento: '12348/2023',
    descricao: 'Autoclave 21L',
    status: 'ATIVO',
    emendaParlamentar: false,
    tipoEquipamentoId: 'tipo-1',
  },
  tipoEquipamento: null,
  ata: null,
  criadoPor: { nome: 'Carlos' },
  decididoPor: null,
  itensGerados: [] as Array<{ id: string; tombamento: string; descricao: string }>,
};

describe('Solicitações — criação (UC10/UC13/UC16, RN02, RN05)', () => {
  it('cria cessão de uso externa para equipamento próprio', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    prismaMock.solicitacao.create.mockResolvedValue(solicitacaoBase as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'CESSAO_USO',
        equipamentoId: UUID,
        entidadeExternaNome: 'Hospital Regional (outro município)',
        justificativa: 'Necessidade urgente de equipamento adicional',
      });
    expect(res.status).toBe(201);
    expect(res.body.ids).toEqual(['sol-1']);
  });

  it('cessão de uso exige o nome da entidade externa', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'CESSAO_USO',
        equipamentoId: UUID,
        justificativa: 'Necessidade urgente de equipamento adicional',
      });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
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
        entidadeExternaNome: 'Hospital Regional',
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
        entidadeExternaNome: 'Hospital Regional',
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
      unidadeDestinoId: 'unidade-2',
      unidadeDestino: { id: 'unidade-2', nome: 'UBS Centro', emailBase: 'centro@jlle.gov' },
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
    // RN06 — tombamento permanece na origem; destino é detentor temporário
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'EMPRESTADO' }),
      }),
    );
  });

  it('empréstimo sem data de retorno é aceito como transferência permanente', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    prismaMock.solicitacao.create.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'AGUARDANDO_RECEBIMENTO',
      unidadeDestinoId: 'unidade-2',
      unidadeDestino: { id: 'unidade-2', nome: 'UBS Centro', emailBase: 'centro@jlle.gov' },
      dataRetornoPrevista: null,
    } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'EMPRESTIMO',
        equipamentoId: UUID,
        unidadeDestinoId: UUID2,
        justificativa: 'Transferência definitiva do equipamento',
      });
    expect(res.status).toBe(201);
  });

  it('cria solicitação de ampliação com um item selecionado (RF28)', async () => {
    prismaMock.solicitacao.create.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'AMPLIACAO',
      equipamentoId: null,
      equipamento: null,
      entidadeExternaNome: null,
      tipoEquipamentoId: 'tipo-1',
      quantidade: 2,
    } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'AMPLIACAO',
        itens: [{ tipoEquipamentoId: UUID, quantidade: 2 }],
        origemRecurso: 'EMENDA_PARLAMENTAR',
        justificativa: 'Ampliação da capacidade de atendimento',
      });
    expect(res.status).toBe(201);
    expect(res.body.ids).toEqual(['sol-1']);
  });

  it('cria ampliação com múltiplos itens: uma Solicitacao por item (feedback do cliente 17/08)', async () => {
    prismaMock.solicitacao.create
      .mockResolvedValueOnce({ ...solicitacaoBase, id: 'sol-a', tipo: 'AMPLIACAO' } as never)
      .mockResolvedValueOnce({ ...solicitacaoBase, id: 'sol-b', tipo: 'AMPLIACAO' } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'AMPLIACAO',
        itens: [
          { tipoEquipamentoId: UUID, quantidade: 1 },
          { tipoEquipamentoId: UUID2, quantidade: 3 },
        ],
        justificativa: 'Ampliação da capacidade de atendimento',
      });
    expect(res.status).toBe(201);
    expect(res.body.ids).toEqual(['sol-a', 'sol-b']);
    expect(prismaMock.solicitacao.create).toHaveBeenCalledTimes(2);
  });

  it('ampliação sem itens selecionados é rejeitada', async () => {
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ tipo: 'AMPLIACAO', itens: [], justificativa: 'Ampliação sem itens' });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
  });

  it('cria ampliação sem origem do recurso: assume REGULAR por padrão (campo tirado do formulário)', async () => {
    prismaMock.solicitacao.create.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'AMPLIACAO',
      equipamentoId: null,
      equipamento: null,
      entidadeExternaNome: null,
      tipoEquipamentoId: 'tipo-1',
      quantidade: 2,
      origemRecurso: 'REGULAR',
    } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'AMPLIACAO',
        itens: [{ tipoEquipamentoId: UUID, quantidade: 2 }],
        justificativa: 'Ampliação da capacidade de atendimento',
      });
    expect(res.status).toBe(201);
    expect(prismaMock.solicitacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ origemRecurso: 'REGULAR' }),
      }),
    );
  });

  it('cria solicitação de substituição com equipamento a trocar e item de reposição', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    prismaMock.solicitacao.create.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'SUBSTITUICAO',
      entidadeExternaNome: null,
      tipoEquipamentoId: 'tipo-1',
      quantidade: 1,
    } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'SUBSTITUICAO',
        itens: [
          {
            equipamentoId: EQUIP_UUID,
            tipoEquipamentoId: UUID2,
            quantidade: 1,
            justificativa: 'Equipamento com defeito irreparável',
          },
        ],
        origemRecurso: 'REGULAR',
      });
    expect(res.status).toBe(201);
    expect(res.body.ids).toEqual(['sol-1']);
  });

  it('substituição aceita equipamento já baixado (fluxo automático RN07)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue({
      ...equipamentoAtivo,
      status: 'BAIXADO',
    } as never);
    prismaMock.solicitacao.create.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'SUBSTITUICAO',
      tipoEquipamentoId: 'tipo-1',
      quantidade: 1,
    } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'SUBSTITUICAO',
        itens: [
          {
            equipamentoId: EQUIP_UUID,
            tipoEquipamentoId: UUID2,
            quantidade: 1,
            justificativa: 'Equipamento já baixado por manutenção',
          },
        ],
        origemRecurso: 'REGULAR',
      });
    expect(res.status).toBe(201);
  });

  it('cria substituição com múltiplos equipamentos: uma Solicitacao por item (feedback do cliente 25/08)', async () => {
    prismaMock.equipamento.findUnique
      .mockResolvedValueOnce({ ...equipamentoAtivo, id: 'eq-1' } as never)
      .mockResolvedValueOnce({ ...equipamentoAtivo, id: 'eq-2' } as never);
    prismaMock.solicitacao.create
      .mockResolvedValueOnce({ ...solicitacaoBase, id: 'sol-a', tipo: 'SUBSTITUICAO' } as never)
      .mockResolvedValueOnce({ ...solicitacaoBase, id: 'sol-b', tipo: 'SUBSTITUICAO' } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'SUBSTITUICAO',
        itens: [
          {
            equipamentoId: UUID,
            tipoEquipamentoId: UUID2,
            quantidade: 1,
            justificativa: 'Primeiro equipamento com defeito irreparável',
          },
          {
            equipamentoId: EQUIP_UUID,
            tipoEquipamentoId: UUID2,
            quantidade: 2,
            justificativa: 'Segundo equipamento com defeito irreparável',
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.ids).toEqual(['sol-a', 'sol-b']);
    expect(prismaMock.solicitacao.create).toHaveBeenCalledTimes(2);
  });

  it('substituição sem itens selecionados é rejeitada', async () => {
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ tipo: 'SUBSTITUICAO', itens: [], justificativa: 'Substituição sem itens' });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
  });

  it('substituição rejeita item sem equipamento a substituir', async () => {
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'SUBSTITUICAO',
        itens: [{ tipoEquipamentoId: UUID2, quantidade: 1 }],
        justificativa: 'Substituição sem equipamento informado',
      });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
  });

  it('substituição rejeita item sem justificativa própria (feedback do cliente 25/08)', async () => {
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'SUBSTITUICAO',
        itens: [{ equipamentoId: UUID, tipoEquipamentoId: UUID2, quantidade: 1 }],
      });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
  });

  it('substituição rejeita o mesmo equipamento repetido na mesma solicitação', async () => {
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'SUBSTITUICAO',
        itens: [
          { equipamentoId: UUID, tipoEquipamentoId: UUID2, quantidade: 1 },
          { equipamentoId: UUID, tipoEquipamentoId: UUID2, quantidade: 1 },
        ],
        justificativa: 'Mesmo equipamento duas vezes',
      });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
  });

  it('recolha exige ao menos um equipamento (feedback do cliente 26/08 — sem destino na criação)', async () => {
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ tipo: 'RECOLHA', itens: [], justificativa: 'Recolha sem itens' });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
  });

  it('cria recolha com múltiplos equipamentos: uma Solicitacao por item, sem escolher destino (feedback do cliente 26/08)', async () => {
    prismaMock.equipamento.findUnique
      .mockResolvedValueOnce({ ...equipamentoAtivo, id: 'eq-1' } as never)
      .mockResolvedValueOnce({ ...equipamentoAtivo, id: 'eq-2' } as never);
    prismaMock.solicitacao.create
      .mockResolvedValueOnce({ ...solicitacaoBase, id: 'sol-a', tipo: 'RECOLHA' } as never)
      .mockResolvedValueOnce({ ...solicitacaoBase, id: 'sol-b', tipo: 'RECOLHA' } as never);
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'RECOLHA',
        itens: [{ equipamentoId: UUID }, { equipamentoId: EQUIP_UUID }],
        justificativa: 'Equipamentos sem uso',
      });
    expect(res.status).toBe(201);
    expect(res.body.ids).toEqual(['sol-a', 'sol-b']);
    expect(prismaMock.solicitacao.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.solicitacao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ unidadeDestinoId: expect.anything() }),
      }),
    );
  });

  it('recolha rejeita o mesmo equipamento repetido na mesma solicitação', async () => {
    const res = await request(app)
      .post('/solicitacoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        tipo: 'RECOLHA',
        itens: [{ equipamentoId: UUID }, { equipamentoId: UUID }],
        justificativa: 'Equipamento sem uso',
      });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
  });
});

describe('Solicitações — aprovação e atas (UC17, RN08, RN09, FA03, FA04)', () => {
  const ampliacaoPendente = {
    ...solicitacaoBase,
    tipo: 'AMPLIACAO',
    equipamentoId: null,
    equipamento: null,
    unidadeDestinoId: null,
    unidadeDestino: null,
    entidadeExternaNome: null,
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

  it('bloqueia negar depois de aprovada, mesmo aguardando disponibilidade (feedback 18/08: uma vez aprovada está aprovada)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      status: 'AGUARDANDO_DISPONIBILIDADE',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/negar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ motivo: 'Mudança de plano' });
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.update).not.toHaveBeenCalled();
  });

  it('aprova ampliação sem estoque: AGUARDANDO_DISPONIBILIDADE (sem expor ata ao solicitante)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(ampliacaoPendente as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([] as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'AGUARDANDO_DISPONIBILIDADE',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ prioridade: 2 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AGUARDANDO_DISPONIBILIDADE');
    expect(prismaMock.estoqueGalpao.update).not.toHaveBeenCalled();
  });

  it('bloqueia aprovar ampliação/substituição sem prioridade (feedback 18/08)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(ampliacaoPendente as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send();
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('prioridade');
    expect(prismaMock.solicitacao.update).not.toHaveBeenCalled();
  });

  it('aprova ampliação com estoque suficiente: RESERVADO direto, decrementando o galpão com mais saldo', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(ampliacaoPendente as never);
    // Já na ordem que o orderBy: { quantidade: 'desc' } devolveria de verdade
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([
      { id: 'est-2', unidadeId: 'galpao-2', quantidade: 5 },
      { id: 'est-1', unidadeId: 'galpao-1', quantidade: 2 },
    ] as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'RESERVADO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ prioridade: 3 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RESERVADO');
    expect(prismaMock.estoqueGalpao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'est-2' },
        data: { quantidade: { decrement: 1 } },
      }),
    );
  });

  it('aprova com prioridade definida pelo Gestor (feedback 17/08)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(ampliacaoPendente as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([] as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'AGUARDANDO_DISPONIBILIDADE',
      prioridade: 1,
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ prioridade: 1 });
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ prioridade: 1 }) }),
    );
  });

  it('aprova recolha marcando aguardando Patrimônio: vai pro galpão padrão sem lançamento no Branet ainda (feedback 27/08)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'PENDENTE_APROVACAO',
    } as never);
    prismaMock.unidade.findFirst.mockResolvedValue({ id: 'galpao-1', tipo: 'GALPAO', nome: 'Galpão CIAD/Branet' } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'AGUARDANDO_ENTREGA',
      unidadeDestinoId: 'galpao-1',
      pedidoEntregaRegistradoEm: null,
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ etapaRecolha: 'PATRIMONIO' });
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unidadeDestinoId: 'galpao-1', pedidoEntregaRegistradoEm: null }),
      }),
    );
  });

  it('aprova recolha marcando direto aguardando Branet, pulando a etapa Patrimônio (feedback 27/08)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'PENDENTE_APROVACAO',
    } as never);
    prismaMock.unidade.findFirst.mockResolvedValue({ id: 'galpao-1', tipo: 'GALPAO', nome: 'Galpão CIAD/Branet' } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'AGUARDANDO_ENTREGA',
      unidadeDestinoId: 'galpao-1',
      pedidoEntregaRegistradoEm: new Date(),
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ etapaRecolha: 'BRANET' });
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unidadeDestinoId: 'galpao-1', pedidoEntregaRegistradoEm: expect.any(Date) }),
      }),
    );
  });

  it('bloqueia aprovar recolha sem informar a etapa (Patrimônio ou Branet)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'PENDENTE_APROVACAO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/aprovar')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({});
    expect(res.status).toBe(422);
    expect(prismaMock.solicitacao.update).not.toHaveBeenCalled();
  });

  it('bloqueia vínculo com ata vencida (RN08)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'AGUARDANDO_DISPONIBILIDADE',
    } as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([]);
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
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'AGUARDANDO_DISPONIBILIDADE',
    } as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([]);
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

  it('vincula ata válida com saldo: vira RESERVADO sem tocar o estoque (UC17/RF29)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'AGUARDANDO_DISPONIBILIDADE',
    } as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([]);
    prismaMock.ata.findUnique.mockResolvedValue({
      id: 'ata-1',
      numero: '045/2025',
      saldo: new Prisma.Decimal(100000),
      valorTotal: new Prisma.Decimal(250000),
      vencimento: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      ativo: true,
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'RESERVADO',
      ata: { id: 'ata-1', numero: '045/2025' },
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/vincular-ata')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ ataId: UUID, valorVinculado: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RESERVADO');
    expect(prismaMock.estoqueGalpao.update).not.toHaveBeenCalled();
  });

  it('tenta reservar do estoque de novo quando ainda não há disponibilidade', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'AGUARDANDO_DISPONIBILIDADE',
    } as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/tentar-reservar-estoque')
      .set(auth('GESTOR_PATRIMONIO'))
      .send();
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('estoque suficiente');
  });

  it('tenta reservar do estoque de novo e consegue: vira RESERVADO', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'AGUARDANDO_DISPONIBILIDADE',
    } as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([
      { id: 'est-1', unidadeId: 'galpao-1', quantidade: 3 },
    ] as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...ampliacaoPendente,
      status: 'RESERVADO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/tentar-reservar-estoque')
      .set(auth('GESTOR_PATRIMONIO'))
      .send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('RESERVADO');
  });
});

describe('Solicitações — cessão externa, empréstimo e recolha (UC12, UC14, UC15, UC18)', () => {
  it('origem confirma saída da cessão externa: equipamento fica CEDIDO e a solicitação conclui (RF22)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      status: 'AGUARDANDO_SAIDA',
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      status: 'CONCLUIDA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-saida')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send();
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'CEDIDO' } }),
    );
  });

  it('empréstimo: receptor deve registrar o estado no recebimento (RF26)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'AGUARDANDO_RECEBIMENTO',
      unidadeDestinoId: 'unidade-2',
      unidadeDestino: { id: 'unidade-2', nome: 'UBS Centro', emailBase: 'centro@jlle.gov' },
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('UNIDADE', { unidadeId: 'unidade-2' }))
      .send({});
    expect(res.status).toBe(422);
  });

  it('empréstimo temporário: recebimento com data prevista aguarda retorno (RF26)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'AGUARDANDO_RECEBIMENTO',
      unidadeDestinoId: 'unidade-2',
      unidadeDestino: { id: 'unidade-2', nome: 'UBS Centro', emailBase: 'centro@jlle.gov' },
      dataRetornoPrevista: new Date('2026-08-01'),
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'AGUARDANDO_RETORNO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('UNIDADE', { unidadeId: 'unidade-2' }))
      .send({ estadoRecebimento: 'BOM' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AGUARDANDO_RETORNO');
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
  });

  it('empréstimo permanente: recebimento sem data prevista transfere o tombamento (RF23)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'AGUARDANDO_RECEBIMENTO',
      unidadeDestinoId: 'unidade-2',
      unidadeDestino: { id: 'unidade-2', nome: 'UBS Centro', emailBase: 'centro@jlle.gov' },
      dataRetornoPrevista: null,
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'EMPRESTIMO',
      status: 'CONCLUIDA',
      unidadeDestinoId: 'unidade-2',
      unidadeDestino: { id: 'unidade-2', nome: 'UBS Centro', emailBase: 'centro@jlle.gov' },
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('UNIDADE', { unidadeId: 'unidade-2' }))
      .send({ estadoRecebimento: 'BOM' });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unidadeId: 'unidade-2', unidadeTemporariaId: null, status: 'ATIVO' }),
      }),
    );
  });

  it('origem confirma retorno do empréstimo temporário: equipamento volta a ATIVO (RF27)', async () => {
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

  it('unidade confirma a recolha aprovada como Aguardando Branet: vira Aguardando Validação (feedback 26/08)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'AGUARDANDO_ENTREGA',
      unidadeDestinoId: 'galpao-1',
      pedidoEntregaRegistradoEm: new Date(),
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'AGUARDANDO_VALIDACAO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recolha')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send();
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AGUARDANDO_VALIDACAO' } }),
    );
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
  });

  it('unidade confirma a recolha mesmo aprovada como Aguardando Patrimônio — a etapa não é um pré-requisito (feedback 27/08)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'AGUARDANDO_ENTREGA',
      unidadeDestinoId: 'galpao-1',
      pedidoEntregaRegistradoEm: null,
    } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'AGUARDANDO_VALIDACAO',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recolha')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send();
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AGUARDANDO_VALIDACAO' } }),
    );
  });

  it('unidade não vê solicitação de outras unidades', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacaoBase as never);
    const res = await request(app)
      .get('/solicitacoes/sol-1')
      .set(auth('UNIDADE', { unidadeId: 'unidade-999' }));
    expect(res.status).toBe(403);
  });
});

describe('Solicitações — Gestor lança no Branet (tombamento + nº do pedido, feedback 17/08)', () => {
  const ampliacaoReservada = {
    ...solicitacaoBase,
    tipo: 'AMPLIACAO',
    status: 'RESERVADO',
    equipamentoId: null,
    equipamento: null,
    tipoEquipamentoId: 'tipo-1',
    quantidade: 1,
  };

  it('lança no Branet: cadastra o tombamento e vira AGUARDANDO_ENTREGA', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(ampliacaoReservada as never);
    prismaMock.equipamento.findMany.mockResolvedValue([] as never);
    prismaMock.equipamento.create.mockResolvedValue({ id: 'eq-novo', unidadeId: 'unidade-1' } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...ampliacaoReservada,
      status: 'AGUARDANDO_ENTREGA',
      numeroPedidoBranet: 'PED-123',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/lancar-branet')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        numeroPedidoBranet: 'PED-123',
        itens: [{ tombamento: '20001/2026', descricao: 'Autoclave nova' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AGUARDANDO_ENTREGA');
    expect(prismaMock.equipamento.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tombamento: '20001/2026', criadoPorSolicitacaoId: 'sol-1' }),
      }),
    );
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: 'AGUARDANDO_ENTREGA',
          numeroPedidoBranet: 'PED-123',
          pedidoEntregaRegistradoEm: expect.any(Date),
        },
      }),
    );
  });

  it('lança no Branet e debita o saldo da ata (item comprado, sem tocar o estoque)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...ampliacaoReservada,
      ataId: 'ata-1',
      valorVinculado: new Prisma.Decimal(5000),
    } as never);
    prismaMock.equipamento.findMany.mockResolvedValue([] as never);
    prismaMock.equipamento.create.mockResolvedValue({ id: 'eq-novo', unidadeId: 'unidade-1' } as never);
    prismaMock.ata.findUnique.mockResolvedValue({ id: 'ata-1', saldo: new Prisma.Decimal(100000) } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...ampliacaoReservada,
      status: 'AGUARDANDO_ENTREGA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/lancar-branet')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        numeroPedidoBranet: 'PED-124',
        itens: [{ tombamento: '20005/2026', descricao: 'Autoclave nova' }],
      });
    expect(res.status).toBe(200);
    expect(prismaMock.ata.update).toHaveBeenCalledWith(expect.objectContaining({ data: { saldo: 95000 } }));
    expect(prismaMock.estoqueGalpao.upsert).not.toHaveBeenCalled();
  });

  it('substituição: lança no Branet e baixa o equipamento antigo', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...ampliacaoReservada,
      tipo: 'SUBSTITUICAO',
      equipamentoId: 'eq-1',
      equipamento: { ...solicitacaoBase.equipamento, status: 'ATIVO' },
    } as never);
    prismaMock.equipamento.findMany.mockResolvedValue([] as never);
    prismaMock.equipamento.create.mockResolvedValue({ id: 'eq-novo', unidadeId: 'unidade-1' } as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...ampliacaoReservada,
      tipo: 'SUBSTITUICAO',
      status: 'AGUARDANDO_ENTREGA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/lancar-branet')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        numeroPedidoBranet: 'PED-125',
        itens: [{ tombamento: '20002/2026', descricao: 'Autoclave nova' }],
      });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'eq-1' },
        data: { status: 'BAIXADO', motivoBaixa: 'SUBSTITUICAO' },
      }),
    );
  });

  it('bloqueia tombamento já cadastrado em outro equipamento (RN01)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(ampliacaoReservada as never);
    prismaMock.equipamento.findMany.mockResolvedValue([{ tombamento: '20001/2026' }] as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/lancar-branet')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        numeroPedidoBranet: 'PED-126',
        itens: [{ tombamento: '20001/2026', descricao: 'Autoclave' }],
      });
    expect(res.status).toBe(409);
  });

  it('exige o tombamento de todos os itens da quantidade solicitada', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({ ...ampliacaoReservada, quantidade: 2 } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/lancar-branet')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        numeroPedidoBranet: 'PED-127',
        itens: [{ tombamento: '20001/2026', descricao: 'Autoclave' }],
      });
    expect(res.status).toBe(422);
  });

  it('bloqueia lançar no Branet fora do status Reservado', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...ampliacaoReservada,
      status: 'AGUARDANDO_DISPONIBILIDADE',
    } as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([]);
    const res = await request(app)
      .post('/solicitacoes/sol-1/lancar-branet')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({
        numeroPedidoBranet: 'PED-128',
        itens: [{ tombamento: '20001/2026', descricao: 'Autoclave' }],
      });
    expect(res.status).toBe(422);
  });

  it('bloqueia o Galpão de lançar no Branet (só o Gestor de Patrimônio)', async () => {
    const res = await request(app)
      .post('/solicitacoes/sol-1/lancar-branet')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }))
      .send({ numeroPedidoBranet: 'PED-129', itens: [{ tombamento: '1', descricao: 'x' }] });
    expect(res.status).toBe(403);
  });
});

describe('Solicitações — confirmação de recebimento OK/Não OK (feedback 17/08)', () => {
  const aguardandoEntrega = {
    ...solicitacaoBase,
    tipo: 'AMPLIACAO',
    status: 'AGUARDANDO_ENTREGA',
    equipamentoId: null,
    equipamento: null,
    tipoEquipamentoId: 'tipo-1',
    quantidade: 1,
    itensGerados: [{ id: EQUIP_UUID, tombamento: '20001/2026', descricao: 'Autoclave nova' }],
  };

  it('OK com tombamento batendo: vira AGUARDANDO_VALIDACAO sem anomalia', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(aguardandoEntrega as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...aguardandoEntrega,
      status: 'AGUARDANDO_VALIDACAO',
      recebimentoOk: true,
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ ok: true, itens: [{ equipamentoId: EQUIP_UUID, tombamentoConfirmado: '20001/2026' }] });
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'AGUARDANDO_VALIDACAO', recebimentoOk: true, observacaoRecebimento: null },
      }),
    );
  });

  it('OK com tombamento divergente: vira anomalia automaticamente', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(aguardandoEntrega as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...aguardandoEntrega,
      status: 'AGUARDANDO_VALIDACAO',
      recebimentoOk: false,
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ ok: true, itens: [{ equipamentoId: EQUIP_UUID, tombamentoConfirmado: '99999/2026' }] });
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recebimentoOk: false,
          observacaoRecebimento: expect.stringContaining('Divergência de patrimônio'),
        }),
      }),
    );
  });

  it('Não OK exige observação', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(aguardandoEntrega as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ ok: false });
    expect(res.status).toBe(422);
  });

  it('bloqueia o Gestor de Patrimônio de confirmar recebimento — só a Unidade (feedback 18/08)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(aguardandoEntrega as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ ok: true, itens: [{ equipamentoId: EQUIP_UUID, tombamentoConfirmado: '20001/2026' }] });
    expect(res.status).toBe(403);
    expect(prismaMock.solicitacao.update).not.toHaveBeenCalled();
  });

  it('Não OK com observação: vira AGUARDANDO_VALIDACAO com o motivo registrado', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(aguardandoEntrega as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...aguardandoEntrega,
      status: 'AGUARDANDO_VALIDACAO',
      recebimentoOk: false,
      observacaoRecebimento: 'Item chegou danificado',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/confirmar-recebimento')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ ok: false, observacao: 'Item chegou danificado' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AGUARDANDO_VALIDACAO');
  });
});

describe('Solicitações — validação final, ajuste de tombamento e conclusão', () => {
  const aguardandoValidacao = {
    ...solicitacaoBase,
    tipo: 'AMPLIACAO',
    status: 'AGUARDANDO_VALIDACAO',
    equipamentoId: null,
    equipamento: null,
    tipoEquipamentoId: 'tipo-1',
    itensGerados: [{ id: EQUIP_UUID, tombamento: '99999/2026', descricao: 'Autoclave nova' }],
  };

  it('Patrimônio conclui a solicitação depois que a unidade confirmou', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(aguardandoValidacao as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...aguardandoValidacao,
      status: 'CONCLUIDA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/concluir')
      .set(auth('GESTOR_PATRIMONIO'))
      .send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONCLUIDA');
  });

  it('não deixa concluir antes da unidade confirmar', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...aguardandoValidacao,
      status: 'AGUARDANDO_ENTREGA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/concluir')
      .set(auth('GESTOR_PATRIMONIO'))
      .send();
    expect(res.status).toBe(422);
  });

  it('Patrimônio conclui a recolha: move o equipamento pro galpão e registra a movimentação (feedback 26/08)', async () => {
    const recolhaAguardandoValidacao = {
      ...solicitacaoBase,
      tipo: 'RECOLHA',
      status: 'AGUARDANDO_VALIDACAO',
      equipamentoId: 'eq-1',
      unidadeDestinoId: 'galpao-1',
      itensGerados: [],
    };
    prismaMock.solicitacao.findUnique.mockResolvedValue(recolhaAguardandoValidacao as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...recolhaAguardandoValidacao,
      status: 'CONCLUIDA',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/concluir')
      .set(auth('GESTOR_PATRIMONIO'))
      .send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CONCLUIDA');
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'eq-1' }, data: { unidadeId: 'galpao-1' } }),
    );
    expect(prismaMock.movimentacao.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipo: 'RECOLHA', unidadeDestinoId: 'galpao-1' }) }),
    );
  });

  it('Gestor ajusta o tombamento divergente antes de concluir (exceção estreita à RN01)', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(aguardandoValidacao as never);
    prismaMock.equipamento.findMany.mockResolvedValue([] as never);
    prismaMock.solicitacao.update.mockResolvedValue(aguardandoValidacao as never);
    const res = await request(app)
      .patch('/solicitacoes/sol-1/ajustar-tombamento')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ itens: [{ equipamentoId: EQUIP_UUID, tombamento: '20001/2026' }] });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EQUIP_UUID },
        data: expect.objectContaining({ tombamento: '20001/2026' }),
      }),
    );
  });

  it('bloqueia ajustar tombamento fora de Aguardando Validação', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({
      ...aguardandoValidacao,
      status: 'AGUARDANDO_ENTREGA',
    } as never);
    const res = await request(app)
      .patch('/solicitacoes/sol-1/ajustar-tombamento')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ itens: [{ equipamentoId: EQUIP_UUID, tombamento: '20001/2026' }] });
    expect(res.status).toBe(422);
  });

  it('bloqueia ajustar tombamento de equipamento que não pertence à solicitação', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(aguardandoValidacao as never);
    const res = await request(app)
      .patch('/solicitacoes/sol-1/ajustar-tombamento')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ itens: [{ equipamentoId: 'eq-de-outra-solicitacao', tombamento: '20001/2026' }] });
    expect(res.status).toBe(422);
  });
});

describe('Solicitações — sinalização de disponibilidade (card avisa quando já dá pra reservar)', () => {
  const ampliacaoAguardando = {
    ...solicitacaoBase,
    id: 'sol-2',
    tipo: 'AMPLIACAO',
    equipamentoId: null,
    equipamento: null,
    status: 'AGUARDANDO_DISPONIBILIDADE',
    tipoEquipamentoId: 'tipo-1',
    tipoEquipamento: { id: 'tipo-1', nome: 'Autoclave', codigo: 'AUT' },
    quantidade: 3,
  };

  it('GET /solicitacoes/:id sinaliza disponivelParaReserva quando já chegou estoque suficiente', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(ampliacaoAguardando as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([
      { id: 'est-1', unidadeId: 'galpao-1', tipoEquipamentoId: 'tipo-1', quantidade: 5 },
    ] as never);
    const res = await request(app)
      .get('/solicitacoes/sol-2')
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.disponivelParaReserva).toBe(true);
  });

  it('GET /solicitacoes/:id não sinaliza quando o estoque de nenhum galpão sozinho basta', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(ampliacaoAguardando as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([
      { id: 'est-1', unidadeId: 'galpao-1', tipoEquipamentoId: 'tipo-1', quantidade: 2 },
    ] as never);
    const res = await request(app)
      .get('/solicitacoes/sol-2')
      .set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    expect(res.body.disponivelParaReserva).toBe(false);
  });

  it('GET /solicitacoes marca disponivelParaReserva só nos itens aguardando disponibilidade', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([
      ampliacaoAguardando,
      { ...solicitacaoBase, id: 'sol-3', status: 'PENDENTE_APROVACAO' },
    ] as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([
      { id: 'est-1', unidadeId: 'galpao-1', tipoEquipamentoId: 'tipo-1', quantidade: 10 },
    ] as never);
    const res = await request(app).get('/solicitacoes').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(200);
    const [aguardando, pendente] = res.body;
    expect(aguardando.disponivelParaReserva).toBe(true);
    expect(pendente.disponivelParaReserva).toBe(false);
  });

  it('ordena Aguardando Disponibilidade por prioridade + antiguidade (feedback 17/08)', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([] as never);
    prismaMock.estoqueGalpao.findMany.mockResolvedValue([] as never);
    await request(app)
      .get('/solicitacoes?status=AGUARDANDO_DISPONIBILIDADE')
      .set(auth('GESTOR_PATRIMONIO'));
    expect(prismaMock.solicitacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ prioridade: { sort: 'asc', nulls: 'last' } }, { criadoEm: 'asc' }],
      }),
    );
  });

  it('mantém mais recente primeiro nos demais filtros', async () => {
    prismaMock.solicitacao.findMany.mockResolvedValue([] as never);
    await request(app).get('/solicitacoes').set(auth('GESTOR_PATRIMONIO'));
    expect(prismaMock.solicitacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ criadoEm: 'desc' }] }),
    );
  });
});

describe('Solicitações — anexo (PDF ou imagem, feedback 17/08)', () => {
  it('unidade de origem anexa um arquivo à própria solicitação', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue(solicitacaoBase as never);
    prismaMock.solicitacao.update.mockResolvedValue({
      ...solicitacaoBase,
      anexoUrl: '/uploads/solicitacoes/anexo.pdf',
    } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/anexo')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .attach('anexo', Buffer.from('%PDF-1.4 fake'), { filename: 'comprovante.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(prismaMock.solicitacao.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ anexoUrl: expect.stringContaining('/uploads/solicitacoes/') }) }),
    );
  });

  it('exige o arquivo no campo anexo', async () => {
    const res = await request(app)
      .post('/solicitacoes/sol-1/anexo')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }));
    expect(res.status).toBe(422);
  });
});
