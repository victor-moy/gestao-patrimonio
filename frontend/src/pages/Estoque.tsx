import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, urlArquivo } from '../api/client';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { Modal } from '../components/Modal';
import { IconeBusca, IconeCaixa, IconeEntrada, IconeSaida, IconeUpload } from '../components/icons';
import type { Categoria, EstoqueItem, Unidade } from '../types';
import { capitalizarPalavras } from '../utils/format';

interface ResultadoImportacaoEstoque {
  totalLinhas: number;
  itensUnicos: number;
  tiposCriados: number;
  itensAtualizados: number;
  ajustes: number;
  duplicados: string[];
}

type StatusItem = 'OK' | 'BAIXO' | 'ESGOTADO';
type FiltroStatus = '' | StatusItem;
type Ordenacao = 'nome' | 'qtd_asc' | 'qtd_desc';

const TAMANHO_PAGINA = 20;

function statusDoItem(qtd: number): StatusItem {
  if (qtd === 0) return 'ESGOTADO';
  if (qtd <= 3) return 'BAIXO';
  return 'OK';
}

function rotuloStatus(status: StatusItem) {
  if (status === 'ESGOTADO') return 'Estoque zero';
  if (status === 'BAIXO') return 'Estoque baixo';
  return 'Estoque coberto';
}

function corStatus(status: StatusItem) {
  if (status === 'ESGOTADO') return 'var(--red-text)';
  if (status === 'BAIXO') return 'var(--yellow-text)';
  return 'var(--green)';
}

// Gera os números de página exibidos na paginação, com "..." nas lacunas
function paginasVisiveis(atual: number, total: number): Array<number | '...'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const paginas = new Set([1, total, atual - 1, atual, atual + 1]);
  const ordenadas = Array.from(paginas)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const resultado: Array<number | '...'> = [];
  ordenadas.forEach((p, i) => {
    if (i > 0 && p - (ordenadas[i - 1] as number) > 1) resultado.push('...');
    resultado.push(p);
  });
  return resultado;
}

