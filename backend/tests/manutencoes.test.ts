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
  contratoItemId: null,
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
  equipamento: {
    ...equipamentoAtivo,
    tipoEquipamento: { nome: 'Autoclave', permitePreventiva: true, permiteCorretiva: true, preco: null },
  },
  unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
  solicitante: { nome: 'Rodrigo' },
  decididoPor: null,
  contrato: null,
};

const ITEM = '66666666-6666-4666-8666-666666666666';
// O orçamento é lançado só pela terceirizada do contrato: manutenção ligada ao prestador dela
const MAN_ID = '99999999-9999-4999-8999-999999999999';
const terc = () => auth('TERCEIRIZADA', { sub: 'terc-1', prestadorId: 'prestador-1' });
const contratoDoPrestador = { id: 'ct-1', numero: 'CONT-1', prestadorId: 'prestador-1', prestador: { nome: 'Tecnomed' } };
const itemDoContrato = {
  id: ITEM,
  contratoId: 'ct-1',
  valor: 10000,
  contrato: { status: 'ATIVO' },
  escopo: { nome: 'Preventiva e corretiva', cobrePreventiva: true, cobreCorretiva: true },
};

function comprometido(total: number | null) {
  prismaMock.$queryRaw.mockResolvedValue((total === null ? [] : [{ item: ITEM, total }]) as never);
}

function comTipo(tipo: Record<string, unknown>) {
  return {
    ...manutencaoBase,
    equipamento: { ...manutencaoBase.equipamento, tipoEquipamento: { ...manutencaoBase.equipamento.tipoEquipamento, ...tipo } },
  };
}

