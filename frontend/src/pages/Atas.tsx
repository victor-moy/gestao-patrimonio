import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { IconeBusca, IconeCheck, IconeChevron } from '../components/icons';
import type { Ata } from '../types';
import { analisarAta, ROTULO_SITUACAO_ATA, TOM_SITUACAO_ATA, type SituacaoAta } from '../utils/cadastros';
import { formatarData, formatarMoeda } from '../utils/format';
import './Cadastros.css';
import { EsqueletoTabela } from '../components/Esqueletos';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

const POR_PAGINA = 10;
const VISUALIZACOES: Array<{ valor: '' | SituacaoAta; rotulo: string }> = [
  { valor: '', rotulo: 'Todas' },
  { valor: 'ATIVA', rotulo: 'Ativas' },
  { valor: 'VENCENDO', rotulo: 'Vencendo' },
  { valor: 'VENCIDA', rotulo: 'Vencidas' },
  { valor: 'INATIVA', rotulo: 'Inativas' },
];

export function Atas() {
  const { usuario } = useAuth();
  const permitido = usuario?.perfil === 'GESTOR_PATRIMONIO';
  const [atas, setAtas] = useState<Ata[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'' | SituacaoAta>('');
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
      .get<Ata[]>('/atas')
      .then(setAtas)
      .catch((e) => {
        setFalha(true);
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar as atas.');
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
    return atas.filter((a) => {
      const buscaOk = !alvo || [a.numero, a.fornecedor].some((v) => v?.toLowerCase().includes(alvo));
      return buscaOk && (!filtro || analisarAta(a).situacao === filtro);
    });
  }, [atas, busca, filtro]);

  useEffect(() => {
    setPagina(1);
  }, [busca, filtro]);

  if (!permitido) return <Navigate to="/" replace />;

  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * POR_PAGINA;
  const visualizacao = VISUALIZACOES.find((v) => v.valor === filtro);

  return (
    <section className="gestao-page inventario-page cadastro-page" aria-labelledby="atas-titulo">
      <div className="page-header inventario-cabecalho">
        <div>
          <h2 id="atas-titulo">Atas</h2>
        </div>
        <div className="inventario-lista-acoes">
          <Link to="/atas/nova" className="btn btn-primary">
            Nova ata
          </Link>
        </div>
      </div>


      <div className="gestao-lista inventario-lista">
        <div className="inventario-controles" ref={controles}>
          <div className="inventario-indexbar">
            <div className="inventario-consulta" role="search" aria-label="Pesquisar e filtrar atas">
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
                  <div className="inventario-visualizacao-menu" role="menu" aria-label="Visualizações das atas">
                    {VISUALIZACOES.map(({ valor, rotulo }) => (
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
                  aria-label="Buscar atas"
                  placeholder="Buscar e filtrar"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="gestao-tabela-scroll" role="region" aria-label="Atas" tabIndex={0} aria-busy={carregando}>
          <table>
            <caption className="gestao-sr-only">Atas de registro de preços</caption>
            <thead>
              <tr>
                <th scope="col">Ata</th>
                <th scope="col">Valor total</th>
                <th scope="col">Saldo</th>
                <th scope="col">Utilizado</th>
                <th scope="col">Vencimento</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {carregando && <EsqueletoTabela colunas={6} />}
              {!carregando &&
                !falha &&
                visiveis.slice(inicio, inicio + POR_PAGINA).map((ata) => {
                  const a = analisarAta(ata);
                  return (
                    <tr key={ata.id}>
                      <td className="gestao-equipamento">
                        <Link
                          className="inventario-equipamento-link"
                          to={`/atas/${ata.id}`}
                          aria-label={`Editar ata ${ata.numero}`}
                        >
                          {ata.numero}
                        </Link>
                        <div className="cadastro-sub">
                          {ata.fornecedor || ata.descricao}
                          {ata.unidadeEspecifica ? ` · exclusiva ${ata.unidadeEspecifica.nome}` : ''}
                        </div>
                      </td>
                      <td className="inventario-data">{formatarMoeda(a.valorTotal)}</td>
                      <td className="inventario-data">{formatarMoeda(a.saldo)}</td>
                      <td>
                        <div className="cadastro-progresso" aria-label={`${a.utilizado.toFixed(0)}% do saldo utilizado`}>
                          <div className="cadastro-progresso-fill" style={{ width: `${Math.min(100, a.utilizado)}%` }} />
                        </div>
                        <span className="cadastro-sub">{a.utilizado.toFixed(0)}%</span>
                      </td>
                      <td className="inventario-data">{formatarData(ata.vencimento)}</td>
                      <td>
                        <div className="cadastro-selos">
                          <span className={`inventario-status inventario-status--tom-${TOM_SITUACAO_ATA[a.situacao]}`}>
                            <span aria-hidden />
                            {ROTULO_SITUACAO_ATA[a.situacao]}
                          </span>
                          {a.saldoBaixo && (
                            <span className="inventario-status inventario-status--tom-red">
                              <span aria-hidden />
                              Saldo baixo
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!carregando && (falha || visiveis.length === 0) && (
          <div className="empty-state inventario-vazio">
            <span className="inventario-vazio-mensagem" role="status">
              {falha
                  ? 'Não foi possível carregar as atas.'
                  : atas.length === 0
                    ? 'Nenhuma ata cadastrada'
                    : 'Nenhuma ata encontrada'}
            </span>
            {!carregando &&
              (falha ? (
                <button className="btn btn-outline inventario-vazio-acao" onClick={carregar}>
                  Tentar novamente
                </button>
              ) : (
                atas.length > 0 &&
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
              'Atas indisponíveis'
            ) : (
              <>
                <strong>
                  {visiveis.length} ata{visiveis.length === 1 ? '' : 's'}
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
          <div className="gestao-paginacao" role="group" aria-label="Paginação das atas">
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
