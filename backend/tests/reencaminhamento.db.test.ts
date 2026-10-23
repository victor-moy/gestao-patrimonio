/**
 * Testes com PostgreSQL de verdade (AGENTS.md: mocks do Prisma não validam constraints, SQL nem concorrência).
 * Só rodam com TEST_DATABASE_URL apontando para um banco descartável com as migrações aplicadas; veja o passo a passo
 * em conversas-nao-lidas.db.test.ts. Sem a variável, o arquivo é ignorado.
 */
import { randomUUID } from 'crypto';
import { PrismaClient, Perfil } from '@prisma/client';
import type { AuthPayload } from '../src/middlewares/auth';

const URL = process.env.TEST_DATABASE_URL;
const rodar = URL ? describe : describe.skip;

rodar('Reencaminhamento de chamados (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let reencaminhamento: typeof import('../src/modules/manutencoes/manutencoes.reencaminhamento');
  let saldo: typeof import('../src/modules/contratos/saldo');
  const sufixo = randomUUID().slice(0, 8);
  const ids = { unidade: '', admin: '', prestador: '', contrato: '', servico: '', escopo: '', item: '' };
  const criados: string[] = [];
  const admin = (): AuthPayload => ({ sub: ids.admin, perfil: Perfil.OPERADOR, unidadeId: null, nome: 'Admin' }) as AuthPayload;

  const novoChamado = async (extra: Record<string, unknown> = {}) => {
    const m = await prisma.manutencao.create({
      data: {
        tipo: 'CIVIL',
        unidadeId: ids.unidade,
        solicitanteId: ids.admin,
        titulo: 'Ar-condicionado não liga',
        descricaoProblema: 'Não liga',
        localAfetado: 'Consultório 2',
        categoriaCivil: 'ELETRICA',
        ...extra,
      },
    });
    criados.push(m.id);
    return m;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    prisma = new PrismaClient({ datasourceUrl: URL });
    reencaminhamento = await import('../src/modules/manutencoes/manutencoes.reencaminhamento');
    saldo = await import('../src/modules/contratos/saldo');

    const unidade = await prisma.unidade.create({ data: { nome: `UBS ${sufixo}`, tipo: 'UBSF' } });
    const usuario = await prisma.usuario.create({
      data: { nome: 'admin', perfil: Perfil.OPERADOR, email: `admin.${sufixo}@teste.local`, matricula: `adm${sufixo}`, senhaHash: 'x' },
    });
    const prestador = await prisma.prestadorServico.create({ data: { nome: `Prestador ${sufixo}` } });
    const contrato = await prisma.contrato.create({
      data: { numero: `C-${sufixo}`, prestadorId: prestador.id, objeto: 'teste', vigenciaInicio: new Date('2026-01-01'), vigenciaFim: new Date('2027-01-01') },
    });
    const servico = await prisma.servicoContrato.create({ data: { nome: `Serviço ${sufixo}` } });
    const escopo = await prisma.escopoServico.create({ data: { nome: `Escopo ${sufixo}`, cobreCivil: true } });
    const item = await prisma.contratoItem.create({ data: { contratoId: contrato.id, servicoId: servico.id, escopoId: escopo.id, valor: 1000 } });
    Object.assign(ids, { unidade: unidade.id, admin: usuario.id, prestador: prestador.id, contrato: contrato.id, servico: servico.id, escopo: escopo.id, item: item.id });
  });

  afterAll(async () => {
    // Filhos antes dos pais (a chave estrangeira é Restrict)
    await prisma.logAuditoria.deleteMany({ where: { usuarioId: ids.admin } });
    await prisma.avisoUsuario.deleteMany({ where: { usuarioId: ids.admin } });
    await prisma.manutencao.deleteMany({ where: { id: { in: criados }, reencaminhadoDeId: { not: null } } });
    await prisma.manutencao.deleteMany({ where: { id: { in: criados } } });
    await prisma.contratoItem.deleteMany({ where: { id: ids.item } });
    await prisma.contrato.deleteMany({ where: { id: ids.contrato } });
    await prisma.servicoContrato.deleteMany({ where: { id: ids.servico } });
    await prisma.escopoServico.deleteMany({ where: { id: ids.escopo } });
    await prisma.prestadorServico.deleteMany({ where: { id: ids.prestador } });
    await prisma.usuario.deleteMany({ where: { id: ids.admin } });
    await prisma.unidade.deleteMany({ where: { id: ids.unidade } });
    await prisma.$disconnect();
  });

  it('duas decisões simultâneas geram um único novo chamado e a outra é recusada', async () => {
    const origem = await novoChamado({
      status: 'REENCAMINHAMENTO_SOLICITADO',
      motivoReencaminhamento: 'Defeito no equipamento',
      reencaminhamentoConfirmadoEm: new Date(),
    });
    const tentativas = await Promise.allSettled([
      reencaminhamento.reencaminharParaManutencao(admin(), origem.id, { tipo: 'CIVIL' }),
      reencaminhamento.reencaminharParaManutencao(admin(), origem.id, { tipo: 'CIVIL' }),
    ]);

    expect(tentativas.filter((t) => t.status === 'fulfilled')).toHaveLength(1);
    const recusada = tentativas.find((t) => t.status === 'rejected') as PromiseRejectedResult;
    expect(recusada.reason).toMatchObject({ statusCode: 409 });
    const filhos = await prisma.manutencao.findMany({ where: { reencaminhadoDeId: origem.id } });
    expect(filhos).toHaveLength(1);
    criados.push(filhos[0].id);
    // O novo nasce na triagem, ligado ao caso e sem nada do prestador
    expect(filhos[0]).toMatchObject({ status: 'PENDENTE_APROVACAO', casoId: origem.id, contratoId: null, contratoItemId: null });
    expect((await prisma.manutencao.findUniqueOrThrow({ where: { id: origem.id } })).status).toBe('CONCLUIDA');
  });

  it('o pedido de reencaminhamento só vale uma vez, mesmo com cliques simultâneos', async () => {
    const m = await novoChamado({ status: 'EM_EXECUCAO', contratoId: ids.contrato, contratoItemId: ids.item });
    const terceirizada = { sub: ids.admin, perfil: Perfil.TERCEIRIZADA, prestadorId: ids.prestador, nome: 'Terc' } as AuthPayload;
    const tentativas = await Promise.allSettled([
      reencaminhamento.solicitarReencaminhamento(terceirizada, m.id, 'Defeito no equipamento, não na instalação'),
      reencaminhamento.solicitarReencaminhamento(terceirizada, m.id, 'Defeito no equipamento, não na instalação'),
    ]);
    expect(tentativas.filter((t) => t.status === 'fulfilled')).toHaveLength(1);
    const logs = await prisma.logAuditoria.count({ where: { entidadeId: m.id, acao: 'SOLICITAR_REENCAMINHAMENTO' } });
    expect(logs).toBe(1);
  });

  it('a trajetória lista a cadeia na ordem, a partir de qualquer etapa', async () => {
    const raiz = await novoChamado({ status: 'CONCLUIDA' });
    const segunda = await novoChamado({ status: 'CONCLUIDA', casoId: raiz.id, reencaminhadoDeId: raiz.id });
    const terceira = await novoChamado({ casoId: raiz.id, reencaminhadoDeId: segunda.id });

    for (const partida of [raiz, segunda, terceira]) {
      const etapas = await reencaminhamento.trajetoria(admin(), partida.id);
      expect(etapas.map((e) => e.id)).toEqual([raiz.id, segunda.id, terceira.id]);
      expect(etapas.find((e) => e.atual)?.id).toBe(partida.id);
    }
  });

  it('o saldo do item não fica preso a um orçamento de serviço que não foi feito', async () => {
    const base = { contratoId: ids.contrato, contratoItemId: ids.item };
    await novoChamado({ ...base, status: 'EM_EXECUCAO', orcamentoValor: 300 });
    // Encerrado por reencaminhamento sem custo final: libera
    await novoChamado({ ...base, status: 'CONCLUIDA', orcamentoValor: 500, reencaminhamentoConfirmadoEm: new Date() });
    // Concluído de verdade (sem reencaminhamento): conta
    await novoChamado({ ...base, status: 'CONCLUIDA', orcamentoValor: 100, custoFinal: 120 });
    // Reencaminhado, mas com custo final já apurado: conta
    await novoChamado({ ...base, status: 'CONCLUIDA', orcamentoValor: 50, custoFinal: 60, reencaminhamentoConfirmadoEm: new Date() });

    const mapa = await saldo.comprometidoPorItem(prisma, [ids.item]);
    expect(mapa.get(ids.item)).toBe(300 + 120 + 60);
  });
});