describe('Fluxo de manutenção (UC05-UC09, RF11-RF19)', () => {
  it('Unidade abre solicitação para equipamento próprio (RF11)', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    prismaMock.manutencao.create.mockResolvedValue(manutencaoBase as never);
    const res = await request(app)
      .post('/manutencoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        equipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6',
        titulo: 'Autoclave da sala 2',
        descricaoProblema: 'Não atinge a temperatura adequada',
      });
    expect(res.status).toBe(201);
    // Só a descrição do problema é pedida: nenhuma justificativa é gravada
    expect(prismaMock.manutencao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ justificativa: expect.anything() }),
      }),
    );
  });

  it('o título é obrigatório: grava aparado e recusa ausente ou em branco', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue(equipamentoAtivo as never);
    prismaMock.manutencao.create.mockResolvedValue(manutencaoBase as never);
    const corpo = { equipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6', descricaoProblema: 'Não atinge a temperatura adequada' };
    const ok = await request(app).post('/manutencoes').set(auth('UNIDADE', { unidadeId: 'unidade-1' })).send({ ...corpo, titulo: '  Autoclave da sala 2  ' });
    expect(ok.status).toBe(201);
    expect((prismaMock.manutencao.create.mock.calls[0][0] as { data: { titulo: string } }).data.titulo).toBe('Autoclave da sala 2');

    prismaMock.manutencao.create.mockClear();
    const ausente = await request(app).post('/manutencoes').set(auth('UNIDADE', { unidadeId: 'unidade-1' })).send(corpo);
    const emBranco = await request(app).post('/manutencoes').set(auth('UNIDADE', { unidadeId: 'unidade-1' })).send({ ...corpo, titulo: '   ' });
    expect(ausente.status).toBe(422);
    expect(emBranco.status).toBe(422);
    expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
  });

  it('recusa título longo demais e a busca procura no título', async () => {
    const longo = await request(app)
      .post('/manutencoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ equipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6', descricaoProblema: 'Não liga mais', titulo: 'a'.repeat(81) });
    expect(longo.status).toBe(422);
    prismaMock.manutencao.findMany.mockResolvedValue([]);
    await request(app).get('/manutencoes?busca=autoclave').set(auth('OPERADOR'));
    const where = (prismaMock.manutencao.findMany.mock.calls[0][0] as { where: { OR: unknown[] } }).where;
    expect(where.OR).toContainEqual({ titulo: { contains: 'autoclave', mode: 'insensitive' } });
  });

  it('exige a descrição do problema', async () => {
    const res = await request(app)
      .post('/manutencoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({ equipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6', descricaoProblema: 'ab' });
    expect(res.status).toBe(422);
    expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
  });

  it('bloqueia solicitação de manutenção para tipo de item que não permite manutenção', async () => {
    prismaMock.equipamento.findUnique.mockResolvedValue({
      ...equipamentoAtivo,
      tipoEquipamento: { nome: 'Mobiliário', permitePreventiva: false, permiteCorretiva: false },
    } as never);
    const res = await request(app)
      .post('/manutencoes')
      .set(auth('UNIDADE', { unidadeId: 'unidade-1' }))
      .send({
        equipamentoId: '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6',
        titulo: 'Cadeira',
        descricaoProblema: 'Quebrada',
      });
    expect(res.status).toBe(422);
    expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
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
        titulo: 'Autoclave da sala 2',
        descricaoProblema: 'Problema qualquer',
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
    prismaMock.contratoItem.findUnique.mockResolvedValue(itemDoContrato as never);
    comprometido(null);
    prismaMock.usuario.findMany.mockResolvedValue([] as never);
    const res = await request(app)
      .post('/manutencoes/man-1/aprovar')
      .set(auth('OPERADOR'))
      .send({ contratoItemId: ITEM });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
      data: { status: 'EM_MANUTENCAO' },
    });
    expect(prismaMock.movimentacao.create).toHaveBeenCalled();
    expect(prismaMock.notificacao.create).toHaveBeenCalled();
  });

  const aprovarComItem = () =>
    request(app).post('/manutencoes/man-1/aprovar').set(auth('OPERADOR')).send({ contratoItemId: ITEM });

  it('aprovação vincula o item de contrato e herda o contrato dele', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(manutencaoBase as never);
    prismaMock.contratoItem.findUnique.mockResolvedValue(itemDoContrato as never);
    comprometido(2000);
    prismaMock.manutencao.update.mockResolvedValue({ ...manutencaoBase, status: 'AGUARDANDO_ORCAMENTO' } as never);
    prismaMock.usuario.findMany.mockResolvedValue([] as never);
    const res = await aprovarComItem();
    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({
      contratoItemId: ITEM,
      contratoId: 'ct-1',
    });
  });

  it('aprovação exige escolher o item de contrato', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(manutencaoBase as never);
    const res = await request(app).post('/manutencoes/man-1/aprovar').set(auth('OPERADOR')).send({});
    expect(res.status).toBe(422);
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
  });

  it('aprovação rejeita item inexistente, de contrato expirado ou sem saldo', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(manutencaoBase as never);
    comprometido(null);
    prismaMock.contratoItem.findUnique.mockResolvedValueOnce(null);
    expect((await aprovarComItem()).status).toBe(422);

    prismaMock.contratoItem.findUnique.mockResolvedValueOnce({
      ...itemDoContrato,
      contrato: { status: 'EXPIRADO' },
    } as never);
    expect((await aprovarComItem()).status).toBe(422);

    prismaMock.contratoItem.findUnique.mockResolvedValueOnce(itemDoContrato as never);
    comprometido(10000);
    const semSaldo = await aprovarComItem();
    expect(semSaldo.status).toBe(422);
    expect(semSaldo.body.mensagem ?? semSaldo.body.message ?? JSON.stringify(semSaldo.body)).toMatch(/saldo/i);
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
  });

  it('item que só permite corretiva não aceita escopo só preventivo', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(comTipo({ permitePreventiva: false }) as never);
    comprometido(null);
    prismaMock.contratoItem.findUnique.mockResolvedValueOnce({
      ...itemDoContrato,
      escopo: { nome: 'Preventiva', cobrePreventiva: true, cobreCorretiva: false },
    } as never);
    expect((await aprovarComItem()).status).toBe(422);

    prismaMock.contratoItem.findUnique.mockResolvedValueOnce({
      ...itemDoContrato,
      escopo: { nome: 'Preventiva e corretiva', cobrePreventiva: true, cobreCorretiva: true },
    } as never);
    prismaMock.manutencao.update.mockResolvedValue({ ...manutencaoBase, status: 'AGUARDANDO_ORCAMENTO' } as never);
    prismaMock.usuario.findMany.mockResolvedValue([] as never);
    expect((await aprovarComItem()).status).toBe(200);
  });

  describe('orçamento', () => {
    const orcar = (valor: number) =>
      request(app).post(`/manutencoes/${MAN_ID}/orcamento`).set(terc()).send({ valor });
    const aguardando = (extra: Record<string, unknown> = {}) =>
      ({ ...comTipo({ preco: '10000' }), status: 'AGUARDANDO_ORCAMENTO', contratoItemId: ITEM, contrato: contratoDoPrestador, ...extra }) as never;

    it('orçamento a partir de 50% do preço de referência NÃO é bloqueado: o aviso ao administrador é na tela', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ contratoItemId: null }));
      prismaMock.manutencao.update.mockResolvedValue({ ...manutencaoBase, status: 'ORCAMENTO_REGISTRADO' } as never);
      expect((await orcar(5000)).status).toBe(200);
      expect((await orcar(9000)).status).toBe(200);
    });

    it('aceita orçamento abaixo de 50% e dentro do saldo; recusa acima do saldo', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando());
      prismaMock.contratoItem.findUnique.mockResolvedValue({ ...itemDoContrato, valor: 5000 } as never);
      comprometido(2000);
      prismaMock.manutencao.update.mockResolvedValue({ ...manutencaoBase, status: 'ORCAMENTO_REGISTRADO' } as never);
      expect((await orcar(3000)).status).toBe(200);
      expect((await orcar(3500)).status).toBe(422);
    });
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
      .set(auth('OPERADOR'))
      .send({ motivo: 'Não justificada' });
    expect(res.status).toBe(200);
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
    expect(prismaMock.notificacao.create).toHaveBeenCalled();
  });

  it('depois da aprovação o Administrador não nega: o chamado está com a terceirizada', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'AGUARDANDO_ORCAMENTO',
      contratoItemId: ITEM,
    } as never);
    const res = await request(app).post('/manutencoes/man-1/negar').set(auth('OPERADOR')).send({ motivo: 'Sem saldo no item' });
    expect(res.status).toBe(422);
    expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
  });

  it('não permite aprovar manutenção já decidida', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'CONCLUIDA',
    } as never);
    const res = await request(app)
      .post('/manutencoes/man-1/aprovar')
      .set(auth('OPERADOR'))
      .send({});
    expect(res.status).toBe(422);
  });

  it('registra orçamento da terceirizada (RF14)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'AGUARDANDO_ORCAMENTO',
      contrato: contratoDoPrestador,
    } as never);
    prismaMock.manutencao.update.mockResolvedValue({
      ...manutencaoBase,
      status: 'ORCAMENTO_REGISTRADO',
      orcamentoValor: 1850,
    } as never);
    const res = await request(app)
      .post(`/manutencoes/${MAN_ID}/orcamento`)
      .set(terc())
      .send({ valor: 1850 });
    expect(res.status).toBe(200);
  });

  it('em execução o Administrador não marca retorno nem emite baixa: só a terceirizada conclui o reparo', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({ ...manutencaoBase, status: 'EM_EXECUCAO' } as never);
    for (const perfil of ['OPERADOR', 'UNIDADE', 'GALPAO'] as const) {
      const res = await request(app)
        .post(`/manutencoes/${MAN_ID}/registrar-retorno`)
        .set(auth(perfil, { unidadeId: 'unidade-1' }))
        .send({});
      expect([perfil, res.status]).toEqual([perfil, 403]);
    }
    // a rota avulsa de baixa não existe mais (a baixa nasce da rejeição do orçamento)
    const baixa = await request(app).post(`/manutencoes/${MAN_ID}/baixa`).set(auth('OPERADOR')).send({});
    expect(baixa.status).toBe(404);
    expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
    expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
  });

  it('o Administrador não registra orçamento: é só da terceirizada', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'AGUARDANDO_ORCAMENTO',
    } as never);
    for (const perfil of ['OPERADOR', 'UNIDADE', 'GALPAO'] as const) {
      const res = await request(app)
        .post(`/manutencoes/${MAN_ID}/orcamento`)
        .set(auth(perfil, { unidadeId: 'unidade-1' }))
        .send({ valor: 1850 });
      expect([perfil, res.status]).toEqual([perfil, 403]);
    }
    expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
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
      .set(auth('OPERADOR'))
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
      .set(auth('OPERADOR'))
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
      .set(auth('OPERADOR'))
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

