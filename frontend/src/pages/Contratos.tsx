import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Contrato } from '../types';
import { analisarContrato, ROTULO_STATUS_CONTRATO } from '../utils/cadastros';
import { formatarData, formatarMoeda } from '../utils/format';
import './Cadastros.css';
import { EsqueletoTabela } from '../components/Esqueletos';
import { useAlertaNativo } from '../hooks/useAlertaNativo';
import { StatusPill } from '../components/StatusPill';
import { BarraConsulta } from '../components/BarraConsulta';

const POR_PAGINA = 10;
const VISUALIZACOES = [
  { valor: '', rotulo: 'Todos' },
  ...Object.entries(ROTULO_STATUS_CONTRATO).map(([valor, rotulo]) => ({ valor, rotulo })),
];

export function Contratos() {
  const { usuario } = useAuth();
  const permitido =
    usuario?.perfil === 'OPERADOR' || usuario?.perfil === 'TERCEIRIZADA';
  // A terceirizada consulta os contratos do próprio prestador, sem cadastrar nem editar
  const somenteLeitura = usuario?.perfil === 'TERCEIRIZADA';
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [falha, setFalha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Falhas de carregamento: alerta nativo + o estado inline da lista (com \"Tentar novamente\")
  useAlertaNativo(erro, () => undefined);

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



  const visiveis = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    return contratos.filter((c) => {
      const buscaOk =
        !alvo ||
        c.numero.toLowerCase().includes(alvo) ||
        c.prestador.nome.toLowerCase().includes(alvo) ||
        c.itens.some((i) => i.servico.nome.toLowerCase().includes(alvo));
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

  return (
    <section className="gestao-page inventario-page cadastro-page" aria-labelledby="contratos-titulo">
      <div className="page-header inventario-cabecalho">
        <div>
          <h2 id="contratos-titulo">Contratos</h2>
        </div>
        {!somenteLeitura && (
          <div className="inventario-lista-acoes">
            <Link to="/contratos/novo" className="btn btn-primary">
              Novo contrato
            </Link>
          </div>
        )}
      </div>


      <div className="gestao-lista inventario-lista">
        <BarraConsulta
          pesquisa="Pesquisar e filtrar contratos"
          menu="Visualizações dos contratos"
          campoBusca="Buscar contratos"
          visualizacoes={VISUALIZACOES}
          filtro={filtro}
          onFiltro={setFiltro}
          busca={busca}
          onBusca={setBusca}
        />

        <div className="gestao-tabela-scroll lista-cartoes lista-cartoes--atas" role="region" aria-label="Contratos" tabIndex={0} aria-busy={carregando}>
          <table>
            <caption className="gestao-sr-only">Contratos de manutenção e serviços</caption>
            <thead>
              <tr>
                <th scope="col">Contrato</th>
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
                visiveis.slice(inicio, inicio + POR_PAGINA).map((c) => {
                  const a = analisarContrato(c);
                  return (
                    <tr key={c.id}>
                      <td className="gestao-equipamento cartao-nome">
                        <Link
                          className="inventario-equipamento-link"
                          to={`/contratos/${c.id}`}
                          aria-label={`${somenteLeitura ? 'Ver' : 'Editar'} contrato ${c.numero}`}
                        >
                          {c.numero}
                        </Link>
                        <div className="cadastro-sub">{c.prestador.nome}</div>
                      </td>
                      <td className="inventario-data cartao-valor" data-label="Valor total">
                        {a.valorTotal === null ? '—' : formatarMoeda(a.valorTotal)}
                      </td>
                      <td className="inventario-data cartao-saldo" data-label="Saldo">
                        {a.saldo === null ? '—' : formatarMoeda(a.saldo)}
                      </td>
                      <td className="cartao-uso" data-label="Utilizado">
                        {a.utilizado === null ? (
                          '—'
                        ) : (
                          <>
                            <div className="cadastro-progresso" aria-label={`${a.utilizado.toFixed(0)}% do saldo utilizado`}>
                              <div className="cadastro-progresso-fill" style={{ width: `${Math.min(100, a.utilizado)}%` }} />
                            </div>
                            <span className="cadastro-sub">{a.utilizado.toFixed(0)}%</span>
                          </>
                        )}
                      </td>
                      <td className="inventario-data cartao-vencimento" data-label="Vencimento">{formatarData(c.vigenciaFim)}</td>
                      <td className="cartao-status">
                        <div className="cadastro-selos">
                          <StatusPill valor={c.status}>{ROTULO_STATUS_CONTRATO[c.status]}</StatusPill>
                          {a.saldoBaixo && <StatusPill valor="SALDO_BAIXO">Saldo baixo</StatusPill>}
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
