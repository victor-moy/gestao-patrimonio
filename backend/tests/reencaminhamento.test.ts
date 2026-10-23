import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();

const MAN = '99999999-9999-4999-8999-999999999999';
const NOVO = '88888888-8888-4888-8888-888888888888';
const EQ = '11111111-1111-4111-8111-111111111111';
const EQ_OUTRO = '22222222-2222-4222-8222-222222222222';
const admin = () => auth('OPERADOR');
const terc = (prestadorId = 'prestador-1') => auth('TERCEIRIZADA', { sub: 'terc-1', prestadorId });
const unidade = () => auth('UNIDADE', { unidadeId: 'unidade-1' });

const MOTIVO = 'A instalação elétrica está normal; o defeito é no equipamento.';

const contrato = { id: 'ct-1', numero: 'CONT-1', prestadorId: 'prestador-1', prestador: { nome: 'Predial Ltda' } };

const chamado = (extra: Record<string, unknown> = {}) => ({
  id: MAN,
  numero: 7,
  tipo: 'CIVIL',
  equipamentoId: null,
  equipamento: null,
  unidadeId: 'unidade-1',
  solicitanteId: 'user-2',
  titulo: 'Ar-condicionado não liga',
  descricaoProblema: 'O ar-condicionado do consultório não liga',
  localAfetado: 'Consultório 2',
  categoriaCivil: 'ELETRICA',
  fotos: ['/uploads/solicitacoes/f.jpg'],
  status: 'EM_EXECUCAO',
  casoId: null,
  reencaminhadoDeId: null,
  motivoReencaminhamento: null,
  reencaminhamentoConfirmadoEm: null,
  contratoId: 'ct-1',
  contratoItemId: 'item-1',
  orcamentoValor: null,
  custoFinal: null,
  confirmadoUnidade: false,
  confirmadoGestor: false,
  unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
  solicitante: { nome: 'Rodrigo' },
  decididoPor: null,
  contrato,
  contratoItem: null,
  linhasRelatorio: [],
  ...extra,
});

const aguardandoDecisao = (extra: Record<string, unknown> = {}) =>
  chamado({
    status: 'REENCAMINHAMENTO_SOLICITADO',
    motivoReencaminhamento: MOTIVO,
    reencaminhamentoConfirmadoEm: new Date(),
    ...extra,
  });

const equipamentoDe = (extra: Record<string, unknown> = {}) => ({
  id: EQ,
  tombamento: '123/2024',
  descricao: 'Ar-condicionado',
  tipoEquipamentoId: 'tipo-1',
  tipoEquipamento: { nome: 'Ar-condicionado', permitePreventiva: true, permiteCorretiva: true },
  ...extra,
});

