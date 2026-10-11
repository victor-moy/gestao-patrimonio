import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { StatusPill } from '../components/StatusPill';
import type { Manutencao } from '../types';
import { codigoManutencao, formatarData, ROTULO_STATUS_MANUTENCAO } from '../utils/format';
import { tituloManutencao } from '../utils/manutencao';
import { EsqueletoTabela } from '../components/Esqueletos';
import { useAlertaNativo } from '../hooks/useAlertaNativo';
import { BarraConsulta } from '../components/BarraConsulta';

const POR_PAGINA = 10;
const VISUALIZACOES = [
  { valor: '', rotulo: 'Todas' },
  ...Object.entries(ROTULO_STATUS_MANUTENCAO).map(([valor, rotulo]) => ({ valor, rotulo })),
];

export function Manutencoes() {
  const { usuario } = useAuth();
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [falhaCarregamento, setFalhaCarregamento] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Falhas de carregamento: alerta nativo + o estado inline da lista (com \"Tentar novamente\")
  useAlertaNativo(erro, () => undefined);
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

  const totalPaginas = Math.max(1, Math.ceil(manutencoes.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;

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
        <BarraConsulta
          pesquisa="Pesquisar e filtrar manutenções"
          menu="Visualizações das manutenções"
          campoBusca="Buscar manutenções"
          visualizacoes={VISUALIZACOES}
          filtro={filtroStatus}
          onFiltro={setFiltroStatus}
          busca={busca}
          onBusca={setBusca}
        />

        <div className="gestao-tabela-scroll lista-cartoes lista-cartoes--manutencoes" role="region" aria-label="Manutenções" tabIndex={0} aria-busy={carregando}>
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
                    <td className="gestao-equipamento cartao-nome">
                      <span className="req-numero">{codigoManutencao(m.numero)}</span>
                      <Link
                        className="inventario-equipamento-link"
                        to={`/manutencoes/${m.id}`}
                        aria-label={`Ver manutenção de ${tituloManutencao(m)}`}
                      >
                        {tituloManutencao(m)}
                      </Link>
                      <div className="inventario-mobile-meta">
                        {m.unidade.nome} · {formatarData(m.criadoEm)}
                      </div>
                    </td>
                    <td className="inventario-unidade cartao-unidade">
                      <strong>{m.unidade.nome}</strong>
                    </td>
                    <td className="cartao-status">
                      <StatusPill valor={m.status}>{ROTULO_STATUS_MANUTENCAO[m.status]}</StatusPill>
                    </td>
                    <td className="inventario-data cartao-data">{formatarData(m.criadoEm)}</td>
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
