import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash('sgp12345', 10);

  // Unidades
  const galpao = await prisma.unidade.upsert({
    where: { nome: 'Galpão Central' },
    update: {},
    create: {
      nome: 'Galpão Central',
      tipo: 'GALPAO',
      endereco: 'R. do Almoxarifado, 100 - Joinville',
      emailBase: 'galpao@joinville.sc.gov.br',
    },
  });
  const nomesUnidades: Array<[string, 'UBS' | 'UME' | 'CAC']> = [
    ['UBS Centro', 'UBS'],
    ['UBS Norte', 'UBS'],
    ['UBS Sul', 'UBS'],
    ['UME Guanabara', 'UME'],
    ['CAC', 'CAC'],
  ];
  const unidades: Record<string, string> = {};
  for (const [nome, tipo] of nomesUnidades) {
    const u = await prisma.unidade.upsert({
      where: { nome },
      update: {},
      create: {
        nome,
        tipo,
        endereco: `Joinville - SC`,
        emailBase: `${nome.toLowerCase().replace(/\s/g, '.')}@joinville.sc.gov.br`,
      },
    });
    unidades[nome] = u.id;
  }

  // Usuários (um por perfil)
  const criarUsuario = (nome: string, email: string, matricula: string, perfil: 'GESTOR_PATRIMONIO' | 'GESTOR_MANUTENCAO' | 'UNIDADE' | 'GALPAO', unidadeId?: string) =>
    prisma.usuario.upsert({
      where: { email },
      update: {},
      create: { nome, email, matricula, senhaHash, perfil, unidadeId: unidadeId ?? null },
    });

  await criarUsuario('Samuel Andrade', 'gestor@joinville.sc.gov.br', '10001', 'GESTOR_PATRIMONIO');
  await criarUsuario('Carla Fiscal', 'manutencao@joinville.sc.gov.br', '10002', 'GESTOR_MANUTENCAO');
  const rodrigo = await criarUsuario('Rodrigo Silva', 'ubs.centro@joinville.sc.gov.br', '10003', 'UNIDADE', unidades['UBS Centro']);
  const ana = await criarUsuario('Ana Paula', 'ubs.norte@joinville.sc.gov.br', '10004', 'UNIDADE', unidades['UBS Norte']);
  const paulo = await criarUsuario('Paulo Roberto', 'galpao.user@joinville.sc.gov.br', '10005', 'GALPAO', galpao.id);

  // Responsáveis das unidades (usuários do sistema)
  await prisma.unidade.update({ where: { id: unidades['UBS Centro'] }, data: { responsavelId: rodrigo.id } });
  await prisma.unidade.update({ where: { id: unidades['UBS Norte'] }, data: { responsavelId: ana.id } });
  await prisma.unidade.update({ where: { id: galpao.id }, data: { responsavelId: paulo.id } });

  // Categorias e tipos (taxonomia e-Pública)
  const categorias: Array<[string, string, Array<[string, string]>]> = [
    ['Esterilização', '#0d4f7e', [['AUT-V21', 'Autoclave Vertical 21L'], ['AUT-V50', 'Autoclave Vertical 50L'], ['AUT-V75', 'Autoclave Vertical 75L'], ['AUT-H100', 'Autoclave Horizontal 100L']]],
    ['Laboratório', '#16a34a', [['MIC-BIN', 'Microscópio Binocular'], ['CEN-01', 'Centrífuga de Bancada']]],
    ['Refrigeração', '#2563eb', [['GEL-300', 'Geladeira Hospitalar 300L'], ['GEL-500', 'Geladeira Hospitalar 500L']]],
    ['Climatização', '#9333ea', [['AR-12K', 'Ar-condicionado Split 12.000 BTUs']]],
    ['Odontologia', '#d97706', [['CAD-ODO', 'Cadeira Odontológica']]],
  ];
  const tipos: Record<string, string> = {};
  for (const [nomeCategoria, cor, listaTipos] of categorias) {
    const categoria = await prisma.categoria.upsert({
      where: { nome: nomeCategoria },
      update: { cor },
      create: { nome: nomeCategoria, cor },
    });
    for (const [codigo, nome] of listaTipos) {
      const t = await prisma.tipoEquipamento.upsert({
        where: { codigo },
        update: {},
        create: { codigo, nome, categoriaId: categoria.id },
      });
      tipos[codigo] = t.id;
    }
  }

  // Equipamentos de demonstração
  const equipamentos: Array<{
    tombamento: string;
    tipo: string;
    unidade: string;
    estado: 'OTIMO' | 'BOM' | 'REGULAR' | 'RUIM' | 'PESSIMO';
    aquisicao: string;
    emenda?: boolean;
  }> = [
    { tombamento: '12345/2024', tipo: 'AUT-V75', unidade: 'UBS Centro', estado: 'BOM', aquisicao: '2024-01-14' },
    { tombamento: '12346/2024', tipo: 'AUT-H100', unidade: 'UBS Norte', estado: 'REGULAR', aquisicao: '2023-06-09' },
    { tombamento: '12347/2024', tipo: 'MIC-BIN', unidade: 'UME Guanabara', estado: 'OTIMO', aquisicao: '2024-03-21' },
    { tombamento: '12348/2023', tipo: 'AUT-V21', unidade: 'UBS Sul', estado: 'BOM', aquisicao: '2023-09-04' },
    { tombamento: '12349/2024', tipo: 'GEL-300', unidade: 'CAC', estado: 'OTIMO', aquisicao: '2024-02-17', emenda: true },
    { tombamento: '12350/2023', tipo: 'AUT-V50', unidade: 'UBS Centro', estado: 'PESSIMO', aquisicao: '2020-11-29' },
    { tombamento: '12351/2024', tipo: 'AR-12K', unidade: 'UBS Norte', estado: 'BOM', aquisicao: '2024-05-02' },
    { tombamento: '12352/2024', tipo: 'CAD-ODO', unidade: 'UBS Centro', estado: 'BOM', aquisicao: '2024-04-11' },
  ];
  for (const e of equipamentos) {
    const criado = await prisma.equipamento.upsert({
      where: { tombamento: e.tombamento },
      update: {},
      create: {
        tombamento: e.tombamento,
        descricao: `Equipamento ${e.tombamento}`,
        tipoEquipamentoId: tipos[e.tipo],
        unidadeId: unidades[e.unidade] ?? galpao.id,
        estadoConservacao: e.estado,
        emendaParlamentar: e.emenda ?? false,
        dataAquisicao: new Date(e.aquisicao),
      },
    });
    const jaTemMovimentacao = await prisma.movimentacao.findFirst({
      where: { equipamentoId: criado.id },
    });
    if (!jaTemMovimentacao) {
      await prisma.movimentacao.create({
        data: {
          equipamentoId: criado.id,
          tipo: 'CADASTRO',
          descricao: 'Cadastro inicial (seed)',
          unidadeDestinoId: criado.unidadeId,
        },
      });
    }
  }

  // Atas
  await prisma.ata.upsert({
    where: { numero: '045/2025' },
    update: { fornecedor: 'Equipamentos Médicos Ltda' },
    create: {
      numero: '045/2025',
      fornecedor: 'Equipamentos Médicos Ltda',
      descricao: 'Ata de registro de preços — equipamentos de esterilização',
      valorTotal: 250000,
      saldo: 180000,
      vencimento: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.ata.upsert({
    where: { numero: '052/2024' },
    update: { fornecedor: 'Hospitalar Brasil' },
    create: {
      numero: '052/2024',
      fornecedor: 'Hospitalar Brasil',
      descricao: 'Ata de registro de preços — refrigeração e climatização',
      valorTotal: 320000,
      saldo: 12500,
      vencimento: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    },
  });

  // Contratos de manutenção e serviços
  await prisma.contrato.upsert({
    where: { numero: 'CONT-2025-001' },
    update: {
      tipo: 'Manutenção Preventiva',
      valorTotal: 45000,
      condicoesPagamento: 'Mensal, mediante atesto do fiscal',
    },
    create: {
      numero: 'CONT-2025-001',
      empresa: 'TecSaúde Manutenção Hospitalar Ltda.',
      cnpj: '12345678000190',
      tipo: 'Manutenção Preventiva',
      objeto: 'Manutenção corretiva e preventiva de equipamentos médico-hospitalares',
      valorTotal: 45000,
      condicoesPagamento: 'Mensal, mediante atesto do fiscal',
      status: 'ATIVO',
      vigenciaInicio: new Date('2025-01-01'),
      vigenciaFim: new Date('2026-12-31'),
    },
  });
  await prisma.contrato.upsert({
    where: { numero: 'CONT-2024-045' },
    update: {},
    create: {
      numero: 'CONT-2024-045',
      empresa: 'LabEquip Serviços',
      cnpj: '98765432000110',
      tipo: 'Calibração',
      objeto: 'Calibração periódica de equipamentos laboratoriais',
      valorTotal: 18500,
      status: 'RENOVACAO_PENDENTE',
      vigenciaInicio: new Date('2024-05-31'),
      vigenciaFim: new Date('2025-05-31'),
    },
  });

  // Estoque do galpão
  for (const [codigo, quantidade] of [
    ['AUT-V21', 8],
    ['AUT-V75', 2],
    ['MIC-BIN', 8],
  ] as Array<[string, number]>) {
    await prisma.estoqueGalpao.upsert({
      where: { tipoEquipamentoId: tipos[codigo] },
      update: {},
      create: {
        tipoEquipamentoId: tipos[codigo],
        quantidade,
        ultimaEntradaEm: new Date(),
      },
    });
  }

  console.log('Seed concluído.');
  console.log('Usuários (senha: sgp12345):');
  console.log('  gestor@joinville.sc.gov.br      — Gestor de Patrimônio');
  console.log('  manutencao@joinville.sc.gov.br  — Gestor de Manutenção');
  console.log('  ubs.centro@joinville.sc.gov.br  — Unidade (UBS Centro)');
  console.log('  galpao.user@joinville.sc.gov.br — Galpão');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
