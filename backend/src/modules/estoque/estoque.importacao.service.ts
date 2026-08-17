import { parse } from 'csv-parse/sync';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';
import { inferirCategoria } from './categorizacao';

// Importação do relatório de estoque consolidado (Branet). Diferente da
// importação de equipamentos (e-Pública/tombamento — módulo `importacao`),
// aqui cada linha é uma "mercadoria" agregada por código: gera/atualiza um
// TipoEquipamento e o saldo correspondente em EstoqueGalpao, não um
// Equipamento individual com tombamento.
const COLUNAS_OBRIGATORIAS = ['mercadoriacodigocliente', 'mercadorianome', 'quantidadeestoque'];

interface LinhaCsv {
  mercadoriacodigocliente: string;
  mercadorianome: string;
  quantidadeestoque: string;
}

export async function importarEstoqueCsv(usuarioId: string, conteudo: Buffer, unidadeId: string) {
  let linhas: LinhaCsv[];
  try {
    linhas = parse(conteudo, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      delimiter: [';', ','],
      bom: true,
    }) as LinhaCsv[];
  } catch {
    throw new AppError(
      'Arquivo CSV inválido. Verifique se o arquivo está no formato do relatório de estoque consolidado.',
      422,
    );
  }
  if (linhas.length === 0) {
    throw new AppError('O arquivo CSV está vazio.', 422);
  }
  // RNF03 — limite operacional de 10.000 linhas por importação
  if (linhas.length > 10000) {
    throw new AppError('O arquivo excede o limite de 10.000 linhas por importação.', 422);
  }
  const colunas = Object.keys(linhas[0]);
  const faltantes = COLUNAS_OBRIGATORIAS.filter((c) => !colunas.includes(c));
  if (faltantes.length > 0) {
    throw new AppError(
      `Arquivo fora do formato esperado — colunas ausentes: ${faltantes.join(', ')}.`,
      422,
    );
  }

  const erros: string[] = [];
  linhas.forEach((linha, i) => {
    const n = i + 2; // linha no arquivo (1 = cabeçalho)
    if (!linha.mercadoriacodigocliente?.trim()) erros.push(`Linha ${n}: código do item vazio`);
    if (!linha.mercadorianome?.trim()) erros.push(`Linha ${n}: nome do item vazio`);
  });
  if (erros.length > 0) {
    throw new AppError(
      `O arquivo contém linhas inválidas e nada foi importado. ${erros.slice(0, 10).join('; ')}${erros.length > 10 ? ` (+${erros.length - 10} erros)` : ''}`,
      422,
    );
  }

  // Dedup por código — se o mesmo item aparecer mais de uma vez no relatório,
  // vale a última ocorrência
  const porCodigo = new Map<string, LinhaCsv>();
  const duplicados = new Set<string>();
  for (const linha of linhas) {
    const codigo = linha.mercadoriacodigocliente.trim();
    if (porCodigo.has(codigo)) duplicados.add(codigo);
    porCodigo.set(codigo, linha);
  }

  let tiposCriados = 0;
  let itensAtualizados = 0;
  let ajustes = 0;

  // Importação atômica: ou tudo é processado, ou nada é alterado
  await prisma.$transaction(async (tx) => {
    for (const linha of porCodigo.values()) {
      const codigo = linha.mercadoriacodigocliente.trim();
      const nome = linha.mercadorianome.trim().replace(/\s+/g, ' ');
      const quantidade = Math.max(0, parseInt(linha.quantidadeestoque, 10) || 0);

      let tipo = await tx.tipoEquipamento.findUnique({ where: { codigo } });
      if (!tipo) {
        // Item novo: categoriza por heurística. Itens já cadastrados mantêm
        // nome/categoria atuais — só o saldo é atualizado pela importação.
        const { nome: nomeCategoria, cor } = inferirCategoria(nome);
        const categoria = await tx.categoria.upsert({
          where: { nome: nomeCategoria },
          update: {},
          create: { nome: nomeCategoria, cor },
        });
        tipo = await tx.tipoEquipamento.create({
          data: { codigo, nome, categoriaId: categoria.id },
        });
        tiposCriados += 1;
      }

      const estoqueAtual = await tx.estoqueGalpao.findUnique({
        where: { tipoEquipamentoId_unidadeId: { tipoEquipamentoId: tipo.id, unidadeId } },
      });
      const quantidadeAnterior = estoqueAtual?.quantidade ?? 0;
      const delta = quantidade - quantidadeAnterior;

      const estoque = await tx.estoqueGalpao.upsert({
        where: { tipoEquipamentoId_unidadeId: { tipoEquipamentoId: tipo.id, unidadeId } },
        create: {
          tipoEquipamentoId: tipo.id,
          unidadeId,
          quantidade,
          ultimaEntradaEm: delta > 0 ? new Date() : null,
        },
        update: {
          quantidade,
          ...(delta > 0 ? { ultimaEntradaEm: new Date() } : {}),
        },
      });
      itensAtualizados += 1;

      // Registra a diferença como movimentação para preservar o histórico —
      // já "atualizado no Branet" porque a própria origem do dado é o Branet.
      if (delta !== 0) {
        await tx.movimentacaoEstoque.create({
          data: {
            estoqueId: estoque.id,
            tipo: delta > 0 ? 'ENTRADA' : 'SAIDA',
            quantidade: Math.abs(delta),
            usuarioId,
            atualizadoNoBranet: true,
          },
        });
        ajustes += 1;
      }
    }

    await registrarAuditoria(
      {
        usuarioId,
        acao: 'IMPORTAR_ESTOQUE_CSV',
        entidade: 'estoque_galpao',
        dadosDepois: {
          unidadeId,
          totalLinhas: linhas.length,
          itensUnicos: porCodigo.size,
          tiposCriados,
          ajustes,
          duplicados: Array.from(duplicados),
        },
      },
      tx,
    );
  }, { timeout: 30000 });

  return {
    totalLinhas: linhas.length,
    itensUnicos: porCodigo.size,
    tiposCriados,
    itensAtualizados,
    ajustes,
    duplicados: Array.from(duplicados),
  };
}
