import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const SETOR = '33333333-3333-4333-8333-333333333333';
const operador = (permissoes: string[]) => auth('OPERADOR', { permissoes });

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
};

// Categoria cadastrada (Infiltração) usada nos chamados de teste
const CAT = '77777777-7777-4777-8777-777777777777';
const categoriaAtiva = (perguntas: unknown[] = []) => ({ ativo: true, perguntas }) as never;

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
  categoriaCivilId: CAT,
  categoriaCivil: { id: CAT, nome: 'Infiltração' },
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
      categoriaCivilId: CAT,
    };

    it('Unidade abre o chamado sem equipamento, sempre para a própria unidade', async () => {
      prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
      prismaMock.categoriaCivil.findUnique.mockResolvedValue(categoriaAtiva());
      prismaMock.manutencao.create.mockResolvedValue(civil() as never);
      const res = await request(app)
        .post('/manutencoes/civil')
        .set(unidade())
        .field('titulo', corpo.titulo)
        .field('descricaoProblema', corpo.descricaoProblema)
        .field('localAfetado', corpo.localAfetado)
        .field('categoriaCivilId', corpo.categoriaCivilId)
        .field('unidadeId', '11111111-1111-4111-8111-111111111111');
      expect(res.status).toBe(201);
      expect(prismaMock.manutencao.create.mock.calls[0][0].data).toMatchObject({
        tipo: 'CIVIL',
        unidadeId: 'unidade-1',
        localAfetado: 'Recepção',
        categoriaCivilId: CAT,
      });
      expect(prismaMock.manutencao.create.mock.calls[0][0].data).not.toHaveProperty('equipamentoId');
    });

    it('exige local e tipo de problema; Terceirizada e Galpão não abrem chamado', async () => {
      prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
      const semLocal = await request(app).post('/manutencoes/civil').set(unidade()).send({ ...corpo, localAfetado: '' });
      const semTipo = await request(app).post('/manutencoes/civil').set(unidade()).send({ ...corpo, categoriaCivilId: 'XYZ' });
      expect(semLocal.status).toBe(422);
      expect(semTipo.status).toBe(422);
      expect((await request(app).post('/manutencoes/civil').set(terc()).send(corpo)).status).toBe(403);
      expect((await request(app).post('/manutencoes/civil').set(auth('GALPAO')).send(corpo)).status).toBe(403);
      expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
    });

    describe('setores afetados', () => {
      const SETOR2 = '55555555-5555-4555-8555-555555555555';
      const corpoSetores = { ...corpo, localAfetado: undefined };

      it('um ou mais setores da unidade: o local afetado guarda os nomes e a ligação é criada', async () => {
        prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
        prismaMock.categoriaCivil.findUnique.mockResolvedValue(categoriaAtiva());
        prismaMock.setor.findMany.mockResolvedValue([
          { id: SETOR, nome: 'Recepção' },
          { id: SETOR2, nome: 'Farmácia' },
        ] as never);
        prismaMock.manutencao.create.mockResolvedValue(civil() as never);
        const res = await request(app)
          .post('/manutencoes/civil')
          .set(unidade())
          .field('titulo', corpoSetores.titulo)
          .field('descricaoProblema', corpoSetores.descricaoProblema)
          .field('categoriaCivilId', corpoSetores.categoriaCivilId)
          .field('setorIds', SETOR)
          .field('setorIds', SETOR2);
        expect(res.status).toBe(201);
        expect(prismaMock.setor.findMany.mock.calls[0][0]).toMatchObject({ where: { id: { in: [SETOR, SETOR2] }, unidadeId: 'unidade-1', ativo: true } });
        expect(prismaMock.manutencao.create.mock.calls[0][0].data).toMatchObject({
          localAfetado: 'Recepção, Farmácia',
          setores: { create: [{ setorId: SETOR }, { setorId: SETOR2 }] },
        });
      });

      it('setor de outra unidade é recusado', async () => {
        prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
        prismaMock.setor.findMany.mockResolvedValue([] as never);
        const res = await request(app).post('/manutencoes/civil').set(unidade()).send({ ...corpoSetores, setorIds: [SETOR] });
        expect(res.status).toBe(422);
        expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
      });

      it('unidade com setores cadastrados exige escolher ao menos um', async () => {
        prismaMock.unidade.findUnique.mockResolvedValue({ id: 'unidade-1' } as never);
        prismaMock.setor.count.mockResolvedValue(3 as never);
        const res = await request(app).post('/manutencoes/civil').set(unidade()).send(corpo);
        expect(res.status).toBe(422);
        expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
      });
    });

    it('Administrador precisa indicar a unidade', async () => {
      const res = await request(app).post('/manutencoes/civil').set(admin()).send(corpo);
      expect(res.status).toBe(422);
    });
  });

  describe('triagem, contrato e disponibilidade', () => {
    const aprovar = () => request(app).post(`/manutencoes/${MAN}/aprovar`).set(admin()).send({ contratoItemId: ITEM });

    it('encaminha ao prestador com o item de contrato e não mexe em equipamento', async () => {
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

    it('sem saldo o chamado é encaminhado mesmo assim: o saldo só é conferido na finalização', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue(itemCivil as never);
      comprometido(10000);
      prismaMock.manutencao.update.mockResolvedValue(civil({ status: 'AGUARDANDO_EXECUCAO' }) as never);
      expect((await aprovar()).status).toBe(200);
      expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({ status: 'AGUARDANDO_EXECUCAO' });
    });

    it('serviço que exige avaliação técnica: aprova, reserva o item e ainda não vai ao prestador', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue({ ...itemCivil, servico: { exigeAvaliacaoTecnica: true } } as never);
      comprometido(null);
      prismaMock.manutencao.update.mockResolvedValue(civil({ status: 'AGUARDANDO_AVALIACAO_TECNICA' }) as never);
      const res = await aprovar();
      expect(res.status).toBe(200);
      const data = prismaMock.manutencao.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: 'AGUARDANDO_AVALIACAO_TECNICA', contratoItemId: ITEM });
      // sem contrato, o prestador não enxerga o chamado
      expect(data).not.toHaveProperty('contratoId');
    });

    it('concluir a avaliação técnica envia ao prestador; exige a permissão e o status', async () => {
      const url = `/manutencoes/${MAN}/concluir-avaliacao`;
      const corpo = { parecer: 'Infiltração na laje, reparo viável' };
      expect((await request(app).post(url).set(unidade()).send(corpo)).status).toBe(403);
      expect((await request(app).post(url).set(operador(['MANUTENCAO_TRIAR'])).send(corpo)).status).toBe(403);

      prismaMock.manutencao.findUnique.mockResolvedValue(civil({ status: 'PENDENTE_APROVACAO' }) as never);
      expect((await request(app).post(url).set(operador(['MANUTENCAO_AVALIAR'])).send(corpo)).status).toBe(422);

      prismaMock.manutencao.findUnique
        .mockResolvedValueOnce(civil({ status: 'AGUARDANDO_AVALIACAO_TECNICA', contratoItemId: ITEM }) as never)
        .mockResolvedValue(civil({ status: 'AGUARDANDO_EXECUCAO', contrato }) as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue(itemCivil as never);
      comprometido(null);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
      const res = await request(app).post(url).set(operador(['MANUTENCAO_AVALIAR'])).send(corpo);
      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: MAN, status: 'AGUARDANDO_AVALIACAO_TECNICA' },
        data: { status: 'AGUARDANDO_EXECUCAO', contratoId: 'ct-1', parecerTecnico: corpo.parecer },
      });
    });

    it('na avaliação técnica o chamado não é mais negado: o avaliador encerra', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil({ status: 'AGUARDANDO_AVALIACAO_TECNICA' }) as never);
      const res = await request(app).post(`/manutencoes/${MAN}/negar`).set(admin()).send({ motivo: 'Fora do escopo' });
      expect(res.status).toBe(422);
    });

    describe('avaliação técnica completa', () => {
      const avaliador = () => operador(['MANUTENCAO_AVALIAR']);
      const emAvaliacao = (extra = {}) => civil({ status: 'AGUARDANDO_AVALIACAO_TECNICA', contratoItemId: ITEM, ...extra });

      it('corrigir os campos exige a permissão e o status; campo desconhecido é recusado', async () => {
        const url = `/manutencoes/${MAN}/avaliacao`;
        expect((await request(app).patch(url).set(operador(['MANUTENCAO_TRIAR'])).send({ titulo: 'x' })).status).toBe(403);
        expect((await request(app).patch(url).set(avaliador()).send({ status: 'CONCLUIDA' })).status).toBe(422);
        prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
        expect((await request(app).patch(url).set(avaliador()).send({ titulo: 'Novo' })).status).toBe(422);
      });

      it('grava as correções e audita o antes e o depois', async () => {
        const atual = emAvaliacao({ titulo: 'Antigo', localAfetado: 'Recepção', setores: [], linhasRelatorio: [] });
        prismaMock.manutencao.findUnique.mockResolvedValue(atual as never);
        prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(atual as never);
        prismaMock.setor.findMany.mockResolvedValue([{ id: SETOR, nome: 'Sala 2', unidadeId: atual.unidadeId, ativo: true }] as never);
        const res = await request(app)
          .patch(`/manutencoes/${MAN}/avaliacao`)
          .set(avaliador())
          .send({ titulo: 'Novo título', setorIds: [SETOR], orientacoesTerceirizada: 'Levar escada' });
        expect(res.status).toBe(200);
        expect(prismaMock.manutencao.update.mock.calls[0][0].data).toMatchObject({
          titulo: 'Novo título',
          localAfetado: 'Sala 2',
          orientacoesTerceirizada: 'Levar escada',
        });
        const log = prismaMock.logAuditoria.create.mock.calls[0][0].data;
        expect(log.acao).toBe('EDITAR_AVALIACAO_TECNICA');
        expect(log.dadosAntes).toMatchObject({ titulo: 'Antigo', localAfetado: 'Recepção' });
      });

      it('setor de outra unidade é recusado', async () => {
        const atual = emAvaliacao({ setores: [], linhasRelatorio: [] });
        prismaMock.manutencao.findUnique.mockResolvedValue(atual as never);
        prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue(atual as never);
        prismaMock.setor.findMany.mockResolvedValue([{ id: SETOR, nome: 'X', unidadeId: 'outra-unidade', ativo: true }] as never);
        const res = await request(app).patch(`/manutencoes/${MAN}/avaliacao`).set(avaliador()).send({ setorIds: [SETOR] });
        expect(res.status).toBe(422);
        expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
      });

      it('materiais previstos entram como linhas do relatório com o desconto do item', async () => {
        prismaMock.manutencao.findUnique.mockResolvedValue(
          emAvaliacao({ contratoItem: { id: ITEM, descontoPercentual: 10 } }) as never,
        );
        prismaMock.itemSinapi.findUnique.mockResolvedValue({
          id: SINAPI, ativo: true, tipo: 'MATERIAL', descricao: 'Tinta', unidade: 'L', codigo: '123', preco: 100,
        } as never);
        prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue({ status: 'AGUARDANDO_AVALIACAO_TECNICA', _count: { linhasRelatorio: 0 } } as never);
        const res = await request(app).post(`/manutencoes/${MAN}/materiais`).set(avaliador()).send({ itemSinapiId: SINAPI, quantidade: 2 });
        expect(res.status).toBe(201);
        expect(prismaMock.linhaRelatorioManutencao.create.mock.calls[0][0].data).toMatchObject({
          quantidade: 2, valorUnitario: 90, precoSinapi: 100, descontoPercentual: 10,
        });
      });

      it('lista de materiais não existe para equipamento', async () => {
        prismaMock.manutencao.findUnique.mockResolvedValue(emAvaliacao({ tipo: 'EQUIPAMENTO' }) as never);
        const res = await request(app).post(`/manutencoes/${MAN}/materiais`).set(avaliador()).send({ itemSinapiId: SINAPI, quantidade: 1 });
        expect(res.status).toBe(422);
      });

      it('duplicado exige o número do chamado original; o original não pode ser o próprio nem estar encerrado', async () => {
        const url = `/manutencoes/${MAN}/encerrar`;
        prismaMock.manutencao.findUnique.mockResolvedValue(emAvaliacao() as never);
        const sem = await request(app).post(url).set(avaliador()).send({ tipo: 'DUPLICADO', motivo: 'Já aberto' });
        expect(sem.status).toBe(422);
        expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
      });

      it('encerra como duplicado, aponta para o original e não consome saldo', async () => {
        prismaMock.manutencao.findUnique
          .mockResolvedValueOnce(emAvaliacao() as never)
          .mockResolvedValueOnce({ id: 'original-1', status: 'EM_EXECUCAO' } as never)
          .mockResolvedValue(emAvaliacao({ status: 'ENCERRADA' }) as never);
        prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
        const res = await request(app)
          .post(`/manutencoes/${MAN}/encerrar`)
          .set(avaliador())
          .send({ tipo: 'DUPLICADO', motivo: 'Já aberto', chamadoOriginalNumero: 7 });
        expect(res.status).toBe(200);
        expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
          where: { id: MAN, status: 'AGUARDANDO_AVALIACAO_TECNICA' },
          data: { status: 'ENCERRADA', tipoEncerramento: 'DUPLICADO', chamadoOriginalId: 'original-1' },
        });
      });

      it('encerrar sem remeter a outro chamado não pede original', async () => {
        prismaMock.manutencao.findUnique
          .mockResolvedValueOnce(emAvaliacao() as never)
          .mockResolvedValue(emAvaliacao({ status: 'ENCERRADA' }) as never);
        prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
        const res = await request(app).post(`/manutencoes/${MAN}/encerrar`).set(avaliador()).send({ tipo: 'ENCERRADO', motivo: 'Resolvido na unidade' });
        expect(res.status).toBe(200);
      });
    });

    it('a rota de aguardar providências não existe mais', async () => {
      const res = await request(app).post(`/manutencoes/${MAN}/aguardar-providencias`).set(admin()).send({ motivo: 'x' });
      expect(res.status).toBe(404);
    });

    it('negação em chamado civil não toca em equipamento', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
      prismaMock.manutencao.update.mockResolvedValue(civil({ status: 'NEGADA' }) as never);
      const res = await request(app).post(`/manutencoes/${MAN}/negar`).set(admin()).send({ motivo: 'Alteração de layout' });
      expect(res.status).toBe(200);
      expect(prismaMock.equipamento.update).not.toHaveBeenCalled();
    });

    it('enquanto aguarda a execução pelo prestador, o Administrador não nega', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil({ status: 'AGUARDANDO_EXECUCAO', contrato, contratoItemId: ITEM }) as never);
      const negar = await request(app).post(`/manutencoes/${MAN}/negar`).set(admin()).send({ motivo: 'Alteração de layout' });
      expect(negar.status).toBe(422);
      expect(prismaMock.manutencao.update).not.toHaveBeenCalled();
    });

    it('lista chamados parecidos em aberto da mesma unidade e tipo de problema', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(civil() as never);
      prismaMock.manutencao.findMany.mockResolvedValue([] as never);
      const res = await request(app).get(`/manutencoes/${MAN}/similares`).set(admin());
      expect(res.status).toBe(200);
      expect(prismaMock.manutencao.findMany.mock.calls[0][0]?.where).toMatchObject({
        unidadeId: 'unidade-1',
        categoriaCivilId: CAT,
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
    // O chamado em execução já tem a OS gerada
    beforeEach(() => {
      prismaMock.ordemServico.findUnique.mockResolvedValue({ id: 'os1' } as never);
    });

    const finalizar = () => request(app).post(`/manutencoes/${MAN}/registrar-retorno`).set(terc()).send(EXECUCAO);
    const OS_CORPO = { equipe: 'João e Pedro', dataPrevista: '2026-11-10', escopo: 'Refazer a calha do bloco B' };
    const iniciar = () => request(app).post(`/manutencoes/${MAN}/gerar-os`).set(terc()).send(OS_CORPO);
    const EXECUCAO = { entradaEm: '2026-11-05T09:00:00.000Z', saidaEm: '2026-11-05T11:30:00.000Z', resultado: 'TOTAL' };

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

    it('gerar a OS: só o prestador do contrato, em chamado aguardando execução; o chamado passa a "em rota"', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_EXECUCAO' }) as never);
      prismaMock.manutencao.findUniqueOrThrow
        .mockResolvedValueOnce({ status: 'AGUARDANDO_EXECUCAO', ordemServico: null } as never)
        .mockResolvedValueOnce(aguardando() as never);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.ordemServico.create.mockResolvedValue({ id: 'os1', numero: 1 } as never);
      const ok = await iniciar();
      expect(ok.status).toBe(201);
      expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: MAN, status: 'AGUARDANDO_EXECUCAO' }, data: { status: 'EM_EXECUCAO' } });
      expect(prismaMock.ordemServico.create.mock.calls[0][0].data).toMatchObject({
        manutencaoId: MAN,
        geradaPorId: 'terc-1',
        equipe: 'João e Pedro',
        escopo: 'Refazer a calha do bloco B',
      });
      expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'GERAR_OS' });

      prismaMock.manutencao.updateMany.mockClear();
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_EXECUCAO', contrato: { ...contrato, prestadorId: 'outro' } }) as never);
      expect((await iniciar()).status).toBe(403);
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando({ status: 'AGUARDANDO_EXECUCAO', tipo: 'EQUIPAMENTO' }) as never);
      expect((await iniciar()).status).toBe(422);
      expect((await request(app).post(`/manutencoes/${MAN}/gerar-os`).set(unidade()).send(OS_CORPO)).status).toBe(403);
      expect((await request(app).post(`/manutencoes/${MAN}/gerar-os`).set(admin()).send(OS_CORPO)).status).toBe(403);
      expect(prismaMock.manutencao.updateMany).not.toHaveBeenCalled();
    });

    it('a OS é uma por chamado: segunda OS é recusada; exige equipe, dia e escopo', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never);
      prismaMock.manutencao.findUniqueOrThrow.mockResolvedValue({ status: 'EM_EXECUCAO', ordemServico: { id: 'os1' } } as never);
      expect((await iniciar()).status).toBe(422);
      expect((await request(app).post(`/manutencoes/${MAN}/gerar-os`).set(terc()).send({ ...OS_CORPO, equipe: '' })).status).toBe(422);
      expect((await request(app).post(`/manutencoes/${MAN}/gerar-os`).set(terc()).send({ ...OS_CORPO, dataPrevista: 'amanhã' })).status).toBe(422);
      expect(prismaMock.ordemServico.create).not.toHaveBeenCalled();
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
        .mockResolvedValueOnce(civil({ status: 'EXECUTADO', confirmadoUnidade: false }) as never);
      prismaMock.contratoItem.findUnique.mockResolvedValue(itemCivil as never);
      comprometido(null);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
      const ok = await finalizar();
      expect(ok.status).toBe(200);
      // 2 × 100 + 1 × 50; o custo ocupa o saldo do item. O serviço fica "Executado" até chegarem a OS assinada e o relatório
      expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: MAN, status: 'EM_EXECUCAO' },
        data: {
          status: 'EXECUTADO',
          aguardandoRetornoEm: null,
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

    it('contestação fecha o atendimento e abre um subchamado na triagem, sem prestador, ligado ao caso', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(
        aguardando({ setores: [{ setor: { id: 's1', nome: 'Recepção' } }], fotos: ['/uploads/solicitacoes/a.png'] }) as never,
      );
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 1 } as never);
      prismaMock.manutencao.create.mockResolvedValue(civil({ id: 'novo-1', numero: 8, reencaminhadoDeId: MAN }) as never);
      const url = `/manutencoes/${MAN}/contestar`;
      expect((await request(app).post(url).set(unidade()).send({ motivo: 'x' })).status).toBe(422);

      const res = await request(app).post(url).set(unidade()).send({ motivo: 'A infiltração voltou' });

      expect(res.status).toBe(200);
      // o atendimento atual fecha e o valor deixa de ocupar o saldo; a condição de status vai na gravação
      expect(prismaMock.manutencao.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: MAN, status: 'AGUARDANDO_RETORNO' },
        data: { status: 'CONCLUIDA', contestacaoUnidade: 'A infiltração voltou', custoFinal: null, confirmadoUnidade: false },
      });
      // o subchamado nasce na triagem: sem contrato, item nem prestador; leva local, categoria, fotos e setores
      const novo = prismaMock.manutencao.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(novo).toMatchObject({
        tipo: 'CIVIL',
        unidadeId: 'unidade-1',
        reencaminhadoDeId: MAN,
        casoId: MAN,
        localAfetado: 'Recepção',
        categoriaCivilId: CAT,
        fotos: ['/uploads/solicitacoes/a.png'],
        setores: { create: [{ setorId: 's1' }] },
        abertoPorContestacao: true, // a tela mostra "Contestado" em vez de "Pendente Aprovação"
      });
      expect(String(novo.descricaoProblema)).toContain('A infiltração voltou');
      expect(novo).not.toHaveProperty('contratoId');
      expect(novo).not.toHaveProperty('contratoItemId');
      expect(novo).not.toHaveProperty('status'); // o padrão do banco é PENDENTE_APROVACAO
      const acoes = prismaMock.logAuditoria.create.mock.calls.map((c) => c[0].data.acao);
      expect(acoes).toEqual(['CONTESTAR_EXECUCAO', 'ABRIR_MANUTENCAO_REENCAMINHADA']);
      expect((await request(app).post(url).set(admin()).send({ motivo: 'A infiltração voltou' })).status).toBe(403);
    });

    it('contestação concorrente com outra ação é recusada e não cria o subchamado', async () => {
      prismaMock.manutencao.findUnique.mockResolvedValue(aguardando() as never);
      prismaMock.manutencao.updateMany.mockResolvedValue({ count: 0 } as never);
      const res = await request(app).post(`/manutencoes/${MAN}/contestar`).set(unidade()).send({ motivo: 'A infiltração voltou' });
      expect(res.status).toBe(409);
      expect(prismaMock.manutencao.create).not.toHaveBeenCalled();
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
