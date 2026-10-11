import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { corDoStatus } from '../components/Badge';
import { IconeBusca, IconeCheck, IconeChevron } from '../components/icons';
import type { Manutencao } from '../types';
import { codigoManutencao, formatarData, ROTULO_STATUS_MANUTENCAO } from '../utils/format';
import { nomeEquipamento } from '../utils/manutencao';
import { EsqueletoTabela } from '../components/Esqueletos';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

const POR_PAGINA = 10;
const VISUALIZACOES: Array<[string, string]> = [['', 'Todas'], ...Object.entries(ROTULO_STATUS_MANUTENCAO)];

export function Manutencoes() {
  const { usuario } = useAuth();
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [pagina, setPagina] = useState(1);
  const [visualizacoesAberto, setVisualizacoesAberto] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [falhaCarregamento, setFalhaCarregamento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Falhas de carregamento: alerta nativo + o estado inline da lista (com \"Tentar novamente\")
  useAlertaNativo(erro, () => undefined);
  const controles = useRef<HTMLDivElement>(null);
  const requisicao = useRef(0);

  const carregar = useCallback(() => {
    const idRequisicao = ++requisicao.current;
    setCarregando(true);
    setFalhaCarregamento(false);
    setErro(null);
    const params = new URLSearchParams();
    if (busca) params.set('busca', busca);
    if (filtroStatus) params.set('status', filtroStatus);
    api
      .get<Manutencao[]>(`/manutencoes?${params}`)
      .then((dados) => {
        if (idRequisicao !== requisicao.current) return;
        setManutencoes(dados);
        setPagina(1);
      })
      .catch((e) => {
        if (idRequisicao !== requisicao.current) return;
        setFalhaCarregamento(true);
        setManutencoes([]);
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar as manutenções.');
      })
      .finally(() => {
        if (idRequisicao === requisicao.current) setCarregando(false);
      });
  }, [busca, filtroStatus]);

  useEffect(() => {
    carregar();
    return () => {
      requisicao.current += 1;
    };
  }, [carregar]);

  // Confirmação vinda da página de nova manutenção

  useEffect(() => {
    function fecharMenu(evento: PointerEvent | KeyboardEvent) {
      if (evento instanceof KeyboardEvent) {
        if (evento.key !== 'Escape') return;
      } else if (controles.current?.contains(evento.target as Node)) {
        return;
      }
      setVisualizacoesAberto(false);
    }
    document.addEventListener('pointerdown', fecharMenu);
    document.addEventListener('keydown', fecharMenu);
    return () => {
      document.removeEventListener('pointerdown', fecharMenu);
      document.removeEventListener('keydown', fecharMenu);
    };
  }, []);

  const totalPaginas = Math.max(1, Math.ceil(manutencoes.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const visualizacaoAtual = VISUALIZACOES.find(([valor]) => valor === filtroStatus);

  return (
    <section className="gestao-page inventario-page manutencoes-page" aria-labelledby="manutencoes-titulo">
      <div className="page-header inventario-cabecalho">
        <div>
          <h2 id="manutencoes-titulo">Manutenções</h2>
        </div>
        {usuario?.perfil === 'UNIDADE' && (
          <div className="inventario-lista-acoes">
            <Link to="/manutencoes/nova" className="btn btn-primary">
              Nova solicitação
            </Link>
          </div>
        )}
      </div>


      <div className="gestao-lista inventario-lista">
        <div className="inventario-controles" ref={controles}>
          <div className="inventario-indexbar">
            <div className="inventario-consulta" role="search" aria-label="Pesquisar e filtrar manutenções">
              <div className="inventario-visualizacao">
                <button
                  type="button"
                  className="inventario-visualizacao-botao"
                  aria-haspopup="menu"
                  aria-expanded={visualizacoesAberto}
                  onClick={() => setVisualizacoesAberto((aberto) => !aberto)}
                >
                  {visualizacaoAtual?.[1] ?? 'Todas'}
                  <IconeChevron />
                </button>
                {visualizacoesAberto && (
                  <div className="inventario-visualizacao-menu" role="menu" aria-label="Visualizações das manutenções">
                    {VISUALIZACOES.map(([valor, rotulo]) => (
                      <button
                        key={valor}
                        type="button"
                        role="menuitemradio"
                        aria-checked={filtroStatus === valor}
                        onClick={() => {
                          setFiltroStatus(valor);
                          setVisualizacoesAberto(false);
                        }}
                      >
                        <span className="inventario-visualizacao-check" aria-hidden>
                          {filtroStatus === valor && <IconeCheck />}
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
                  aria-label="Buscar manutenções"
                  placeholder="Buscar e filtrar"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="gestao-tabela-scroll" role="region" aria-label="Manutenções" tabIndex={0} aria-busy={carregando}>
          <table>
            <caption className="gestao-sr-only">Manutenções da seleção atual</caption>
            <thead>
              <tr>
                <th scope="col">Manutenção</th>
                <th scope="col">Unidade</th>
                <th scope="col">Status</th>
                <th scope="col">Solicitado em</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <EsqueletoTabela colunas={4} />}
              {!carregando &&
                !falhaCarregamento &&
                manutencoes.slice(inicio, inicio + POR_PAGINA).map((m) => (
                  <tr key={m.id}>
                    <td className="gestao-equipamento">
                      <span className="req-numero">{codigoManutencao(m.numero)}</span>
                      <Link
                        className="inventario-equipamento-link"
                        to={`/manutencoes/${m.id}`}
                        aria-label={`Ver manutenção de ${nomeEquipamento(m)}`}
                      >
                        {nomeEquipamento(m)}
                      </Link>
                      <div className="inventario-mobile-meta">
                        {m.unidade.nome} · {formatarData(m.criadoEm)}
                      </div>
                    </td>
                    <td className="inventario-unidade">
                      <strong>{m.unidade.nome}</strong>
                    </td>
                    <td>
                      <span className={`inventario-status inventario-status--tom-${corDoStatus(m.status)}`}>
                        <span aria-hidden />
                        {ROTULO_STATUS_MANUTENCAO[m.status]}
                      </span>
                    </td>
                    <td className="inventario-data">{formatarData(m.criadoEm)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!carregando && (falhaCarregamento || manutencoes.length === 0) && (
          <div className="empty-state inventario-vazio">
            <span className="inventario-vazio-mensagem" role="status">
              {falhaCarregamento
                  ? 'Não foi possível carregar as manutenções.'
                  : 'Nenhuma manutenção encontrada'}
            </span>
            {!carregando &&
              (falhaCarregamento ? (
                <button className="btn btn-outline inventario-vazio-acao" onClick={carregar}>
                  Tentar novamente
                </button>
              ) : (
                (busca || filtroStatus) && (
                  <button
                    className="btn btn-primary inventario-vazio-acao"
                    onClick={() => {
                      setBusca('');
                      setFiltroStatus('');
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
            ) : falhaCarregamento ? (
              'Manutenções indisponíveis'
            ) : (
              <>
                <strong>
                  {manutencoes.length} manutenç{manutencoes.length === 1 ? 'ão' : 'ões'}
                </strong>
                {manutencoes.length > 0 && (
                  <span>
                    {' '}
                    · Mostrando {inicio + 1}–{Math.min(inicio + POR_PAGINA, manutencoes.length)}
                  </span>
                )}
              </>
            )}
          </span>
          <div className="gestao-paginacao" role="group" aria-label="Paginação das manutenções">
            <button
              type="button"
              className="btn btn-outline"
              disabled={carregando || falhaCarregamento || paginaAtual === 1}
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
              disabled={carregando || falhaCarregamento || paginaAtual === totalPaginas}
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