describe('Reencaminhamento de chamados', () => {
  describe('solicitar', () => {
    beforeEach(() => {
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
    });

    it('a terceirizada do contrato pede: status próprio, motivo gravado, sem confirmação e com auditoria', async () => {
      prismaMock.manutencao.findUnique
        .mockResolvedValueOnce(chamado() as never)
        .mockResolvedValueOnce(chamado({ status: 'REENCAMINHAMENTO_SOLICITADO', motivoReencaminhamento: MOTIVO }) as never);
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(
        chamado({ status: 'REENCAMINHAMENTO_SOLICITADO', motivoReencaminhamento: MOTIVO }) as never,
      );

      const res = await request(app).post(`/manutencoes/${MAN}/solicitar-reencaminhamento`).set(terc()).send({ motivo: MOTIVO });

      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.updateMany).toHaveBeenCalledWith({
        where: { id: MAN, status: 'EM_EXECUCAO' },
        data: expect.objectContaining({
          status: 'REENCAMINHAMENTO_SOLICITADO',
          motivoReencaminhamento: MOTIVO,
          reencaminhamentoConfirmadoEm: null,
        }),
      });
      expect(prismaMock.logAuditoria.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ acao: 'SOLICITAR_REENCAMINHAMENTO', entidadeId: MAN }) }),
      );
      // E-mail da unidade não vai para a terceirizada
      expect(res.body.unidade.emailBase).toBeUndefined();
    });

    it('o Administrador não pede: só age depois que a terceirizada pedir', async () => {
      const res = await request(app).post(`/manutencoes/${MAN}/solicitar-reencaminhamento`).set(admin()).send({ motivo: MOTIVO });
      expect(res.status).toBe(403);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('terceirizada de outro prestador não pede', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado() as never);
      const res = await request(app).post(`/manutencoes/${MAN}/solicitar-reencaminhamento`).set(terc('prestador-2')).send({ motivo: MOTIVO });
      expect(res.status).toBe(403);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('Unidade e Galpão também não pedem', async () => {
      for (const cabecalho of [unidade(), auth('GALPAO')]) {
        const res = await request(app).post(`/manutencoes/${MAN}/solicitar-reencaminhamento`).set(cabecalho).send({ motivo: MOTIVO });
        expect(res.status).toBe(403);
      }
    });

    it('só enquanto o chamado está com o atendimento', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ status: 'AGUARDANDO_RETORNO' }) as never);
      const res = await request(app).post(`/manutencoes/${MAN}/solicitar-reencaminhamento`).set(terc()).send({ motivo: MOTIVO });
      expect(res.status).toBe(422);
    });

    it('exige um motivo com conteúdo', async () => {
      const res = await request(app).post(`/manutencoes/${MAN}/solicitar-reencaminhamento`).set(terc()).send({ motivo: 'curto' });
      expect(res.status).toBe(422);
    });

    it('pedido concorrente com outra ação não passa (409)', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado() as never);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 0 });
      const res = await request(app).post(`/manutencoes/${MAN}/solicitar-reencaminhamento`).set(terc()).send({ motivo: MOTIVO });
      expect(res.status).toBe(409);
      expect(prismaMock.logAuditoria.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmar', () => {
    it('o Administrador confirma uma vez; a repetição é recusada', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(
        chamado({ status: 'REENCAMINHAMENTO_SOLICITADO', motivoReencaminhamento: MOTIVO }) as never,
      );
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(aguardandoDecisao() as never);
      prismaMock.manutencao.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

      const ok = await request(app).post(`/manutencoes/${MAN}/confirmar-reencaminhamento`).set(admin());
      expect(ok.status).toBe(200);
      expect(prismaMock.manutencao.updateMany).toHaveBeenCalledWith({
        where: { id: MAN, status: 'REENCAMINHAMENTO_SOLICITADO', reencaminhamentoConfirmadoEm: null },
        data: { reencaminhamentoConfirmadoEm: expect.any(Date) },
      });

      const repetido = await request(app).post(`/manutencoes/${MAN}/confirmar-reencaminhamento`).set(admin());
      expect(repetido.status).toBe(409);
    });

    it('só o Administrador confirma', async () => {
      const res = await request(app).post(`/manutencoes/${MAN}/confirmar-reencaminhamento`).set(terc());
      expect(res.status).toBe(403);
    });

    it('chamado sem pedido de reencaminhamento não é confirmado', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado() as never);
      const res = await request(app).post(`/manutencoes/${MAN}/confirmar-reencaminhamento`).set(admin());
      expect(res.status).toBe(422);
    });
  });

  describe('decisão: novo chamado de manutenção', () => {
    const corpo = { tipo: 'EQUIPAMENTO', equipamentoId: EQ };

    beforeEach(() => {
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.equipamento.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.manutencao.create.mockResolvedValue(chamado({ id: NOVO, numero: 8, tipo: 'EQUIPAMENTO', status: 'PENDENTE_APROVACAO', contrato: null }) as never);
    });

    it('civil para equipamento: fecha o atendimento e abre o novo na triagem, sem nada herdado do prestador', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardandoDecisao() as never);
      prismaMock.equipamento.findUnique.mockResolvedValue({
        id: EQ,
        status: 'ATIVO',
        unidadeId: 'unidade-1',
        tipoEquipamento: { nome: 'Ar', permitePreventiva: true, permiteCorretiva: true },
      } as never);

      const res = await request(app).post(`/manutencoes/${MAN}/reencaminhar/manutencao`).set(admin()).send(corpo);

      expect(res.status).toBe(201);
      expect(prismaMock.manutencao.updateMany).toHaveBeenCalledWith({
        where: { id: MAN, status: 'REENCAMINHAMENTO_SOLICITADO', reencaminhamentoConfirmadoEm: { not: null } },
        data: expect.objectContaining({ status: 'CONCLUIDA' }),
      });
      const criado = prismaMock.manutencao.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(criado).toMatchObject({
        tipo: 'EQUIPAMENTO',
        equipamentoId: EQ,
        unidadeId: 'unidade-1',
        reencaminhadoDeId: MAN,
        casoId: MAN,
        titulo: 'Ar-condicionado não liga',
      });
      expect(criado).not.toHaveProperty('contratoId');
      expect(criado).not.toHaveProperty('contratoItemId');
      expect(criado).not.toHaveProperty('orcamentoValor');
      const acoes = prismaMock.logAuditoria.create.mock.calls.map((c) => (c[0].data as { acao: string }).acao);
      expect(acoes).toEqual(['REENCAMINHAR_MANUTENCAO', 'ABRIR_MANUTENCAO_REENCAMINHADA']);
    });

    it('nos encaminhamentos seguintes o caso continua apontando para a raiz', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardandoDecisao({ casoId: 'raiz-1', reencaminhadoDeId: 'raiz-1' }) as never);
      prismaMock.equipamento.findUnique.mockResolvedValue({ id: EQ, status: 'ATIVO', unidadeId: 'unidade-1', tipoEquipamento: null } as never);

      await request(app).post(`/manutencoes/${MAN}/reencaminhar/manutencao`).set(admin()).send(corpo);

      expect(prismaMock.manutencao.create.mock.calls[0][0].data).toMatchObject({ casoId: 'raiz-1', reencaminhadoDeId: MAN });
    });

    it('equipamento para civil: libera o equipamento do atendimento anterior e exige local e tipo de problema', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(
        aguardandoDecisao({ tipo: 'EQUIPAMENTO', equipamentoId: EQ, equipamento: equipamentoDe(), localAfetado: null, categoriaCivil: null, fotos: [] }) as never,
      );

      const incompleto = await request(app).post(`/manutencoes/${MAN}/reencaminhar/manutencao`).set(admin()).send({ tipo: 'CIVIL' });
      expect(incompleto.status).toBe(422);
      expect(prismaMock.manutencao.create).not.toHaveBeenCalled();

      const res = await request(app)
        .post(`/manutencoes/${MAN}/reencaminhar/manutencao`)
        .set(admin())
        .send({ tipo: 'CIVIL', localAfetado: 'Sala de espera', categoriaCivil: 'ELETRICA' });
      expect(res.status).toBe(201);
      expect(prismaMock.equipamento.updateMany).toHaveBeenCalledWith({
        where: { id: EQ, status: 'EM_MANUTENCAO' },
        data: { status: 'ATIVO' },
      });
      expect(prismaMock.manutencao.create.mock.calls[0][0].data).toMatchObject({ tipo: 'CIVIL', equipamentoId: null, localAfetado: 'Sala de espera' });
    });

    it('o mesmo equipamento segue bloqueado (não é liberado)', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardandoDecisao({ tipo: 'EQUIPAMENTO', equipamentoId: EQ, equipamento: equipamentoDe() }) as never);
      prismaMock.equipamento.findUnique.mockResolvedValue({ id: EQ, status: 'EM_MANUTENCAO', unidadeId: 'unidade-1', tipoEquipamento: null } as never);

      const res = await request(app).post(`/manutencoes/${MAN}/reencaminhar/manutencao`).set(admin()).send({ tipo: 'EQUIPAMENTO' });

      expect(res.status).toBe(201);
      expect(prismaMock.equipamento.updateMany).not.toHaveBeenCalled();
    });

    it('recusa equipamento de outra unidade ou já ocupado em outra manutenção', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardandoDecisao() as never);
      prismaMock.equipamento.findUnique.mockResolvedValueOnce({ id: EQ_OUTRO, status: 'ATIVO', unidadeId: 'unidade-9', tipoEquipamento: null } as never);
      const outraUnidade = await request(app).post(`/manutencoes/${MAN}/reencaminhar/manutencao`).set(admin()).send({ tipo: 'EQUIPAMENTO', equipamentoId: EQ_OUTRO });
      expect(outraUnidade.status).toBe(422);

      prismaMock.equipamento.findUnique.mockResolvedValueOnce({ id: EQ_OUTRO, status: 'EM_MANUTENCAO', unidadeId: 'unidade-1', tipoEquipamento: null } as never);
      const ocupado = await request(app).post(`/manutencoes/${MAN}/reencaminhar/manutencao`).set(admin()).send({ tipo: 'EQUIPAMENTO', equipamentoId: EQ_OUTRO });
      expect(ocupado.status).toBe(422);
      expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
    });

    it('sem confirmação do Administrador não há decisão', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardandoDecisao({ reencaminhamentoConfirmadoEm: null }) as never);
      const res = await request(app).post(`/manutencoes/${MAN}/reencaminhar/manutencao`).set(admin()).send(corpo);
      expect(res.status).toBe(422);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('duas decisões simultâneas não geram dois chamados (409)', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardandoDecisao() as never);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 0 });
      const res = await request(app).post(`/manutencoes/${MAN}/reencaminhar/manutencao`).set(admin()).send(corpo);
      expect(res.status).toBe(409);
      expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
    });

    it('só o Administrador decide', async () => {
      for (const cabecalho of [terc(), unidade()]) {
        const res = await request(app).post(`/manutencoes/${MAN}/reencaminhar/manutencao`).set(cabecalho).send(corpo);
        expect(res.status).toBe(403);
      }
    });
  });

  describe('decisão: baixa', () => {
    const pdf = { filename: 'laudo.pdf', contentType: 'application/pdf' };

    it('usa o fluxo de baixa e liga a substituição ao chamado de origem', async () => {
      const origem = aguardandoDecisao({ tipo: 'EQUIPAMENTO', equipamentoId: EQ, equipamento: equipamentoDe() });
      prismaMock.manutencao.findUnique.mockResolvedValue(origem as never);
      prismaMock.manutencao.update.mockResolvedValue({ ...origem, status: 'BAIXADO' } as never);
      prismaMock.solicitacao.create.mockResolvedValue({ id: 'sol-auto' } as never);

      const res = await request(app)
        .post(`/manutencoes/${MAN}/reencaminhar/baixa`)
        .set(admin())
        .attach('laudo', Buffer.from('%PDF-fake'), pdf);

      expect(res.status).toBe(200);
      // O status lido precisa continuar valendo na gravação (duas baixas simultâneas)
      expect(prismaMock.manutencao.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MAN, status: 'REENCAMINHAMENTO_SOLICITADO' } }),
      );
      expect(prismaMock.solicitacao.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ manutencaoOrigemId: MAN, automatica: true }) }),
      );
    });

    it('exige o laudo em PDF e a confirmação prévia', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardandoDecisao({ tipo: 'EQUIPAMENTO', equipamento: equipamentoDe() }) as never);
      const semLaudo = await request(app).post(`/manutencoes/${MAN}/reencaminhar/baixa`).set(admin());
      expect(semLaudo.status).toBe(422);

      prismaMock.manutencao.findUnique.mockResolvedValue(
        aguardandoDecisao({ tipo: 'EQUIPAMENTO', equipamento: equipamentoDe(), reencaminhamentoConfirmadoEm: null }) as never,
      );
      const semConfirmar = await request(app).post(`/manutencoes/${MAN}/reencaminhar/baixa`).set(admin()).attach('laudo', Buffer.from('%PDF-fake'), pdf);
      expect(semConfirmar.status).toBe(422);
      expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
    });

    it('baixa simultânea é recusada em vez de gerar duas substituições (409)', async () => {
      const origem = aguardandoDecisao({ tipo: 'EQUIPAMENTO', equipamentoId: EQ, equipamento: equipamentoDe() });
      prismaMock.manutencao.findUnique.mockResolvedValue(origem as never);
      const { Prisma } = jest.requireActual('@prisma/client');
      prismaMock.manutencao.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('x', { code: 'P2025', clientVersion: 'test' }));

      const res = await request(app).post(`/manutencoes/${MAN}/reencaminhar/baixa`).set(admin()).attach('laudo', Buffer.from('%PDF-fake'), pdf);

      expect(res.status).toBe(409);
      expect(prismaMock.solicitacao.create).not.toHaveBeenCalled();
    });
  });

  describe('chamado reencaminhado negado na triagem', () => {
    it('libera o equipamento que seguia bloqueado desde o atendimento anterior', async () => {
      const reencaminhado = chamado({ tipo: 'EQUIPAMENTO', equipamentoId: EQ, equipamento: equipamentoDe(), status: 'PENDENTE_APROVACAO', reencaminhadoDeId: 'origem', contrato: null });
      prismaMock.manutencao.findUnique.mockResolvedValue(reencaminhado as never);
      prismaMock.manutencao.update.mockResolvedValue({ ...reencaminhado, status: 'NEGADA' } as never);
      prismaMock.equipamento.updateMany.mockResolvedValue({ count: 1 });

      const res = await request(app).post(`/manutencoes/${MAN}/negar`).set(admin()).send({ motivo: 'Sem cobertura contratual' });

      expect(res.status).toBe(200);
      expect(prismaMock.equipamento.updateMany).toHaveBeenCalledWith({
        where: { id: EQ, status: 'EM_MANUTENCAO' },
        data: { status: 'ATIVO' },
      });
    });
  });

  describe('trajetória do caso', () => {
    const etapa = (id: string, numero: number, extra: Record<string, unknown> = {}) => ({
      id,
      numero,
      tipo: 'CIVIL',
      titulo: 'Ar-condicionado não liga',
      status: 'CONCLUIDA',
      criadoEm: new Date(`2026-10-0${numero}`),
      dataConclusao: null,
      motivoReencaminhamento: null,
      reencaminhadoDeId: null,
      contrato: { prestadorId: 'prestador-1', prestador: { nome: 'Predial Ltda' } },
      solicitacoesGeradas: [{ id: 'sol-1', numero: 3, status: 'PENDENTE_APROVACAO' }],
      ...extra,
    });

    beforeEach(() => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ casoId: 'raiz' }) as never);
      prismaMock.manutencao.findMany.mockResolvedValue([
        etapa('raiz', 1, { motivoReencaminhamento: MOTIVO }),
        etapa(MAN, 2, { reencaminhadoDeId: 'raiz', contrato: { prestadorId: 'prestador-2', prestador: { nome: 'Frio Ltda' } } }),
      ] as never);
    });

    it('o Administrador vê toda a cadeia, os prestadores e a baixa, com o chamado aberto marcado', async () => {
      const res = await request(app).get(`/manutencoes/${MAN}/trajetoria`).set(admin());

      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.findMany.mock.calls[0][0]).toMatchObject({ where: { OR: [{ id: 'raiz' }, { casoId: 'raiz' }] } });
      expect(res.body.map((e: { numero: number }) => e.numero)).toEqual([1, 2]);
      expect(res.body[1]).toMatchObject({ atual: true, prestador: 'Frio Ltda', acessivel: true, baixa: { numero: 3 } });
      expect(res.body[0].motivoReencaminhamento).toBe(MOTIVO);
    });

    it('a terceirizada só identifica e abre o que é do próprio prestador, sem ver a baixa', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(chamado({ casoId: 'raiz', contrato }) as never);

      const res = await request(app).get(`/manutencoes/${MAN}/trajetoria`).set(terc('prestador-1'));

      expect(res.status).toBe(200);
      const [propria, alheia] = res.body;
      expect(propria).toMatchObject({ prestador: 'Predial Ltda', acessivel: true, baixa: null });
      expect(alheia).toMatchObject({ prestador: null, acessivel: false, baixa: null });
      expect(JSON.stringify(res.body)).not.toContain('Frio Ltda');
    });

    it('a terceirizada não consulta a trajetória de chamado de outro prestador', async () => {
      const res = await request(app).get(`/manutencoes/${MAN}/trajetoria`).set(terc('prestador-9'));
      expect(res.status).toBe(403);
    });

    it('a Unidade só vê as etapas da própria unidade', async () => {
      await request(app).get(`/manutencoes/${MAN}/trajetoria`).set(unidade());
      expect(prismaMock.manutencao.findMany.mock.calls[0][0]).toMatchObject({ where: { unidadeId: 'unidade-1' } });
    });
  });

  it('a lista de permissão da terceirizada inclui só o pedido e a trajetória, nunca a confirmação nem a decisão', async () => {
    for (const rota of ['confirmar-reencaminhamento', 'reencaminhar/manutencao', 'reencaminhar/baixa']) {
      const res = await request(app).post(`/manutencoes/${MAN}/${rota}`).set(terc()).send({});
      expect(res.status).toBe(403);
    }
  });
});
