import { parse } from 'csv-parse/sync';
import { EstadoConservacao } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { registrarAuditoria } from '../../services/auditoria.service';

// UC01/RF05/FA06 — importação de CSV no formato exportado pelo e-Pública.
// Colunas esperadas: tombamento, descricao, tipo_codigo, unidade,
// estado_conservacao, emenda_parlamentar, data_aquisicao (opcional).
const COLUNAS_OBRIGATORIAS = ['tombamento', 'descricao', 'tipo_codigo', 'unidade', 'estado_conservacao'];

const ESTADOS: Record<string, EstadoConservacao> = {
  OTIMO: 'OTIMO',
  ÓTIMO: 'OTIMO',
  BOM: 'BOM',
  REGULAR: 'REGULAR',
  RUIM: 'RUIM',
  PESSIMO: 'PESSIMO',
  PÉSSIMO: 'PESSIMO',
};

interface LinhaCsv {
  tombamento: string;
  descricao: string;
  tipo_codigo: string;
  unidade: string;
  estado_conservacao: string;
  emenda_parlamentar?: string;
  data_aquisicao?: string;
}

export async function importarCsv(usuarioId: string, conteudo: Buffer) {
  let linhas: LinhaCsv[];
  try {
    linhas = parse(conteudo, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      delimiter: [',', ';'],
      bom: true,
    }) as LinhaCsv[];
  } catch {
    // FA06 — arquivo fora do formato: importação bloqueada integralmente
    throw new AppError(
      'Arquivo CSV inválido. Verifique se o arquivo está no formato exportado pelo e-Pública.',
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

  // Validação integral antes de processar qualquer linha (FA06)
  const erros: string[] = [];
  const vistos = new Set<string>();
  linhas.forEach((linha, i) => {
    const n = i + 2; // linha no arquivo (1 = cabeçalho)
    if (!linha.tombamento) erros.push(`Linha ${n}: tombamento vazio`);
    else if (vistos.has(linha.tombamento)) erros.push(`Linha ${n}: tombamento ${linha.tombamento} duplicado no arquivo`);
    else vistos.add(linha.tombamento);
    if (!linha.descricao) erros.push(`Linha ${n}: descrição vazia`);
    if (!linha.tipo_codigo) erros.push(`Linha ${n}: tipo_codigo vazio`);
    if (!linha.unidade) erros.push(`Linha ${n}: unidade vazia`);
    if (!ESTADOS[linha.estado_conservacao?.toUpperCase() ?? '']) {
      erros.push(`Linha ${n}: estado de conservação inválido (${linha.estado_conservacao})`);
    }
  });
  if (erros.length > 0) {
    throw new AppError(`O arquivo contém linhas inválidas e nada foi importado. ${erros.slice(0, 10).join('; ')}${erros.length > 10 ? ` (+${erros.length - 10} erros)` : ''}`, 422);
  }

  // Resolve unidades e tipos
  const [unidades, tipos] = await Promise.all([
    prisma.unidade.findMany({ select: { id: true, nome: true } }),
    prisma.tipoEquipamento.findMany({ select: { id: true, codigo: true } }),
  ]);
  const unidadePorNome = new Map(unidades.map((u) => [u.nome.toLowerCase(), u.id]));
  const tipoPorCodigo = new Map(tipos.map((t) => [t.codigo.toLowerCase(), t.id]));

  const errosReferencia: string[] = [];
  linhas.forEach((linha, i) => {
    const n = i + 2;
    if (!unidadePorNome.has(linha.unidade.toLowerCase())) {
      errosReferencia.push(`Linha ${n}: unidade "${linha.unidade}" não cadastrada`);
    }
    if (!tipoPorCodigo.has(linha.tipo_codigo.toLowerCase())) {
      errosReferencia.push(`Linha ${n}: tipo "${linha.tipo_codigo}" não cadastrado`);
    }
  });
  if (errosReferencia.length > 0) {
    throw new AppError(
      `O arquivo referencia unidades ou tipos não cadastrados e nada foi importado. ${errosReferencia.slice(0, 10).join('; ')}${errosReferencia.length > 10 ? ` (+${errosReferencia.length - 10} erros)` : ''}`,
      422,
    );
  }

  // Tombamentos já existentes são ignorados com relatório de conflitos (FA06)
  const existentes = await prisma.equipamento.findMany({
    where: { tombamento: { in: linhas.map((l) => l.tombamento) } },
    select: { tombamento: true },
  });
  const conflitos = new Set(existentes.map((e) => e.tombamento));
  const paraImportar = linhas.filter((l) => !conflitos.has(l.tombamento));

  // Importação atômica: ou tudo é processado, ou nada é alterado
  await prisma.$transaction(async (tx) => {
    for (const linha of paraImportar) {
      const equipamento = await tx.equipamento.create({
        data: {
          tombamento: linha.tombamento,
          descricao: linha.descricao,
          tipoEquipamentoId: tipoPorCodigo.get(linha.tipo_codigo.toLowerCase())!,
          unidadeId: unidadePorNome.get(linha.unidade.toLowerCase())!,
          estadoConservacao: ESTADOS[linha.estado_conservacao.toUpperCase()],
          emendaParlamentar: ['sim', 'true', '1', 'x'].includes(
            (linha.emenda_parlamentar ?? '').toLowerCase(),
          ),
          dataAquisicao: linha.data_aquisicao ? new Date(linha.data_aquisicao) : null,
        },
      });
      await tx.movimentacao.create({
        data: {
          equipamentoId: equipamento.id,
          tipo: 'IMPORTACAO_CSV',
          descricao: 'Importado via CSV (e-Pública)',
          unidadeDestinoId: equipamento.unidadeId,
          usuarioId,
        },
      });
    }
    await registrarAuditoria(
      {
        usuarioId,
        acao: 'IMPORTAR_CSV',
        entidade: 'equipamento',
        dadosDepois: {
          totalLinhas: linhas.length,
          importados: paraImportar.length,
          conflitos: Array.from(conflitos),
        },
      },
      tx,
    );
  }, { timeout: 30000 });

  return {
    totalLinhas: linhas.length,
    importados: paraImportar.length,
    conflitos: Array.from(conflitos),
  };
}
