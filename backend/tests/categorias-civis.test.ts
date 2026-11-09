import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();
const CAT = '77777777-7777-4777-8777-777777777777';
const PERG = '66666666-6666-4666-8666-666666666666';

const config = () => auth('OPERADOR', { permissoes: ['CONFIGURACOES_GERENCIAR'] });
const semConfig = () => auth('OPERADOR', { permissoes: ['MANUTENCAO_ESCREVER'] });
const unidade = () => auth('UNIDADE', { unidadeId: 'unidade-1' });

const categoria = (extra: Record<string, unknown> = {}) => ({
  id: CAT,
  nome: 'Hidráulica',
  ativo: true,
  ordem: 1,
  _count: { manutencoes: 0 },
  perguntas: [
    { id: PERG, texto: 'O vazamento é contínuo?', tipo: 'OPCOES', opcoes: ['Sim', 'Não'], obrigatoria: true, ordem: 0, ativo: true },
    { id: 'p2', texto: 'Antiga', tipo: 'TEXTO', opcoes: [], obrigatoria: false, ordem: 1, ativo: false },
  ],
  ...extra,
});

describe('Categorias do chamado civil e suas perguntas', () => {
  describe('GET /categorias-civis', () => {
    it('quem abre chamados vê só categorias ativas e perguntas ativas', async () => {
      prismaMock.categoriaCivil.findMany.mockResolvedValue([categoria()] as never);

      const res = await request(app).get('/categorias-civis?todas=true').set(unidade());

      expect(res.status).toBe(200);
      // a Unidade não consegue pedir "todas": o filtro de ativas vale
      expect(prismaMock.categoriaCivil.findMany.mock.calls[0][0]?.where).toEqual({ ativo: true });
      expect(res.body[0].perguntas.map((p: { id: string }) => p.id)).toEqual([PERG]);
    });

    it('quem cadastra pode pedir todas, inclusive as inativas e as perguntas desativadas', async () => {
      prismaMock.categoriaCivil.findMany.mockResolvedValue([categoria()] as never);

      const res = await request(app).get('/categorias-civis?todas=true').set(config());

      expect(prismaMock.categoriaCivil.findMany.mock.calls[0][0]?.where).toEqual({});
      expect(res.body[0].perguntas).toHaveLength(2);
    });

    it('terceirizada e galpão não acessam', async () => {
      expect((await request(app).get('/categorias-civis').set(auth('TERCEIRIZADA', { prestadorId: 'p1' }))).status).toBe(403);
      expect((await request(app).get('/categorias-civis').set(auth('GALPAO'))).status).toBe(403);
    });
  });

  describe('POST /categorias-civis', () => {
    const corpo = {
      nome: 'Hidráulica',
      perguntas: [{ texto: 'O vazamento é contínuo?', tipo: 'OPCOES', opcoes: ['Sim', 'Não'], obrigatoria: true }],
    };
    const preparar = () => {
      prismaMock.categoriaCivil.findFirst.mockResolvedValue(null);
      prismaMock.categoriaCivil.aggregate.mockResolvedValue({ _max: { ordem: 3 } } as never);
      prismaMock.categoriaCivil.create.mockResolvedValue({ id: CAT, nome: 'Hidráulica' } as never);
      prismaMock.perguntaCategoria.findMany.mockResolvedValue([]);
      prismaMock.categoriaCivil.findUniqueOrThrow.mockResolvedValue(categoria() as never);
    };

    it('cadastra a categoria com as perguntas na ordem da lista e audita', async () => {
      preparar();

      const res = await request(app).post('/categorias-civis').set(config()).send(corpo);

      expect(res.status).toBe(201);
      expect(prismaMock.categoriaCivil.create.mock.calls[0][0].data).toMatchObject({ nome: 'Hidráulica', ordem: 4 });
      expect(prismaMock.perguntaCategoria.create.mock.calls[0][0].data).toMatchObject({
        categoriaId: CAT,
        texto: 'O vazamento é contínuo?',
        tipo: 'OPCOES',
        opcoes: ['Sim', 'Não'],
        ordem: 0,
        ativo: true,
      });
      expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'CADASTRAR_CATEGORIA_CIVIL' });
    });

    it('pergunta de opções exige ao menos duas opções diferentes; texto corrido ignora as opções', async () => {
      preparar();
      const poucas = { nome: 'X1', perguntas: [{ texto: 'Qual o tipo?', tipo: 'OPCOES', opcoes: ['Só uma', 'Só uma'] }] };
      expect((await request(app).post('/categorias-civis').set(config()).send(poucas)).status).toBe(422);
      expect(prismaMock.categoriaCivil.create).not.toHaveBeenCalled();

      const texto = { nome: 'X2', perguntas: [{ texto: 'Descreva o local', tipo: 'TEXTO', opcoes: ['lixo'] }] };
      expect((await request(app).post('/categorias-civis').set(config()).send(texto)).status).toBe(201);
      expect(prismaMock.perguntaCategoria.create.mock.calls[0][0].data).toMatchObject({ tipo: 'TEXTO', opcoes: [] });
    });

    it('recusa nome repetido (409) e quem não tem CONFIGURACOES_GERENCIAR (403)', async () => {
      preparar();
      prismaMock.categoriaCivil.findFirst.mockResolvedValue({ id: 'outra' } as never);
      expect((await request(app).post('/categorias-civis').set(config()).send(corpo)).status).toBe(409);
      expect((await request(app).post('/categorias-civis').set(semConfig()).send(corpo)).status).toBe(403);
      expect((await request(app).post('/categorias-civis').set(unidade()).send(corpo)).status).toBe(403);
      expect(prismaMock.categoriaCivil.create).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /categorias-civis/:id', () => {
    it('atualiza pergunta existente, cria a nova e desativa a que saiu da lista (sem apagar respostas antigas)', async () => {
      prismaMock.categoriaCivil.findUnique.mockResolvedValue({ id: CAT, nome: 'Hidráulica', ativo: true } as never);
      prismaMock.perguntaCategoria.findMany.mockResolvedValue([{ id: PERG }, { id: 'p2' }] as never);
      prismaMock.categoriaCivil.findUniqueOrThrow.mockResolvedValue(categoria() as never);

      const res = await request(app)
        .patch(`/categorias-civis/${CAT}`)
        .set(config())
        .send({
          perguntas: [
            { id: PERG, texto: 'O vazamento é constante?', tipo: 'OPCOES', opcoes: ['Sim', 'Não', 'Às vezes'] },
            { texto: 'Há outro banheiro?', tipo: 'OPCOES', opcoes: ['Sim', 'Não'] },
          ],
        });

      expect(res.status).toBe(200);
      expect(prismaMock.perguntaCategoria.updateMany.mock.calls[0][0]).toMatchObject({
        where: { categoriaId: CAT, id: { notIn: [PERG] } },
        data: { ativo: false },
      });
      expect(prismaMock.perguntaCategoria.update.mock.calls[0][0]).toMatchObject({ where: { id: PERG }, data: { ordem: 0 } });
      expect(prismaMock.perguntaCategoria.create.mock.calls[0][0].data).toMatchObject({ categoriaId: CAT, ordem: 1 });
    });

    it('recusa pergunta de outra categoria', async () => {
      prismaMock.categoriaCivil.findUnique.mockResolvedValue({ id: CAT, nome: 'Hidráulica', ativo: true } as never);
      prismaMock.perguntaCategoria.findMany.mockResolvedValue([{ id: PERG }] as never);

      const res = await request(app)
        .patch(`/categorias-civis/${CAT}`)
        .set(config())
        .send({ perguntas: [{ id: '55555555-5555-4555-8555-555555555555', texto: 'Alheia?', tipo: 'TEXTO' }] });

      expect(res.status).toBe(422);
      expect(prismaMock.perguntaCategoria.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /categorias-civis/:id', () => {
    it('categoria em uso em chamados não é excluída: deve ser desativada', async () => {
      prismaMock.categoriaCivil.findUnique.mockResolvedValue({ id: CAT, nome: 'Hidráulica', _count: { manutencoes: 2 } } as never);
      expect((await request(app).delete(`/categorias-civis/${CAT}`).set(config())).status).toBe(422);
      expect(prismaMock.categoriaCivil.delete).not.toHaveBeenCalled();
    });

    it('categoria sem uso é excluída e a exclusão é auditada', async () => {
      prismaMock.categoriaCivil.findUnique.mockResolvedValue({ id: CAT, nome: 'Hidráulica', _count: { manutencoes: 0 } } as never);
      expect((await request(app).delete(`/categorias-civis/${CAT}`).set(config())).status).toBe(204);
      expect(prismaMock.logAuditoria.create.mock.calls[0][0].data).toMatchObject({ acao: 'EXCLUIR_CATEGORIA_CIVIL' });
    });
  });
});