describe('Histórico e auditoria da manutenção', () => {
  const abertura = new Date('2026-10-01T10:00:00.000Z');

  it('o histórico mostra como Administrador os perfis antigos que foram unificados', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({ ...manutencaoBase, criadoEm: abertura } as never);
    prismaMock.logAuditoria.findMany.mockResolvedValue([
      { id: 'l1', acao: 'CONFIRMAR_RETORNO_MANUTENCAO', criadoEm: abertura, dadosDepois: { perfil: 'GESTOR_MANUTENCAO' }, usuario: { nome: 'Carla' } },
      { id: 'l2', acao: 'CONFIRMAR_RETORNO_MANUTENCAO', criadoEm: abertura, dadosDepois: { perfil: 'UNIDADE' }, usuario: { nome: 'Rodrigo' } },
    ] as never);
    const res = await request(app).get('/manutencoes/man-1/historico').set(auth('OPERADOR'));
    expect(res.body[1].perfil).toBe('OPERADOR');
    expect(res.body[2].perfil).toBe('UNIDADE');
  });

  it('GET /manutencoes/:id/historico traz a abertura e os eventos, sem payload bruto', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({ ...manutencaoBase, criadoEm: abertura } as never);
    prismaMock.logAuditoria.findMany.mockResolvedValue([
      {
        id: 'l1',
        acao: 'APROVAR_MANUTENCAO',
        criadoEm: new Date('2026-10-02T09:00:00.000Z'),
        dadosDepois: { status: 'AGUARDANDO_ORCAMENTO', segredo: 'x' },
        usuario: { nome: 'Gestor' },
      },
      {
        id: 'l2',
        acao: 'CONFIRMAR_RETORNO_MANUTENCAO',
        criadoEm: new Date('2026-10-03T09:00:00.000Z'),
        dadosDepois: { perfil: 'UNIDADE' },
        usuario: { nome: 'Rodrigo' },
      },
    ] as never);

    const res = await request(app).get('/manutencoes/man-1/historico').set(auth('OPERADOR'));

    expect(res.status).toBe(200);
    expect(prismaMock.logAuditoria.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entidade: 'manutencao', entidadeId: 'man-1' },
        orderBy: { criadoEm: 'asc' },
      }),
    );
    expect(res.body.map((e: { acao: string }) => e.acao)).toEqual([
      'ABRIR_MANUTENCAO',
      'APROVAR_MANUTENCAO',
      'CONFIRMAR_RETORNO_MANUTENCAO',
    ]);
    expect(res.body[0]).toMatchObject({ usuario: 'Rodrigo', criadoEm: abertura.toISOString() });
    expect(res.body[2]).toMatchObject({ perfil: 'UNIDADE' });
    expect(JSON.stringify(res.body)).not.toContain('segredo');
  });

  it('bloqueia o histórico para unidade de outra manutenção', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(manutencaoBase as never);
    const res = await request(app)
      .get('/manutencoes/man-1/historico')
      .set(auth('UNIDADE', { unidadeId: 'outra' }));
    expect(res.status).toBe(403);
    expect(prismaMock.logAuditoria.findMany).not.toHaveBeenCalled();
  });

  it('registrar orçamento e retorno geram auditoria', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({ ...manutencaoBase, status: 'AGUARDANDO_ORCAMENTO', contrato: contratoDoPrestador } as never);
    prismaMock.manutencao.update.mockResolvedValue({ ...manutencaoBase, status: 'ORCAMENTO_REGISTRADO' } as never);
    let res = await request(app).post(`/manutencoes/${MAN_ID}/orcamento`).set(terc()).send({ valor: 100 });
    expect(res.status).toBe(200);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'REGISTRAR_ORCAMENTO', entidade: 'manutencao', entidadeId: MAN_ID }) }),
    );

    prismaMock.logAuditoria.create.mockClear();
    prismaMock.manutencao.update.mockResolvedValue({ ...manutencaoBase, status: 'AGUARDANDO_RETORNO' } as never);
    prismaMock.manutencao.findUnique.mockResolvedValue({
      ...manutencaoBase,
      status: 'EM_EXECUCAO',
      orcamentoValor: '1000',
      contrato: contratoDoPrestador,
    } as never);
    res = await request(app).post(`/manutencoes/${MAN_ID}/registrar-retorno`).set(terc()).send({});
    expect(res.status).toBe(200);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'REGISTRAR_RETORNO_MANUTENCAO' }) }),
    );
  });

  it('cada confirmação de retorno é auditada com o perfil de quem confirmou', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue({ ...manutencaoBase, status: 'AGUARDANDO_RETORNO' } as never);
    prismaMock.manutencao.update.mockResolvedValue({ ...manutencaoBase, status: 'AGUARDANDO_RETORNO', confirmadoGestor: true } as never);
    const res = await request(app).post('/manutencoes/man-1/confirmar-retorno').set(auth('OPERADOR')).send({});
    expect(res.status).toBe(200);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: 'CONFIRMAR_RETORNO_MANUTENCAO',
          dadosDepois: expect.objectContaining({ perfil: 'OPERADOR' }),
        }),
      }),
    );
  });
});