export function Estoque() {
  const [itens, setItens] = useState<EstoqueItem[]>([]);
  const [galpoes, setGalpoes] = useState<Unidade[]>([]);
  const [galpaoId, setGalpaoId] = useState('');
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('nome');
  const [pagina, setPagina] = useState(1);
  const [modal, setModal] = useState<{ operacao: 'entrada' | 'saida'; tipoId?: string } | null>(null);
  const [mensagem, setMensagem] = useMensagemTemporaria();
  const [erro, setErro] = useState<string | null>(null);
  const inputCsv = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<Unidade[]>('/unidades')
      .then((us) => {
        const soGalpoes = us.filter((u) => u.tipo === 'GALPAO');
        setGalpoes(soGalpoes);
        setGalpaoId((atual) => atual || soGalpoes[0]?.id || '');
      })
      .catch(() => {});
  }, []);

  const carregar = useCallback(() => {
    if (!galpaoId) return;
    api
      .get<EstoqueItem[]>(`/estoque?unidadeId=${galpaoId}`)
      .then(setItens)
      .catch((e) => setErro(e.message));
  }, [galpaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function importarCsv(arquivo: File) {
    setErro(null);
    setMensagem(null);
    const form = new FormData();
    form.append('arquivo', arquivo);
    form.append('unidadeId', galpaoId);
    try {
      const r = await api.post<ResultadoImportacaoEstoque>('/estoque/importar-csv', form);
      setMensagem(
        `Importação concluída: ${r.itensUnicos} itens processados` +
          `${r.tiposCriados > 0 ? `, ${r.tiposCriados} novos cadastrados` : ''}` +
          `${r.ajustes > 0 ? `, ${r.ajustes} com ajuste de saldo` : ''}.` +
          (r.duplicados.length > 0
            ? ` Códigos duplicados no arquivo (usada a última ocorrência): ${r.duplicados.join(', ')}.`
            : ''),
      );
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na importação');
    }
  }

  function limparFiltrosEstoque() {
    setBusca('');
    setFiltroCategoria('');
    setFiltroStatus('');
    setOrdenacao('nome');
    setPagina(1);
  }

  // Totais gerais (não sofrem efeito dos filtros/busca — visão geral do estoque)
  const stats = useMemo(() => {
    const baixo = itens.filter((i) => statusDoItem(i.quantidade) === 'BAIXO').length;
    const esgotado = itens.filter((i) => statusDoItem(i.quantidade) === 'ESGOTADO').length;
    return { total: itens.length, baixo, esgotado };
  }, [itens]);

  const categoriasDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(itens.map((i) => i.tipoEquipamento.categoria?.nome).filter((n): n is string => !!n)),
      ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [itens],
  );

  const filtradosOrdenados = useMemo(() => {
    const alvo = busca.toLowerCase();
    const filtrados = itens.filter((i) => {
      const buscaOk =
        !alvo ||
        i.tipoEquipamento.nome.toLowerCase().includes(alvo) ||
        i.tipoEquipamento.codigo.toLowerCase().includes(alvo) ||
        (i.tipoEquipamento.categoria?.nome.toLowerCase().includes(alvo) ?? false);
      const categoriaOk = !filtroCategoria || i.tipoEquipamento.categoria?.nome === filtroCategoria;
      const statusOk = !filtroStatus || statusDoItem(i.quantidade) === filtroStatus;
      return buscaOk && categoriaOk && statusOk;
    });
    return [...filtrados].sort((a, b) => {
      if (ordenacao === 'qtd_asc') return a.quantidade - b.quantidade;
      if (ordenacao === 'qtd_desc') return b.quantidade - a.quantidade;
      return a.tipoEquipamento.nome.localeCompare(b.tipoEquipamento.nome, 'pt-BR');
    });
  }, [itens, busca, filtroCategoria, filtroStatus, ordenacao]);

  // Sempre que os filtros/busca mudam, volta pra primeira página
  useEffect(() => {
    setPagina(1);
  }, [busca, filtroCategoria, filtroStatus, ordenacao]);

  const totalPaginas = Math.max(1, Math.ceil(filtradosOrdenados.length / TAMANHO_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * TAMANHO_PAGINA;
  const itensDaPagina = filtradosOrdenados.slice(inicio, inicio + TAMANHO_PAGINA);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Gestão de Estoque</h2>
          <p className="subtitle">Controle do estoque disponível para distribuição</p>
        </div>
        <div className="page-actions">
          <select
            className="estoque-select"
            value={galpaoId}
            onChange={(e) => setGalpaoId(e.target.value)}
            aria-label="Galpão"
          >
            {galpoes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
          <input
            ref={inputCsv}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) importarCsv(arquivo);
              e.target.value = '';
            }}
          />
          <button
            className="btn btn-outline btn-leve"
            disabled={!galpaoId}
            onClick={() => inputCsv.current?.click()}
          >
            <IconeUpload /> Importar CSV
          </button>
        </div>
      </div>

      {mensagem && <div className="success-banner toast-sucesso">{mensagem}</div>}
      {erro && <div className="error-banner toast-erro">{erro}</div>}

      <div className="estoque-stats">
            <div className="estoque-stat">
              <div className="estoque-stat-icone estoque-stat-icone--azul">
                <IconeCaixa />
              </div>
              <div>
                <div className="estoque-stat-valor">{stats.total}</div>
                <div className="estoque-stat-label">Total de produtos</div>
              </div>
            </div>
            <div className="estoque-stat">
              <div className="estoque-stat-icone estoque-stat-icone--amber">
                <IconeCaixa />
              </div>
              <div>
                <div className="estoque-stat-valor">{stats.baixo}</div>
                <div className="estoque-stat-label">Estoque baixo</div>
              </div>
            </div>
            <div className="estoque-stat">
              <div className="estoque-stat-icone estoque-stat-icone--vermelho">
                <IconeCaixa />
              </div>
              <div>
                <div className="estoque-stat-valor">{stats.esgotado}</div>
                <div className="estoque-stat-label">Estoque zero</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="estoque-toolbar">
              <div className="estoque-search">
                <IconeBusca />
                <input
                  placeholder="Buscar por nome, código ou categoria..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <select
                className="estoque-select"
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
              >
                <option value="">Todas as categorias</option>
                {categoriasDisponiveis.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="estoque-select"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}
              >
                <option value="">Todos os status</option>
                <option value="OK">Estoque coberto</option>
                <option value="BAIXO">Estoque baixo</option>
                <option value="ESGOTADO">Estoque zero</option>
              </select>
              <select
                className="estoque-select"
                value={ordenacao}
                onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
              >
                <option value="nome">Ordenar por nome</option>
                <option value="qtd_asc">Menor quantidade</option>
                <option value="qtd_desc">Maior quantidade</option>
              </select>
            </div>

            <div className="estoque-tabela-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Imagem</th>
                    <th>Produto</th>
                    <th>Código</th>
                    <th>Categoria</th>
                    <th>Estoque</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itensDaPagina.map((item) => {
                    const status = statusDoItem(item.quantidade);
                    const cor = item.tipoEquipamento.categoria?.cor || '#6b7280';
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="estoque-produto-thumb">
                            {item.tipoEquipamento.imagemUrl ? (
                              <img
                                src={urlArquivo(item.tipoEquipamento.imagemUrl)}
                                alt={item.tipoEquipamento.nome}
                              />
                            ) : (
                              <IconeCaixa />
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="estoque-produto-nome">
                            {capitalizarPalavras(item.tipoEquipamento.nome)}
                          </div>
                          {item.tipoEquipamento.descricao && (
                            <div className="celula-sub">{capitalizarPalavras(item.tipoEquipamento.descricao)}</div>
                          )}
                        </td>
                        <td>#{item.tipoEquipamento.codigo}</td>
                        <td>
                          {item.tipoEquipamento.categoria && (
                            <span
                              className="pill-categoria"
                              style={{ background: `${cor}1f`, color: cor }}
                            >
                              {item.tipoEquipamento.categoria.nome}
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: corStatus(status) }}>
                            {item.quantidade} <small>un.</small>
                          </span>
                        </td>
                        <td>
                          <span
                            className={`badge badge-leve badge-${
                              status === 'ESGOTADO' ? 'red' : status === 'BAIXO' ? 'yellow' : 'green'
                            }`}
                          >
                            {rotuloStatus(status)}
                          </span>
                        </td>
                        <td>
                          <div className="estoque-acoes-linha">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm btn-leve"
                              onClick={() => setModal({ operacao: 'entrada', tipoId: item.tipoEquipamento.id })}
                            >
                              <IconeEntrada /> Entrada
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm btn-leve"
                              onClick={() => setModal({ operacao: 'saida', tipoId: item.tipoEquipamento.id })}
                            >
                              <IconeSaida /> Saída
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {itensDaPagina.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="estoque-vazio">
                          <div className="estoque-vazio-icone">
                            <IconeCaixa />
                          </div>
                          {itens.length === 0 ? (
                            <>
                              <div className="estoque-vazio-titulo">Nenhum item cadastrado no estoque</div>
                              <div className="estoque-vazio-sub">
                                Os itens aparecerão aqui após o primeiro cadastro ou importação.
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="estoque-vazio-titulo">Nenhum item encontrado</div>
                              <div className="estoque-vazio-sub">
                                Ajuste a busca ou os filtros para ver outros itens.
                              </div>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={limparFiltrosEstoque}>
                                Limpar filtros
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filtradosOrdenados.length > 0 && (
              <div className="estoque-paginacao">
                <div className="estoque-paginacao-info">
                  Mostrando {inicio + 1} a {Math.min(inicio + TAMANHO_PAGINA, filtradosOrdenados.length)} de{' '}
                  {filtradosOrdenados.length} produtos
                </div>
                <div className="estoque-paginacao-botoes">
                  <button
                    type="button"
                    className="btn-icone"
                    disabled={paginaAtual === 1}
                    onClick={() => setPagina(1)}
                    aria-label="Primeira página"
                  >
                    «
                  </button>
                  <button
                    type="button"
                    className="btn-icone"
                    disabled={paginaAtual === 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    aria-label="Página anterior"
                  >
                    ‹
                  </button>
                  {paginasVisiveis(paginaAtual, totalPaginas).map((p, i) =>
                    p === '...' ? (
                      <span key={`ellipsis-${i}`} className="estoque-paginacao-ellipsis">
                        …
                      </span>
                    ) : (
                      <button
                        type="button"
                        key={p}
                        className={`estoque-paginacao-pagina${p === paginaAtual ? ' active' : ''}`}
                        onClick={() => setPagina(p)}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    className="btn-icone"
                    disabled={paginaAtual === totalPaginas}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    aria-label="Próxima página"
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    className="btn-icone"
                    disabled={paginaAtual === totalPaginas}
                    onClick={() => setPagina(totalPaginas)}
                    aria-label="Última página"
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </div>

      {modal && (
        <MovimentarEstoque
          operacao={modal.operacao}
          galpaoId={galpaoId}
          tipoEquipamentoIdInicial={modal.tipoId}
          onFechar={() => setModal(null)}
          onSucesso={(msg) => {
            setModal(null);
            setMensagem(msg);
            carregar();
          }}
        />
      )}
    </>
  );
}

function MovimentarEstoque({
  operacao,
  galpaoId,
  tipoEquipamentoIdInicial,
  onFechar,
  onSucesso,
}: {
  operacao: 'entrada' | 'saida';
  galpaoId: string;
  tipoEquipamentoIdInicial?: string;
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useMensagemTemporaria();
  const [form, setForm] = useState({
    tipoEquipamentoId: tipoEquipamentoIdInicial ?? '',
    quantidade: 1,
    unidadeDestinoId: '',
  });

  useEffect(() => {
    api.get<Categoria[]>('/categorias').then(setCategorias).catch(() => {});
    if (operacao === 'saida') api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
  }, [operacao]);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      if (operacao === 'entrada') {
        await api.post('/estoque/entrada', {
          tipoEquipamentoId: form.tipoEquipamentoId,
          quantidade: Number(form.quantidade),
          unidadeId: galpaoId,
        });
        onSucesso('Entrada registrada no estoque.');
      } else {
        await api.post('/estoque/saida', {
          tipoEquipamentoId: form.tipoEquipamentoId,
          quantidade: Number(form.quantidade),
          unidadeId: galpaoId,
          ...(form.unidadeDestinoId ? { unidadeDestinoId: form.unidadeDestinoId } : {}),
        });
        onSucesso('Saída registrada no estoque.');
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <Modal
      titulo={operacao === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída'}
      onFechar={onFechar}
    >
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="info-grid">
          <div className="field">
            <label>Tipo de Item *</label>
            <select
              value={form.tipoEquipamentoId}
              onChange={(e) => setForm({ ...form, tipoEquipamentoId: e.target.value })}
              required
            >
              <option value="">Selecione...</option>
              {categorias.map((c) => (
                <optgroup key={c.id} label={c.nome}>
                  {c.tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Quantidade *</label>
            <input
              type="number"
              min="1"
              value={form.quantidade}
              onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
              required
            />
          </div>
          {operacao === 'saida' && (
            <div className="field">
              <label>Unidade de Destino *</label>
              <select
                value={form.unidadeDestinoId}
                onChange={(e) => setForm({ ...form, unidadeDestinoId: e.target.value })}
                required
              >
                <option value="">Selecione...</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Confirmar
          </button>
        </div>
      </form>
    </Modal>
  );
}
