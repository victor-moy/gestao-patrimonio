import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { IconeBusca, IconeCheck, IconeChevron } from '../components/icons';
import type { Contrato } from '../types';
import { ROTULO_STATUS_CONTRATO, TOM_STATUS_CONTRATO } from '../utils/cadastros';
import { formatarData, formatarMoeda } from '../utils/format';
import './Cadastros.css';
import { EsqueletoTabela } from '../components/Esqueletos';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

const POR_PAGINA = 10;
const VISUALIZACOES: Array<[string, string]> = [['', 'Todos'], ...Object.entries(ROTULO_STATUS_CONTRATO)];

export function Contratos() {
  const { usuario } = useAuth();
  const permitido = usuario?.perfil === 'GESTOR_MANUTENCAO' || usuario?.perfil === 'GESTOR_PATRIMONIO';
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const [pagina, setPagina] = useState(1);
  const [menuAberto, setMenuAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Falhas de carregamento: alerta nativo + o estado inline da lista (com \"Tentar novamente\")
  useAlertaNativo(erro, () => undefined);
  const controles = useRef<HTMLDivElement>(null);

  function carregar() {
    setCarregando(true);
    setFalha(false);
    setErro(null);
    api
      .get<Contrato[]>('/contratos')
      .then(setContratos)
      .catch((e) => {
        setFalha(true);
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar os contratos.');
      })
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    if (permitido) carregar();
  }, [permitido]);


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

  const visiveis = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    return contratos.filter((c) => {
      const buscaOk =
        !alvo ||
        c.numero.toLowerCase().includes(alvo) ||
        c.empresa.toLowerCase().includes(alvo) ||
        c.tipo.toLowerCase().includes(alvo);
      return buscaOk && (!filtro || c.status === filtro);
    });
  }, [contratos, busca, filtro]);

  useEffect(() => {
    setPagina(1);
  }, [busca, filtro]);

  if (!permitido) return <Navigate to="/" replace />;

  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const visualizacao = VISUALIZACOES.find(([valor]) => valor === filtro);

  return (
    <section className="gestao-page inventario-page cadastro-page" aria-labelledby="contratos-titulo">
      <div className="page-header inventario-cabecalho">
        <div>
          <h2 id="contratos-titulo">Contratos</h2>
        </div>
        <div className="inventario-lista-acoes">
          <Link to="/contratos/novo" className="btn btn-primary">
            Novo contrato
          </Link>
        </div>
      </div>


      <div className="gestao-lista inventario-lista">
        <div className="inventario-controles" ref={controles}>
          <div className="inventario-indexbar">
            <div className="inventario-consulta" role="search" aria-label="Pesquisar e filtrar contratos">
              <div className="inventario-visualizacao">
                <button
                  type="button"
                  className="inventario-visualizacao-botao"
                  aria-haspopup="menu"
                  aria-expanded={menuAberto}
                  onClick={() => setMenuAberto((aberto) => !aberto)}
                >
                  {visualizacao?.[1]}
                  <IconeChevron />
                </button>
                {menuAberto && (
                  <div className="inventario-visualizacao-menu" role="menu" aria-label="Visualizações dos contratos">
                    {VISUALIZACOES.map(([valor, rotulo]) => (
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
              <div className="inventario-consulta-busca">
                <IconeBusca />
                <input
                  aria-label="Buscar contratos"
                  placeholder="Buscar e filtrar"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="gestao-tabela-scroll" role="region" aria-label="Contratos" tabIndex={0} aria-busy={carregando}>
          <table>
            <caption className="gestao-sr-only">Contratos de manutenção e serviços</caption>
            <thead>
              <tr>
                <th scope="col">Contrato</th>
                <th scope="col">Fornecedor</th>
                <th scope="col">Vigência</th>
                <th scope="col">Valor</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <EsqueletoTabela colunas={5} />}
              {!carregando &&
                !falha &&
                visiveis.slice(inicio, inicio + POR_PAGINA).map((c) => (
                  <tr key={c.id}>
                    <td className="gestao-equipamento">
                      <Link
                        className="inventario-equipamento-link"
                        to={`/contratos/${c.id}`}
                        aria-label={`Editar contrato ${c.numero}`}
                      >
                        {c.numero}
                      </Link>
                      <div className="cadastro-sub">{c.tipo}</div>
                    </td>
                    <td className="inventario-unidade">
                      <strong>{c.empresa}</strong>
                    </td>
                    <td className="inventario-data">
                      {formatarData(c.vigenciaInicio)} – {formatarData(c.vigenciaFim)}
                    </td>
                    <td className="inventario-data">{c.valorTotal ? formatarMoeda(c.valorTotal) : '—'}</td>
                    <td>
                      <span className={`inventario-status inventario-status--tom-${TOM_STATUS_CONTRATO[c.status]}`}>
                        <span aria-hidden />
                        {ROTULO_STATUS_CONTRATO[c.status]}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!carregando && (falha || visiveis.length === 0) && (
          <div className="empty-state inventario-vazio">
            <span className="inventario-vazio-mensagem" role="status">
              {falha
                  ? 'Não foi possível carregar os contratos.'
                  : contratos.length === 0
                    ? 'Nenhum contrato cadastrado'
                    : 'Nenhum contrato encontrado'}
            </span>
            {!carregando &&
              (falha ? (
                <button className="btn btn-outline inventario-vazio-acao" onClick={carregar}>
                  Tentar novamente
                </button>
              ) : (
                contratos.length > 0 &&
                (busca || filtro) && (
                  <button
                    className="btn btn-primary inventario-vazio-acao"
                    onClick={() => {
                      setBusca('');
                      setFiltro('');
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
              'Contratos indisponíveis'
            ) : (
              <>
                <strong>
                  {visiveis.length} contrato{visiveis.length === 1 ? '' : 's'}
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
          <div className="gestao-paginacao" role="group" aria-label="Paginação dos contratos">
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