describe('Leitura de manutenções: quem acessa', () => {
  it('o Galpão não lê manutenções nem o histórico (valores de contrato e dados de outras unidades)', async () => {
    const galpao = auth('GALPAO', { unidadeId: 'g-1' });
    const ID = '99999999-9999-4999-8999-999999999999';
    for (const rota of ['/manutencoes', `/manutencoes/${ID}`, `/manutencoes/${ID}/historico`]) {
      const res = await request(app).get(rota).set(galpao);
      expect([rota, res.status]).toEqual([rota, 403]);
    }
    expect(prismaMock.manutencao.findMany).not.toHaveBeenCalled();
    expect(prismaMock.manutencao.findUnique).not.toHaveBeenCalled();
  });

  it('o filtro de status só aceita um status de manutenção (valor inválido é 422, não erro do banco)', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([] as never);
    expect((await request(app).get('/manutencoes?status=RESERVADO').set(auth('OPERADOR'))).status).toBe(422);
    expect((await request(app).get('/manutencoes?status=EM_EXECUCAO&status=NEGADA').set(auth('OPERADOR'))).status).toBe(422);
    expect((await request(app).get('/manutencoes?status=EM_EXECUCAO').set(auth('OPERADOR'))).status).toBe(200);
    expect((await request(app).get('/manutencoes?status=toString').set(auth('OPERADOR'))).status).toBe(422);
    expect((await request(app).get('/manutencoes?status=constructor').set(auth('OPERADOR'))).status).toBe(422);
    expect((await request(app).get('/manutencoes?tipo=toString').set(auth('OPERADOR'))).status).toBe(422);
    expect((await request(app).get('/manutencoes?tipo=constructor').set(auth('OPERADOR'))).status).toBe(422);
    expect((await request(app).get('/manutencoes?tipo=CIVIL').set(auth('OPERADOR'))).status).toBe(200);
    // status válido + tipo válido: só esses dois chegam ao banco
    expect(prismaMock.manutencao.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('Terceirizada (prestador de serviço)', () => {
  const PRESTADOR = 'prestador-1';
  const MAN = '99999999-9999-4999-8999-999999999999';
  const terceirizada = () => auth('TERCEIRIZADA', { sub: 'terc-1', prestadorId: PRESTADOR });
  const doContrato = (prestadorId: string, extra: Record<string, unknown> = {}) =>
    ({
      ...manutencaoBase,
      status: 'AGUARDANDO_ORCAMENTO',
      contrato: { id: 'ct-1', numero: 'CONT-1', prestadorId, prestador: { nome: 'Tecnomed' } },
      ...extra,
    }) as never;

  it('a lista traz só as manutenções dos contratos do próprio prestador (filtro vem do token)', async () => {
    prismaMock.manutencao.findMany.mockResolvedValue([] as never);
    const res = await request(app).get('/manutencoes?status=EM_EXECUCAO').set(terceirizada());
    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.findMany.mock.calls[0][0]?.where).toMatchObject({
      contrato: { prestadorId: PRESTADOR },
      status: 'EM_EXECUCAO',
    });
  });

  it('não abre manutenção de contrato de outro prestador nem sem contrato', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValueOnce(doContrato('outro-prestador'));
    expect((await request(app).get(`/manutencoes/${MAN}`).set(terceirizada())).status).toBe(403);
    prismaMock.manutencao.findUnique.mockResolvedValueOnce(manutencaoBase as never);
    expect((await request(app).get(`/manutencoes/${MAN}`).set(terceirizada())).status).toBe(403);
    prismaMock.manutencao.findUnique.mockResolvedValueOnce(doContrato(PRESTADOR));
    expect((await request(app).get(`/manutencoes/${MAN}`).set(terceirizada())).status).toBe(200);
  });

  it('não expõe o e-mail institucional da unidade à terceirizada (o administrador continua recebendo)', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(doContrato(PRESTADOR));
    const terc = await request(app).get(`/manutencoes/${MAN}`).set(terceirizada());
    expect(terc.status).toBe(200);
    expect(terc.body.unidade).toEqual({ id: 'unidade-1', nome: 'UBS Centro' });
    prismaMock.manutencao.findMany.mockResolvedValue([doContrato(PRESTADOR)] as never);
    const lista = await request(app).get('/manutencoes').set(terceirizada());
    expect(lista.body[0].unidade).not.toHaveProperty('emailBase');
    prismaMock.manutencao.findUnique.mockResolvedValue(doContrato(PRESTADOR));
    const adm = await request(app).get(`/manutencoes/${MAN}`).set(auth('OPERADOR'));
    expect(adm.body.unidade.emailBase).toBe('ubs@jlle.gov');
  });

  it('lança o orçamento do próprio contrato; o item de contrato enviado é ignorado', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(doContrato(PRESTADOR, { contratoItemId: ITEM }));
    prismaMock.contratoItem.findUnique.mockResolvedValue({ ...itemDoContrato, valor: 5000 } as never);
    comprometido(null);
    prismaMock.manutencao.update.mockResolvedValue({ ...manutencaoBase, status: 'ORCAMENTO_REGISTRADO' } as never);
    const res = await request(app)
      .post(`/manutencoes/${MAN}/orcamento`)
      .set(terceirizada())
      .send({ valor: 1200, contratoItemId: '88888888-8888-4888-8888-888888888888' });
    expect(res.status).toBe(200);
    expect(prismaMock.manutencao.update.mock.calls[0][0].data).not.toHaveProperty('contratoItemId', '88888888-8888-4888-8888-888888888888');
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('não lança orçamento em manutenção de outro prestador', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(doContrato('outro-prestador'));
    const res = await request(app).post(`/manutencoes/${MAN}/orcamento`).set(terceirizada()).send({ valor: 100 });
    expect(res.status).toBe(403);
    expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
  });

  it('confirma o fim do reparo, com custo até o orçamento aprovado', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(
      doContrato(PRESTADOR, { status: 'EM_EXECUCAO', orcamentoValor: '1000' }),
    );
    prismaMock.manutencao.update.mockResolvedValue({ ...manutencaoBase, status: 'AGUARDANDO_RETORNO' } as never);
    const acima = await request(app).post(`/manutencoes/${MAN}/registrar-retorno`).set(terceirizada()).send({ custoFinal: 1500 });
    expect(acima.status).toBe(422);
    const ok = await request(app).post(`/manutencoes/${MAN}/registrar-retorno`).set(terceirizada()).send({ custoFinal: 900 });
    expect(ok.status).toBe(200);
    expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({ status: 'AGUARDANDO_RETORNO' });
  });

  it('recusa custo final zero, acima do orçamento ou retorno sem orçamento', async () => {
    prismaMock.manutencao.findUnique.mockResolvedValue(
      doContrato(PRESTADOR, { status: 'EM_EXECUCAO', orcamentoValor: '1000' }),
    );
    expect(
      (await request(app).post(`/manutencoes/${MAN}/registrar-retorno`).set(terceirizada()).send({ custoFinal: 0 }))
        .status,
    ).toBe(422);
    prismaMock.manutencao.findUnique.mockResolvedValue(
      doContrato(PRESTADOR, { status: 'EM_EXECUCAO', orcamentoValor: null }),
    );
    expect((await request(app).post(`/manutencoes/${MAN}/registrar-retorno`).set(terceirizada()).send({})).status).toBe(
      422,
    );
    expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
  });

  it('não decide: aprovar, negar, validar orçamento, baixa e confirmar retorno são bloqueados', async () => {
    const ID = 'man-1';
    const alvo = [
      ['/aprovar', { contratoItemId: ITEM }],
      ['/negar', { motivo: 'não' }],
      ['/validar-orcamento', { aprovado: true }],
      ['/baixa', {}],
      ['/confirmar-retorno', {}],
    ] as const;
    for (const [rota, corpo] of alvo) {
      const res = await request(app).post(`/manutencoes/${ID}${rota}`).set(terceirizada()).send(corpo);
      expect(res.status).toBe(403);
    }
    expect((await request(app).post('/manutencoes').set(terceirizada()).send({})).status).toBe(403);
  });
});
