import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ContagemNaoLidas } from '../components/ContagemNaoLidas';
import { IconeChevron } from '../components/icons';
import { useConversas } from '../hooks/useConversas';
import type { Alerta, AvisoUsuario, ListaAvisos } from '../types';
import { caminhoConversa, codigoConversa, tituloConversa } from '../utils/conversas';
import './Inicio.css';

function formatarQuando(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function EsqueletoLinhas({ n = 3 }: { n?: number }) {
  return (
    <div className="inicio-esqueleto" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="inicio-esqueleto-linha">
          <span className="esqueleto esqueleto--pill" />
          <span className="esqueleto" style={{ width: `${72 - i * 8}%` }} />
        </div>
      ))}
    </div>
  );
}

export function Inicio() {
  const { usuario } = useAuth();
  const primeiroNome = usuario?.nome.trim().split(/\s+/)[0] ?? '';
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [carregandoAlertas, setCarregandoAlertas] = useState(false);
  const [falhaAlertas, setFalhaAlertas] = useState(false);
  const [avisos, setAvisos] = useState<ListaAvisos | null>(null);
  const [falhaAvisos, setFalhaAvisos] = useState(false);
  const { conversas, erro: erroConversas, recarregar: recarregarConversas } = useConversas();
  const conversasNaoLidas = (conversas ?? []).filter((c) => c.naoLidas > 0);
  const totalNaoLidas = conversasNaoLidas.reduce((soma, c) => soma + c.naoLidas, 0);

  const criticos = useMemo(() => alertas.filter((a) => a.severidade === 'CRITICO'), [alertas]);
  const avisosPendencia = useMemo(() => alertas.filter((a) => a.severidade !== 'CRITICO'), [alertas]);
  const totalItensPendencia = useMemo(
    () => alertas.reduce((soma, a) => soma + (a.contagem || 1), 0),
    [alertas],
  );
  const pendenciasOrdenadas = useMemo(() => [...criticos, ...avisosPendencia], [criticos, avisosPendencia]);
  const itensAvisos = avisos?.itens ?? null;
  const totalAvisos = avisos?.total ?? 0;

  const carregarAlertas = useCallback(async () => {
    setCarregandoAlertas(true);
    setFalhaAlertas(false);
    try {
      setAlertas(await api.get<Alerta[]>('/dashboard/alertas'));
    } catch {
      setFalhaAlertas(true);
    } finally {
      setCarregandoAlertas(false);
    }
  }, []);

  const carregarAvisos = useCallback(async () => {
    setFalhaAvisos(false);
    try {
      setAvisos(await api.get<ListaAvisos>('/avisos?apenasNaoLidas=1&limite=5'));
    } catch {
      setAvisos(null);
      setFalhaAvisos(true);
    }
  }, []);

  const marcarAvisoLido = async (aviso: AvisoUsuario) => {
    try {
      await api.post(`/avisos/${aviso.id}/ler`);
      setAvisos((lista) =>
        lista
          ? {
              itens: lista.itens.filter((a) => a.id !== aviso.id),
              total: Math.max(0, lista.total - 1),
            }
          : lista,
      );
    } catch {
      // a navegação para o detalhe ainda pode seguir
    }
  };

  useEffect(() => {
    void carregarAlertas();
    void carregarAvisos();
  }, [carregarAlertas, carregarAvisos]);

  return (
    <section className="gestao-page inicio-page" aria-labelledby="inicio-titulo">
      <header className="page-header inicio-cabecalho">
        <div>
          <h2 id="inicio-titulo">Bem-vindo, {primeiroNome}</h2>
        </div>
      </header>

      <div className="inicio-caixa-entrada">
        <section className="inicio-lista inicio-lista--pendencias" aria-labelledby="inicio-alertas-titulo">
          <header className="inicio-lista-cabecalho">
            <div className="inicio-lista-titulo">
              <h3 id="inicio-alertas-titulo">Pendências</h3>
              {!carregandoAlertas && !falhaAlertas && totalItensPendencia > 0 && (
                <span
                  className="inicio-contagem"
                  aria-label={
                    pendenciasOrdenadas.length === totalItensPendencia
                      ? `${totalItensPendencia} pendências`
                      : `${totalItensPendencia} pendências em ${pendenciasOrdenadas.length} grupos`
                  }
                >
                  {totalItensPendencia}
                </span>
              )}
            </div>
            <p>O que precisa da sua ação agora.</p>
          </header>

          <div className="inicio-lista-corpo" aria-live="polite">
            {carregandoAlertas && (
              <div role="status">
                <span className="gestao-sr-only">Carregando pendências…</span>
                <EsqueletoLinhas n={4} />
              </div>
            )}

            {!carregandoAlertas && falhaAlertas && (
              <div className="inicio-estado-vazio" role="alert">
                <strong>Não foi possível carregar as pendências.</strong>
                <span>Tente novamente para conferir o que precisa da sua atenção.</span>
                <button type="button" className="btn btn-outline" onClick={carregarAlertas}>
                  Tentar novamente
                </button>
              </div>
            )}

            {!carregandoAlertas && !falhaAlertas && alertas.length === 0 && (
              <div className="inicio-estado-vazio inicio-estado-vazio--ok">
                <strong>Nada pendente com você agora</strong>
                <span>Quando houver algo para agir, aparece aqui.</span>
              </div>
            )}

            {!carregandoAlertas && !falhaAlertas && pendenciasOrdenadas.length > 0 && (
              <ul className="inicio-pendencias">
                {pendenciasOrdenadas.map((alerta) => {
                  const critico = alerta.severidade === 'CRITICO';
                  return (
                    <li key={`${alerta.tipo}-${alerta.href}-${alerta.mensagem}`}>
                      <Link
                        to={alerta.href}
                        className={`inicio-pendencia${critico ? ' inicio-pendencia--critico' : ''}`}
                      >
                        <span
                          className={`inicio-pendencia-ponto${critico ? ' inicio-pendencia-ponto--critico' : ''}`}
                          aria-hidden
                        />
                        <span className="gestao-sr-only">{critico ? 'Crítico. ' : 'Atenção. '}</span>
                        <span className="inicio-pendencia-corpo">
                          <span className="inicio-pendencia-msg">{alerta.mensagem}</span>
                        </span>
                        <span className="inicio-pendencia-direita">
                          {alerta.contagem > 1 && (
                            <span className="inicio-pendencia-qtd" aria-label={`${alerta.contagem} itens`}>
                              {alerta.contagem}
                            </span>
                          )}
                          <span className="inicio-pendencia-seta" aria-hidden>
                            <IconeChevron />
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <div className="inicio-coluna-secundaria">
          <section className="inicio-lista inicio-lista--atualizacoes" aria-labelledby="inicio-avisos-titulo">
            <header className="inicio-lista-cabecalho">
              <div className="inicio-lista-titulo">
                <h3 id="inicio-avisos-titulo">Atualizações</h3>
                {totalAvisos > 0 && (
                  <span className="inicio-contagem" aria-label={`${totalAvisos} atualizações não lidas`}>
                    {totalAvisos}
                  </span>
                )}
              </div>
              <p>Mudanças recentes nos seus pedidos.</p>
            </header>

            <div className="inicio-lista-corpo" aria-live="polite">
              {falhaAvisos && (
                <div className="inicio-estado-vazio" role="alert">
                  <strong>Não foi possível carregar as atualizações.</strong>
                  <button type="button" className="btn btn-outline" onClick={carregarAvisos}>
                    Tentar novamente
                  </button>
                </div>
              )}

              {!falhaAvisos && !itensAvisos && (
                <div role="status">
                  <span className="gestao-sr-only">Carregando atualizações…</span>
                  <EsqueletoLinhas n={3} />
                </div>
              )}

              {!falhaAvisos && itensAvisos && itensAvisos.length === 0 && (
                <div className="inicio-estado-vazio inicio-estado-vazio--ok">
                  <strong>Nenhuma atualização nova</strong>
                  <span>Aprovações, negações e retornos aparecem aqui.</span>
                </div>
              )}

              {!falhaAvisos && itensAvisos && itensAvisos.length > 0 && (
                <ul className="inicio-atualizacoes">
                  {itensAvisos.map((aviso) => {
                    const conteudo = (
                      <>
                        <span className="inicio-atualizacao-corpo">
                          <strong>{aviso.titulo}</strong>
                          <span className="inicio-atualizacao-texto">{aviso.mensagem}</span>
                          <time className="inicio-atualizacao-quando" dateTime={aviso.criadoEm}>
                            {formatarQuando(aviso.criadoEm)}
                          </time>
                        </span>
                        <span className="inicio-atualizacao-seta" aria-hidden>
                          <IconeChevron />
                        </span>
                      </>
                    );
                    return (
                      <li key={aviso.id}>
                        {aviso.href ? (
                          <Link
                            to={aviso.href}
                            className="inicio-atualizacao"
                            onClick={() => {
                              void marcarAvisoLido(aviso);
                            }}
                          >
                            {conteudo}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            className="inicio-atualizacao inicio-atualizacao--botao"
                            onClick={() => {
                              void marcarAvisoLido(aviso);
                            }}
                          >
                            {conteudo}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="inicio-lista inicio-lista--mensagens" aria-labelledby="inicio-mensagens-titulo">
            <header className="inicio-lista-cabecalho">
              <div className="inicio-lista-titulo">
                <h3 id="inicio-mensagens-titulo">Mensagens não lidas</h3>
                {totalNaoLidas > 0 && (
                  <span className="inicio-contagem" aria-label={`${totalNaoLidas} mensagens não lidas`}>
                    {totalNaoLidas}
                  </span>
                )}
              </div>
              <p>Conversas que pedem a sua leitura.</p>
            </header>

            <div className="inicio-lista-corpo">
              {erroConversas && !conversas ? (
                <div className="inicio-estado-vazio" role="alert">
                  <strong>Não foi possível carregar as mensagens</strong>
                  <button type="button" className="btn btn-outline" onClick={recarregarConversas}>
                    Tentar novamente
                  </button>
                </div>
              ) : !conversas ? (
                <div role="status">
                  <span className="gestao-sr-only">Carregando mensagens…</span>
                  <EsqueletoLinhas n={3} />
                </div>
              ) : conversasNaoLidas.length === 0 ? (
                <div className="inicio-estado-vazio inicio-estado-vazio--ok">
                  <strong>Nenhuma mensagem não lida</strong>
                  <span>Novas mensagens aparecerão aqui.</span>
                </div>
              ) : (
                <ul className="inicio-mensagens">
                  {conversasNaoLidas.slice(0, 5).map((c) => (
                    <li key={`${c.contexto}-${c.id}`}>
                      <Link to={caminhoConversa(c.contexto, c.id)} className="inicio-mensagem">
                        <span className="inicio-mensagem-corpo">
                          <strong>
                            <span className="req-numero">{codigoConversa(c)}</span>
                            <span className="inicio-mensagem-titulo">{tituloConversa(c)}</span>
                          </strong>
                          <span className="inicio-mensagem-trecho">
                            {c.ultimoAutor}: {c.ultimoTexto}
                          </span>
                        </span>
                        <ContagemNaoLidas total={c.naoLidas} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
