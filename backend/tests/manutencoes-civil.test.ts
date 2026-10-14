import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();

const MAN = '99999999-9999-4999-8999-999999999999';
const ITEM = '66666666-6666-4666-8666-666666666666';
const LINHA = '77777777-7777-4777-8777-777777777777';
const SINAPI = '88888888-8888-4888-8888-888888888888';
const unidade = () => auth('UNIDADE', { unidadeId: 'unidade-1' });
const terc = () => auth('TERCEIRIZADA', { sub: 'terc-1', prestadorId: 'prestador-1' });
const admin = () => auth('OPERADOR');

const contrato = { id: 'ct-1', numero: 'CONT-1', prestadorId: 'prestador-1', prestador: { nome: 'Predial Ltda' } };
const itemCivil = {
  id: ITEM,
  contratoId: 'ct-1',
  valor: 10000,
  contrato: { status: 'ATIVO' },
  escopo: { nome: 'Civil', cobrePreventiva: false, cobreCorretiva: false, cobreCivil: true },
};

const civil = (extra: Record<string, unknown> = {}) => ({
  id: MAN,
  numero: 7,
  tipo: 'CIVIL',
  equipamentoId: null,
  equipamento: null,
  unidadeId: 'unidade-1',
  solicitanteId: 'user-2',
  titulo: 'Infiltração na recepção',
  descricaoProblema: 'Mancha de umidade no teto',
  localAfetado: 'Recepção',
  categoriaCivil: 'INFILTRACAO',
  fotos: [],
  status: 'PENDENTE_APROVACAO',
  contratoId: null,
  contratoItemId: null,
  orcamentoValor: null,
  custoFinal: null,
  confirmadoUnidade: false,
  confirmadoGestor: false,
  unidade: { id: 'unidade-1', nome: 'UBS Centro', emailBase: 'ubs@jlle.gov' },
  solicitante: { nome: 'Rodrigo' },
  decididoPor: null,
  contrato: null,
  contratoItem: null,
  linhasRelatorio: [],
  ...extra,
});

const linha = (extra: Record<string, unknown> = {}) => ({
  id: LINHA,
  tipo: 'SERVICO',
  descricao: 'Impermeabilização',
  quantidade: 2,
  valorUnitario: 100,
  ...extra,
});

const comprometido = (total: number | null) =>
  prismaMock.$queryRaw.mockResolvedValue((total === null ? [] : [{ item: ITEM, total }]) as never);

