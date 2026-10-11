/**
 * Testes com PostgreSQL de verdade (AGENTS.md: mocks do Prisma não validam constraints, SQL nem concorrência).
 * Só rodam quando TEST_DATABASE_URL aponta para um banco descartável com as migrações aplicadas, p.ex.:
 *   docker run -d --name sgp-test-db -e POSTGRES_USER=sgp -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=sgp_test -p 55432:5432 postgres:16-alpine
 *   DATABASE_URL=postgresql://sgp:teste@localhost:55432/sgp_test npx prisma migrate deploy
 *   TEST_DATABASE_URL=postgresql://sgp:teste@localhost:55432/sgp_test npx jest conversas-nao-lidas.db
 * Sem a variável, o arquivo é ignorado (a CI e `npm test` seguem só com o Prisma mockado).
 */
import { randomUUID } from 'crypto';
import { PrismaClient, Perfil, StatusSolicitacao } from '@prisma/client';
import type { AuthPayload } from '../src/middlewares/auth';

const URL = process.env.TEST_DATABASE_URL;
const rodar = URL ? describe : describe.skip;

rodar('Mensagens não lidas (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let service: typeof import('../src/modules/mensagens/mensagens.service');
  const sufixo = randomUUID().slice(0, 8);

  const ids = {
    unidade: '', outraUnidade: '', unidadeUser: '', gestorA: '', gestorB: '', outraUnidadeUser: '',
    pedidoDecidido: '', pedidoPendente: '', manutencao: '',
  };
  const usuario = (perfil: Perfil, sub: string, unidadeId: string | null = null): AuthPayload =>
    ({ sub, perfil, unidadeId, nome: 'Teste' }) as AuthPayload;

  const msg = (alvo: { solicitacaoId?: string; manutencaoId?: string }, autorId: string, texto: string, em: string) =>
    prisma.mensagemChat.create({ data: { ...alvo, autorId, texto, criadoEm: new Date(em) } });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    prisma = new PrismaClient({ datasourceUrl: URL });
    service = await import('../src/modules/mensagens/mensagens.service');

    const u1 = await prisma.unidade.create({ data: { nome: `UBS A ${sufixo}`, tipo: 'UBSF' } });
    const u2 = await prisma.unidade.create({ data: { nome: `UBS B ${sufixo}`, tipo: 'UBSF' } });
    const novoUsuario = (nome: string, perfil: Perfil, unidadeId?: string) =>
      prisma.usuario.create({
        data: { nome, perfil, unidadeId, email: `${nome}.${sufixo}@teste.local`, matricula: `${nome}${sufixo}`, senhaHash: 'x' },
      });
    const [unid, gA, gB, outro] = await Promise.all([
      novoUsuario('unidade', Perfil.UNIDADE, u1.id),
      novoUsuario('gestorA', Perfil.GESTOR_PATRIMONIO),
      novoUsuario('gestorB', Perfil.GESTOR_PATRIMONIO),
      novoUsuario('outra', Perfil.UNIDADE, u2.id),
    ]);
    Object.assign(ids, { unidade: u1.id, outraUnidade: u2.id, unidadeUser: unid.id, gestorA: gA.id, gestorB: gB.id, outraUnidadeUser: outro.id });

    // pedido já decidido pelo gestor A
    const decidido = await prisma.solicitacao.create({
      data: { tipo: 'AMPLIACAO', justificativa: 'teste', unidadeOrigemId: u1.id, criadoPorId: unid.id, decididoPorId: gA.id, status: StatusSolicitacao.AGUARDANDO_ENTREGA },
    });
    // pedido pendente, sem decisão: fila de todos os Gestores de Patrimônio
    const pendente = await prisma.solicitacao.create({
      data: { tipo: 'AMPLIACAO', justificativa: 'teste', unidadeOrigemId: u1.id, criadoPorId: unid.id, status: StatusSolicitacao.PENDENTE_APROVACAO },
    });
    Object.assign(ids, { pedidoDecidido: decidido.id, pedidoPendente: pendente.id });

    await msg({ solicitacaoId: decidido.id }, gA.id, 'g1', '2026-10-10T10:00:00Z');
    await msg({ solicitacaoId: decidido.id }, gA.id, 'g2', '2026-10-10T10:05:00Z');
    await msg({ solicitacaoId: decidido.id }, unid.id, 'u1', '2026-10-10T10:10:00Z');
    await msg({ solicitacaoId: pendente.id }, unid.id, 'primeira', '2026-10-10T11:00:00Z');
  });

  afterAll(async () => {
    await prisma.mensagemChat.deleteMany({ where: { autorId: { in: [ids.unidadeUser, ids.gestorA] } } });
    await prisma.solicitacao.deleteMany({ where: { id: { in: [ids.pedidoDecidido, ids.pedidoPendente] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [ids.unidadeUser, ids.gestorA, ids.gestorB, ids.outraUnidadeUser] } } });
    await prisma.unidade.deleteMany({ where: { id: { in: [ids.unidade, ids.outraUnidade] } } });
    await prisma.$disconnect();
  });

  const naoLidasDe = async (u: AuthPayload, id: string) =>
    (await service.listarConversas(u)).find((c) => c.id === id)?.naoLidas;

  it('conta só mensagens de outras pessoas e ignora as próprias', async () => {
    expect(await naoLidasDe(usuario(Perfil.UNIDADE, ids.unidadeUser, ids.unidade), ids.pedidoDecidido)).toBe(2);
    expect(await naoLidasDe(usuario(Perfil.GESTOR_PATRIMONIO, ids.gestorA), ids.pedidoDecidido)).toBe(1);
    expect((await service.contarNaoLidas(usuario(Perfil.UNIDADE, ids.unidadeUser, ids.unidade))).total).toBe(2);
  });

  it('marcar como lida só avança: leitura mais antiga não desfaz a mais nova e o futuro é limitado a agora', async () => {
    const u = usuario(Perfil.UNIDADE, ids.unidadeUser, ids.unidade);
    await service.marcarLida(u, 'solicitacao', ids.pedidoDecidido, new Date('2026-10-10T10:00:00Z'));
    expect(await naoLidasDe(u, ids.pedidoDecidido)).toBe(1); // só g2 restou
    await service.marcarLida(u, 'solicitacao', ids.pedidoDecidido, new Date('2026-10-10T09:00:00Z')); // mais antiga
    expect(await naoLidasDe(u, ids.pedidoDecidido)).toBe(1);
    await service.marcarLida(u, 'solicitacao', ids.pedidoDecidido, new Date('2999-01-01T00:00:00Z')); // futuro
    expect(await naoLidasDe(u, ids.pedidoDecidido)).toBe(0);
    const [leitura] = await prisma.leituraConversa.findMany({ where: { usuarioId: ids.unidadeUser, solicitacaoId: ids.pedidoDecidido } });
    expect(leitura.lidaAte.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('o upsert é atômico: chamadas concorrentes geram um único registro e nenhuma falha', async () => {
    const u = usuario(Perfil.GESTOR_PATRIMONIO, ids.gestorA);
    const resultados = await Promise.allSettled(
      Array.from({ length: 25 }, (_, i) =>
        service.marcarLida(u, 'solicitacao', ids.pedidoDecidido, new Date(Date.UTC(2026, 9, 10, 10, i))),
      ),
    );
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(0);
    expect(await prisma.leituraConversa.count({ where: { usuarioId: ids.gestorA, solicitacaoId: ids.pedidoDecidido } })).toBe(1);
  });

  it('Unidade de outra unidade não marca nem lê a conversa', async () => {
    const outra = usuario(Perfil.UNIDADE, ids.outraUnidadeUser, ids.outraUnidade);
    await expect(service.marcarLida(outra, 'solicitacao', ids.pedidoDecidido, new Date())).rejects.toMatchObject({ statusCode: 403 });
    expect(await naoLidasDe(outra, ids.pedidoDecidido)).toBeUndefined();
  });

  it('gestor só enxerga conversa em que está envolvido; pedido pendente sem decisão é fila de todos', async () => {
    const gestorB = usuario(Perfil.GESTOR_PATRIMONIO, ids.gestorB);
    const lista = await service.listarConversas(gestorB);
    expect(lista.map((c) => c.id)).toContain(ids.pedidoPendente); // fila
    expect(lista.map((c) => c.id)).not.toContain(ids.pedidoDecidido); // decidido por outro gestor
    // ao decidir, o pedido sai da fila dos demais e passa a ser do gestor que decidiu
    await prisma.solicitacao.update({ where: { id: ids.pedidoPendente }, data: { decididoPorId: ids.gestorA, status: StatusSolicitacao.AGUARDANDO_ENTREGA } });
    expect((await service.listarConversas(gestorB)).map((c) => c.id)).not.toContain(ids.pedidoPendente);
    expect((await service.listarConversas(usuario(Perfil.GESTOR_PATRIMONIO, ids.gestorA))).map((c) => c.id)).toContain(ids.pedidoPendente);
    // escrever na conversa torna o gestor B envolvido
    await msg({ solicitacaoId: ids.pedidoPendente }, ids.gestorB, 'entrei', '2026-10-10T12:00:00Z');
    expect((await service.listarConversas(gestorB)).map((c) => c.id)).toContain(ids.pedidoPendente);
    await prisma.mensagemChat.deleteMany({ where: { autorId: ids.gestorB } });
  });

  it('a constraint exige exatamente uma conversa por registro e apagar o pedido apaga a leitura', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO "conversa_leitura" ("id","usuario_id","lida_ate") VALUES (${randomUUID()}, ${ids.gestorA}, now())`,
    ).rejects.toThrow();
    const temp = await prisma.solicitacao.create({ data: { tipo: 'AMPLIACAO', justificativa: 'teste', unidadeOrigemId: ids.unidade, criadoPorId: ids.unidadeUser } });
    await service.marcarLida(usuario(Perfil.GESTOR_PATRIMONIO, ids.gestorA), 'solicitacao', temp.id, new Date());
    expect(await prisma.leituraConversa.count({ where: { solicitacaoId: temp.id } })).toBe(1);
    await prisma.solicitacao.delete({ where: { id: temp.id } });
    expect(await prisma.leituraConversa.count({ where: { solicitacaoId: temp.id } })).toBe(0);
  });
});
