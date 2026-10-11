import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IconeBusca, IconeCheck, IconeChevron } from './icons';
import '../pages/Cadastros.css';
import { EsqueletoTabela } from './Esqueletos';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

export interface ColunaCadastro<T> {
  titulo: string;
  celula: (item: T) => ReactNode;
}

interface Visualizacao {
  valor: string;
  rotulo: string;
}

interface Props<T> {
  id: string;
  titulo: string;
  // Rótulos no singular/plural e frases de estado vazio, já com a concordância certa
  nomes: { plural: string; singular: string; nenhum: string; nenhumEncontrado: string };
  acoes: ReactNode;
  itens: T[];
  carregando: boolean;
  erro: string | null;
  onRecarregar: () => void;
  colunas: Array<ColunaCadastro<T>>;
  chave: (item: T) => string;
  textoBusca: (item: T) => Array<string | null | undefined>;
  visualizacoes?: Visualizacao[];
  correspondeVisualizacao?: (item: T, valor: string) => boolean;
}

const POR_PAGINA = 10;

// Índice de cadastros no mesmo padrão do Inventário: visualizações, busca, tabela e paginação.
export function ListaCadastro<T>({
  id,
  titulo,
  nomes,
  acoes,
  itens,
  carregando,
  erro,
  onRecarregar,
  colunas,
  chave,
  textoBusca,
  visualizacoes,
  correspondeVisualizacao,
}: Props<T>) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState(visualizacoes?.[0]?.valor ?? '');
  const [pagina, setPagina] = useState(1);
  const [menuAberto, setMenuAberto] = useState(false);
  const controles = useRef<HTMLDivElement>(null);
  const falha = Boolean(erro);
  useAlertaNativo(erro, () => undefined);


  useEffect(() => {
    function fechar(evento: PointerEvent | KeyboardEvent) {
      if (evento instanceof KeyboardEvent) {
        if (evento.key !== 'Escape') return;
      } else if (controles.current?.contains(evento.target as Node)) {
        return;
      }
      setMenuAberto(false);
    }
    document.addEventListener('pointerdown', fechar);
    document.addEventListener('keydown', fechar);
    return () => {
      document.removeEventListener('pointerdown', fechar);
      document.removeEventListener('keydown', fechar);
    };
  }, []);

  const filtroPadrao = visualizacoes?.[0]?.valor ?? '';
  const visiveis = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    return itens.filter((item) => {
      const buscaOk = !alvo || textoBusca(item).some((v) => v?.toLowerCase().includes(alvo));
      const filtroOk = filtro === filtroPadrao || !correspondeVisualizacao || correspondeVisualizacao(item, filtro);
      return buscaOk && filtroOk;
    });
  }, [itens, busca, filtro]);

  useEffect(() => {
    setPagina(1);
  }, [busca, filtro]);

  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const visualizacao = visualizacoes?.find((v) => v.valor === filtro);
  const filtrando = Boolean(busca) || filtro !== filtroPadrao;

  return (
    <section className="gestao-page inventario-page cadastro-page" aria-labelledby={`${id}-titulo`}>
      <div className="page-header inventario-cabecalho">
        <div>
          <h2 id={`${id}-titulo`}>{titulo}</h2>
        </div>
        <div className="inventario-lista-acoes">{acoes}</div>
      </div>


      <div className="gestao-lista inventario-lista">
        <div className="inventario-controles" ref={controles}>
          <div className="inventario-indexbar">
            <div className="inventario-consulta" role="search" aria-label={`Pesquisar ${nomes.plural}`}>
              {visualizacoes && (
                <div className="inventario-visualizacao">
                  <button
                    type="button"
                    className="inventario-visualizacao-botao"
                    aria-haspopup="menu"
                    aria-expanded={menuAberto}
                    onClick={() => setMenuAberto((aberto) => !aberto)}
                  >
                    {visualizacao?.rotulo}
                    <IconeChevron />
                  </button>
                  {menuAberto && (
                    <div className="inventario-visualizacao-menu" role="menu" aria-label={`Visualizações: ${nomes.plural}`}>
                      {visualizacoes.map(({ valor, rotulo }) => (
                        <button
                          key={valor}
                          type="button"
                          role="menuitemradio"
                          aria-checked={filtro === valor}
                          onClick={() => {
                            setFiltro(valor);
                            setMenuAberto(false);
                          }}
                        >
                          <span className="inventario-visualizacao-check" aria-hidden>
                            {filtro === valor && <IconeCheck />}
                          </span>
                          <span>{rotulo}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="inventario-consulta-busca">
                <IconeBusca />
                <input
                  aria-label={`Buscar ${nomes.plural}`}
                  placeholder="Buscar e filtrar"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="gestao-tabela-scroll" role="region" aria-label={titulo} tabIndex={0} aria-busy={carregando}>
          <table>
            <caption className="gestao-sr-only">{titulo}</caption>
            <thead>
              <tr>
                {colunas.map((c) => (
                  <th key={c.titulo} scope="col">
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && <EsqueletoTabela colunas={colunas.length} />}
              {!carregando &&
                !falha &&
                visiveis.slice(inicio, inicio + POR_PAGINA).map((item) => (
                  <tr key={chave(item)}>
                    {colunas.map((c, indice) => (
                      <td key={c.titulo} className={indice === 0 ? 'gestao-equipamento' : undefined}>
                        {c.celula(item)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!carregando && (falha || visiveis.length === 0) && (
          <div className="empty-state inventario-vazio">
            <span className="inventario-vazio-mensagem" role="status">
              {falha
                  ? `Não foi possível carregar a lista.`
                  : itens.length === 0
                    ? nomes.nenhum
                    : nomes.nenhumEncontrado}
            </span>
            {!carregando &&
              (falha ? (
                <button className="btn btn-outline inventario-vazio-acao" onClick={onRecarregar}>
                  Tentar novamente
                </button>
              ) : (
                itens.length > 0 &&
                filtrando && (
                  <button
                    className="btn btn-primary inventario-vazio-acao"
                    onClick={() => {
                      setBusca('');
                      setFiltro(filtroPadrao);
                    }}
                  >
                    Limpar filtros
                  </button>
                )
              ))}
          </div>
        )}
        <div className="gestao-rodape">
          <span role="status">
            {carregando ? (
              'Atualizando seleção…'
            ) : falha ? (
              'Indisponível'
            ) : (
              <>
                <strong>
                  {visiveis.length} {visiveis.length === 1 ? nomes.singular : nomes.plural}
                </strong>
                {visiveis.length > 0 && (
                  <span>
                    {' '}
                    · Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, visiveis.length)}
                  </span>
                )}
              </>
            )}
          </span>
          <div className="gestao-paginacao" role="group" aria-label={`Paginação: ${nomes.plural}`}>
            <button
              type="button"
              className="btn btn-outline"
              disabled={carregando || falha || paginaAtual === 1}
              onClick={() => setPagina(paginaAtual - 1)}
              aria-label="Página anterior"
            >
              Anterior
            </button>
            <span>
              Página {paginaAtual} de {totalPaginas}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              disabled={carregando || falha || paginaAtual === totalPaginas}
              onClick={() => setPagina(paginaAtual + 1)}
              aria-label="Próxima página"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