describe('Manutenção civil', () => {
  describe('abertura', () => {
    const corpo = {
      titulo: 'Infiltração na recepção',
      descricaoProblema: 'Mancha de umidade no teto',
      localAfetado: 'Recepção',
      categoriaCivil: 'INFILTRACAO',
    };

    it('Unidade abre o chamado sem equipamento, sempre para a própria unidade', async () => {
      prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
      prismaMock.manutencao.create.mockResolvedValue(civil() as never);
      const res = await request(app)
        .post('/manutencoes/civil')
        .set(unidade())
        .field('titulo', corpo.titulo)
        .field('descricaoProblema', corpo.descricaoProblema)
        .field('localAfetado', corpo.localAfetado)
        .field('categoriaCivil', corpo.categoriaCivil)
        .field('unidadeId', '11111111-1111-4111-8111-111111111111');
      expect(res.status).toBe(201);
      expect(prismaMock.manutencao.create.mock.calls[0][0].data).toMatchObject({
        tipo: 'CIVIL',
        unidadeId: 'unidade-1',
        localAfetado: 'Recepção',
        categoriaCivil: 'INFILTRACAO',
      });
      expect(prismaMock.manutencao.create.mock.calls[0][0].data).not.toHaveProperty('equipamentoId');
    });

    it('exige local e tipo de problema; Terceirizada e Galpão não abrem chamado', async () => {
      const semLocal = await request(app).post('/manutencoes/civil').set(unidade()).send({ ...corpo, localAfetado: '' });
      const semTipo = await request(app).post('/manutencoes/civil').set(unidade()).send({ ...corpo, categoriaCivil: 'XYZ' });
      expect(semLocal.status).toBe(422);
      expect(semTipo.status).toBe(422);
      expect((await request(app).post('/manutencoes/civil').set(terc()).send(corpo)).status).toBe(403);
      expect((await request(app).post('/manutencoes/civil').set(auth('GALPAO')).send(corpo)).status).toBe(403);
      expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
    });

    it('Administrador precisa indicar a unidade', async () => {
      const res = await request(app).post('/manutencoes/civil').set(admin()).send(corpo);
      expect(res.status).toBe(422);
    });
  });

  describe('triagem, contrato e disponibilidade', () => {
    const aprovar = () => request(app).post(`/manutencoes/${MAN}/aprovar`).set(admin()).send({ contratoItemId: ITEM });

    it('encaminha ao prestador com item de escopo civil e não mexe em equipamento', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue(itemCivil as never);
      comprometido(null);
      prismaMock.manutencao.update.mockResolvedValue(civil({ status: 'AGUARDANDO_EXECUCAO', contrato }) as never);
      const res = await aprovar();
      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({
        status: 'AGUARDANDO_EXECUCAO',
        contratoItemId: ITEM,
        contratoId: 'ct-1',
      });
      expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
      expect(prismaMock.movimentacao.create).not.toHaveBeenCalled();
      // a unidade é avisada e fica sabendo quem é o responsável
      expect(prismaMock.notificacao.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ corpo: expect.stringContaining('Predial Ltda') }),
      );
    });

    it('recusa item cujo escopo não cobre civil', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue({
        ...itemCivil,
        escopo: { nome: 'Preventiva', cobrePreventiva: true, cobreCorretiva: true, cobreCivil: false },
      } as never);
      comprometido(null);
      const res = await aprovar();
      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).toMatch(/civil/i);
    });

    it('sem saldo o chamado não é encaminhado; fica aguardando providências e depois pode ser aprovado', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue(itemCivil as never);
      comprometido(10000);
      expect((await aprovar()).status).toBe(422);

      prismaMock.manutencao.update.mockResolvedValue(civil({ status: 'AGUARDANDO_PROVIDENCIAS' }) as never);
      const espera = await request(app)
        .post(`/manutencoes/${MAN}/aguardar-providencias`)
        .set(admin())
        .send({ motivo: 'Contrato sem saldo no período' });
      expect(espera.status).toBe(200);
      expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({
        status: 'AGUARDANDO_PROVIDENCIAS',
        motivoPendencia: 'Contrato sem saldo no período',
      });

      prismaMock.manutencao.update.mockClear();
      prismaMock.manutencao.findUnique.mockResolvedValue(civil({ status: 'AGUARDANDO_PROVIDENCIAS' }) as never);
      comprometido(null);
      prismaMock.manutencao.update.mockResolvedValue(civil({ status: 'AGUARDANDO_EXECUCAO', contrato }) as never);
      expect((await aprovar()).status).toBe(200);
    });

    it('aguardar providências é só do Administrador, em chamado civil em triagem', async () => {
      const corpo = { motivo: 'Sem contrato' };
      const url = `/manutencoes/${MAN}/aguardar-providencias`;
      expect((await request(app).post(url).set(unidade()).send(corpo)).status).toBe(403);
      prismaMock.manutencao.findUnique.mockResolvedValue(civil({ tipo: 'EQUIPAMENTO' }) as never);
      expect((await request(app).post(url).set(admin()).send(corpo)).status).toBe(422);
      prismaMock.manutencao.findUnique.mockResolvedValue(civil({ status: 'EM_EXECUCAO' }) as never);
      expect((await request(app).post(url).set(admin()).send(corpo)).status).toBe(422);
    });

    it('negação em chamado civil não toca em equipamento', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
      prismaMock.manutencao.update.mockResolvedValue(civil({ status: 'NEGADA' }) as never);
      const res = await request(app).post(`/manutencoes/${MAN}/negar`).set(admin()).send({ motivo: 'Alteração de layout' });
      expect(res.status).toBe(200);
      expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
    });

    it('enquanto aguarda a execução pelo prestador, o Administrador não nega nem troca o item', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil({ status: 'AGUARDANDO_EXECUCAO', contrato, contratoItemId: ITEM }) as never);
      const negar = await request(app).post(`/manutencoes/${MAN}/negar`).set(admin()).send({ motivo: 'Alteração de layout' });
      const trocar = await request(app).post(`/manutencoes/${MAN}/item`).set(admin()).send({ contratoItemId: ITEM });
      expect(negar.status).toBe(422);
      expect(trocar.status).toBe(422);
      expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
    });

    it('lista chamados parecidos em aberto da mesma unidade e tipo de problema', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
      prismaMock.manutencao.findMany.mockResolvedValue([] as never);
      const res = await request(app).get(`/manutencoes/${MAN}/similares`).set(admin());
      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.findMany.mock.calls[0][0]?.where).toMatchObject({
        unidadeId: 'unidade-1',
        categoriaCivil: 'INFILTRACAO',
        id: { not: MAN },
      });
      expect((await request(app).get(`/manutencoes/${MAN}/similares`).set(unidade())).status).toBe(403);
    });
  });

  describe('execução e registro dos serviços executados', () => {
    const lancar = (corpo: Record<string, unknown> = {}) =>
      request(app)
        .post(`/manutencoes/${MAN}/relatorio`)
        .set(terc())
        .send({ itemSinapiId: SINAPI, quantidade: 2, ...corpo });
    const aguardando = (extra: Record<string, unknown> = {}) =>
      civil({
        status: 'EM_EXECUCAO',
        contrato,
        contratoItemId: ITEM,
        contratoItem: { id: ITEM, valor: 10000, descontoPercentual: 12 },
        _count: { linhasRelatorio: 0 },
        ...extra,
      });
    const finalizar = () => request(app).post(`/manutencoes/${MAN}/registrar-retorno`).set(terc()).send({});
    const iniciar = () => request(app).post(`/manutencoes/${MAN}/iniciar-execucao`).set(terc()).send({});

    const itemSinapi = { id: SINAPI, codigo: '99001', descricao: 'Troca de sifão', unidade: 'un', tipo: 'SERVICO', preco: 45, ativo: true };

    it('lança item da tabela SINAPI com o desconto do item de contrato, sem o prestador informar preço', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never);
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(aguardando() as never);
      prismaMock.itemSinapi.findUnique.mockResolvedValue(itemSinapi as never);
      const res = await lancar();
      expect(res.status).toBe(201);
      // 45,00 com 12% de desconto = 39,60; a linha guarda o preço de tabela e o percentual usados
      expect(prismaMock.linhaRelatorioManutencao.create.mock.calls[0][0].data).toMatchObject({
        descricao: 'Troca de sifão',
        quantidade: 2,
        valorUnitario: 39.6,
        precoSinapi: 45,
        descontoPercentual: 12,
        codigoSinapi: '99001',
      });
    });

    it('ignora preço enviado pelo prestador e recusa item SINAPI inexistente ou inativo', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never);
      prismaMock.itemSinapi.findUnique.mockResolvedValue(itemSinapi as never);
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(aguardando() as never);
      await lancar({ valorUnitario: 1 });
      expect(prismaMock.linhaRelatorioManutencao.create.mock.calls[0][0].data).toMatchObject({ valorUnitario: 39.6 });
      prismaMock.itemSinapi.findUnique.mockResolvedValue(null);
      expect((await lancar()).status).toBe(404);
      prismaMock.itemSinapi.findUnique.mockResolvedValue({ ...itemSinapi, ativo: false } as never);
      expect((await lancar()).status).toBe(404);
    });

    it('sem desconto cadastrado o preço é o da tabela', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(
        aguardando({ contratoItem: { id: ITEM, valor: 10000, descontoPercentual: 0 } }) as never,
      );
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(aguardando() as never);
      prismaMock.itemSinapi.findUnique.mockResolvedValue(itemSinapi as never);
      expect((await lancar()).status).toBe(201);
      expect(prismaMock.linhaRelatorioManutencao.create.mock.calls[0][0].data).toMatchObject({ valorUnitario: 45, descontoPercentual: 0 });
    });

    it('não aceita lançamento fora da execução, de outro prestador ou em manutenção de equipamento', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_EXECUCAO' }) as never);
      expect((await lancar()).status).toBe(422);
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ contrato: { ...contrato, prestadorId: 'outro' } }) as never);
      expect((await lancar()).status).toBe(403);
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ tipo: 'EQUIPAMENTO' }) as never);
      expect((await lancar()).status).toBe(422);
    });

    it('valida quantidade e item, e a Unidade não lança serviços', async () => {
      expect((await lancar({ quantidade: 0 })).status).toBe(422);
      expect((await lancar({ itemSinapiId: 'abc' })).status).toBe(422);
      const res = await request(app)
        .post(`/manutencoes/${MAN}/relatorio`)
        .set(unidade())
        .send({ itemSinapiId: SINAPI, quantidade: 1 });
      expect(res.status).toBe(403);
    });

    it('só apaga lançamentos durante a execução', async () => {
      const apagar = () => request(app).delete(`/manutencoes/${MAN}/relatorio/${LINHA}`).set(terc());
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ linhasRelatorio: [linha()] }) as never);
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(aguardando() as never);
      prismaMock.linhaRelatorioManutencao.deleteMany.mockResolvedValue({ count: 1 } as never);
      expect((await apagar()).status).toBe(200);
      expect(prismaMock.linhaRelatorioManutencao.deleteMany).toHaveBeenCalledWith({
        where: { id: LINHA, manutencaoId: MAN },
      });
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_RETORNO', linhasRelatorio: [linha()] }) as never);
      expect((await apagar()).status).toBe(422);
    });

    it('iniciar a execução: só o prestador do contrato, só em chamado aguardando execução', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_EXECUCAO' }) as never);
      prismaMock.manutencao.update.mockResolvedValue(aguardando() as never);
      const ok = await iniciar();
      expect(ok.status).toBe(200);
      expect(prismaMock.manutencao.update.mock.calls[0][0].data).toEqual({ status: 'EM_EXECUCAO' });
      expect(prismaMock.logAuditoria.create).toHaveBeenCalled();

      prismaMock.manutencao.update.mockClear();
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never); // já em execução
      expect((await iniciar()).status).toBe(422);
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_EXECUCAO', contrato: { ...contrato, prestadorId: 'outro' } }) as never);
      expect((await iniciar()).status).toBe(403);
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_EXECUCAO', tipo: 'EQUIPAMENTO' }) as never);
      expect((await iniciar()).status).toBe(422);
      expect((await request(app).post(`/manutencoes/${MAN}/iniciar-execucao`).set(unidade()).send({})).status).toBe(403);
      expect((await request(app).post(`/manutencoes/${MAN}/iniciar-execucao`).set(admin()).send({})).status).toBe(403);
      expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
    });

    it('confirmar a finalização exige serviços informados, usa o total como custo e confere o saldo', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never);
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(aguardando({ linhasRelatorio: [] }) as never);
      expect((await finalizar()).status).toBe(422);

      const comLinhas = aguardando({
        linhasRelatorio: [linha(), linha({ id: 'l2', quantidade: 1, valorUnitario: 50 })],
      });
      prismaMock.manutencao.findUnique.mockResolvedValue(comLinhas as never);
      prismaMock.manutencao.findUniqueOrThrow
        .mockResolvedValueOnce(comLinhas as never)
        .mockResolvedValueOnce(civil({ status: 'AGUARDANDO_RETORNO', confirmadoUnidade: false }) as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue(itemCivil as never);
      comprometido(null);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
      const ok = await finalizar();
      expect(ok.status).toBe(200);
      // 2 × 100 + 1 × 50; o custo ocupa o saldo do item e a Unidade ainda precisa confirmar
      expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: MAN, status: 'EM_EXECUCAO' },
        data: {
          status: 'AGUARDANDO_RETORNO',
          custoFinal: 250,
          confirmadoUnidade: false,
          motivoAjuste: null,
        },
      });

      prismaMock.manutencao.updateMany.mockClear();
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(comLinhas as never);
      comprometido(9900); // saldo restante 100 < 250
      expect((await finalizar()).status).toBe(422);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('após ajustes do Administrador, a finalização volta direto à aprovação final (sem passar pela Unidade)', async () => {
      const comAjuste = aguardando({
        linhasRelatorio: [linha()],
        motivoAjuste: 'Quantidade de mão de obra acima do esperado',
      });
      prismaMock.manutencao.findUnique.mockResolvedValue(comAjuste as never);
      prismaMock.manutencao.findUniqueOrThrow
        .mockResolvedValueOnce(comAjuste as never)
        .mockResolvedValueOnce(civil({ status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true }) as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue(itemCivil as never);
      comprometido(null);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.usuario.findMany.mockResolvedValue([{ email: 'adm@jlle.gov' }] as never);
      const ok = await finalizar();
      expect(ok.status).toBe(200);
      expect(prismaMock.manutencao.updateMany.mock.calls[0][0].data).toMatchObject({
        status: 'AGUARDANDO_MEDICAO',
        custoFinal: 200,
        confirmadoUnidade: true,
        motivoAjuste: null,
      });
      expect(prismaMock.notificacao.create).toHaveBeenCalled();
    });

    it('não finaliza se o contrato do item já expirou', async () => {
      const comLinhas = aguardando({ linhasRelatorio: [linha()] });
      prismaMock.manutencao.findUnique.mockResolvedValue(comLinhas as never);
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(comLinhas as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue({
        ...itemCivil,
        contrato: { status: 'EXPIRADO' },
      } as never);
      comprometido(null);
      expect((await finalizar()).status).toBe(422);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('não finaliza chamado que não está em execução e não há mais orçamento no chamado civil', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_EXECUCAO', linhasRelatorio: [linha()] }) as never);
      expect((await finalizar()).status).toBe(422);
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_ORCAMENTO' }) as never);
      const orcar = await request(app).post(`/manutencoes/${MAN}/orcamento`).set(terc()).send({ valor: 100 });
      expect(orcar.status).toBe(422);
      expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
      // a revisão de orçamento deixou de existir
      expect((await request(app).post(`/manutencoes/${MAN}/revisar-orcamento`).set(terc()).send({ justificativa: 'Serviço extra' })).status).toBe(403);
    });
  });

  describe('confirmação e medição', () => {
    const aguardando = (extra: Record<string, unknown> = {}) =>
      civil({ status: 'AGUARDANDO_RETORNO', contrato, contratoItemId: ITEM, custoFinal: 500, linhasRelatorio: [linha()], ...extra });

    it('a Unidade confirma o problema resolvido: o chamado passa a aguardar a autorização de medição, sem concluir', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never);
      prismaMock.manutencao.update.mockResolvedValue(aguardando({ status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true }) as never);
      prismaMock.usuario.findMany.mockResolvedValue([{ email: 'adm@jlle.gov' }] as never);
      const res = await request(app).post(`/manutencoes/${MAN}/confirmar-retorno`).set(unidade()).send({});
      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.update.mock.calls[0][0].data).toEqual({ status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true });
      expect(prismaMock.notificacao.create).toHaveBeenCalled();
    });

    it('o Administrador não confirma a resolução pela rota de retorno e outra unidade não confirma', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never);
      expect((await request(app).post(`/manutencoes/${MAN}/confirmar-retorno`).set(admin()).send({})).status).toBe(403);
      const outra = auth('UNIDADE', { unidadeId: 'unidade-2' });
      expect((await request(app).post(`/manutencoes/${MAN}/confirmar-retorno`).set(outra).send({})).status).toBe(403);
    });

    it('contestação devolve o chamado ao prestador com o motivo e avisa o Administrador', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never);
      prismaMock.manutencao.update.mockResolvedValue(aguardando({ status: 'EM_EXECUCAO' }) as never);
      prismaMock.usuario.findMany.mockResolvedValue([{ email: 'adm@jlle.gov' }] as never);
      const url = `/manutencoes/${MAN}/contestar`;
      expect((await request(app).post(url).set(unidade()).send({ motivo: 'x' })).status).toBe(422);
      const res = await request(app).post(url).set(unidade()).send({ motivo: 'A infiltração voltou' });
      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({
        status: 'EM_EXECUCAO',
        confirmadoUnidade: false,
        contestacaoUnidade: 'A infiltração voltou',
        custoFinal: null, // o valor deixa de ocupar o saldo até nova finalização
      });
      expect(prismaMock.notificacao.create).toHaveBeenCalled();
      expect((await request(app).post(url).set(admin()).send({ motivo: 'A infiltração voltou' })).status).toBe(403);
    });

    it('autorizar a medição só vale depois da confirmação da Unidade; conclui e registra quem autorizou', async () => {
      const autorizar = () => request(app).post(`/manutencoes/${MAN}/autorizar-medicao`).set(admin());
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never);
      expect((await autorizar()).status).toBe(422);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();

      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true }) as never);
      prismaMock.manutencao.findUniqueOrThrow
        .mockResolvedValueOnce({ status: 'AGUARDANDO_MEDICAO', custoFinal: 500 } as never)
        .mockResolvedValueOnce(aguardando({ status: 'CONCLUIDA', custoFinal: 500 }) as never);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
      const res = await autorizar();
      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: MAN, status: 'AGUARDANDO_MEDICAO' },
        data: {
          status: 'CONCLUIDA',
          conferidoMedicaoPorId: 'user-1',
        },
      });
      expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
    });

    it('solicitar ajustes devolve o chamado à execução, libera o saldo e avisa o prestador', async () => {
      const pedir = (corpo: Record<string, unknown> = { motivo: 'Quantidade de mão de obra acima do esperado' }) =>
        request(app).post(`/manutencoes/${MAN}/solicitar-ajustes`).set(admin()).send(corpo);
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_MEDICAO', confirmadoUnidade: true }) as never);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(aguardando({ status: 'EM_EXECUCAO' }) as never);
      prismaMock.prestadorServico.findUnique.mockResolvedValue({ email: 'predial@empresa.com' } as never);
      expect((await pedir({ motivo: 'x' })).status).toBe(422);
      const res = await pedir();
      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toEqual({
        where: { id: MAN, status: 'AGUARDANDO_MEDICAO' },
        data: {
          status: 'EM_EXECUCAO',
          custoFinal: null,
          confirmadoUnidade: false,
          motivoAjuste: 'Quantidade de mão de obra acima do esperado',
        },
      });
      expect(prismaMock.notificacao.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ destinatario: 'predial@empresa.com' }));

      prismaMock.manutencao.updateMany.mockClear();
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never); // ainda aguarda a Unidade
      expect((await pedir()).status).toBe(422);
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_MEDICAO', tipo: 'EQUIPAMENTO' }) as never);
      expect((await pedir()).status).toBe(422);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
      const url = `/manutencoes/${MAN}/solicitar-ajustes`;
      expect((await request(app).post(url).set(unidade()).send({ motivo: 'Quantidade acima do esperado' })).status).toBe(403);
      expect((await request(app).post(url).set(terc()).send({ motivo: 'Quantidade acima do esperado' })).status).toBe(403);
    });

    it('só o Administrador autoriza a medição', async () => {
      expect((await request(app).post(`/manutencoes/${MAN}/autorizar-medicao`).set(unidade())).status).toBe(403);
      expect((await request(app).post(`/manutencoes/${MAN}/autorizar-medicao`).set(terc())).status).toBe(403);
    });
  });

  describe('isolamento', () => {
    it('Unidade não vê chamado civil de outra unidade; Terceirizada não vê de outro prestador', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil({ contrato }) as never);
      const outra = auth('UNIDADE', { unidadeId: 'unidade-2' });
      expect((await request(app).get(`/manutencoes/${MAN}`).set(outra)).status).toBe(403);
      const alheia = auth('TERCEIRIZADA', { prestadorId: 'prestador-9' });
      expect((await request(app).get(`/manutencoes/${MAN}`).set(alheia)).status).toBe(403);
      expect((await request(app).get(`/manutencoes/${MAN}`).set(terc())).status).toBe(200);
    });

    it('baixa por laudo não vale para chamado civil', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil({ status: 'ORCAMENTO_REGISTRADO' }) as never);
      const res = await request(app).post(`/manutencoes/${MAN}/validar-orcamento`).set(admin()).field('aprovado', 'false');
      expect(res.status).toBe(422);
      expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
    });
  });
});
