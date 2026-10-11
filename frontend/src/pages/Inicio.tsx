import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ContagemNaoLidas } from '../components/ContagemNaoLidas';
import { useConversas } from '../hooks/useConversas';
import type { Alerta } from '../types';
import { caminhoConversa, codigoConversa, tituloConversa } from '../utils/conversas';
import './Inicio.css';

function rotuloDoAlerta(tipo: string) {
  if (tipo.startsWith('ATA_')) return 'Ata';
  if (tipo === 'EMPRESTIMO_ATRASADO') return 'Empréstimo';
  return 'Patrimônio';
}

export function Inicio() {
  const { usuario } = useAuth();
  const ehGestor = usuario?.perfil === 'GESTOR_PATRIMONIO' || usuario?.perfil === 'GESTOR_MANUTENCAO';
  const primeiroNome = usuario?.nome.trim().split(/\s+/)[0] ?? '';
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [carregandoAlertas, setCarregandoAlertas] = useState(false);
  const [falhaAlertas, setFalhaAlertas] = useState(false);
  const { conversas, erro: erroConversas, recarregar: recarregarConversas } = useConversas();
  const conversasNaoLidas = (conversas ?? []).filter((c) => c.naoLidas > 0);
  const totalNaoLidas = conversasNaoLidas.reduce((soma, c) => soma + c.naoLidas, 0);

  const carregarAlertas = useCallback(async () => {
    if (!ehGestor) return;

    setCarregandoAlertas(true);
    setFalhaAlertas(false);
    try {
      setAlertas(await api.get<Alerta[]>('/dashboard/alertas'));
    } catch {
      setFalhaAlertas(true);
    } finally {
      setCarregandoAlertas(false);
    }
  }, [ehGestor]);

  useEffect(() => {
    void carregarAlertas();
  }, [carregarAlertas]);

  return (
    <section className="gestao-page inicio-page" aria-labelledby="inicio-titulo">
      <header className="page-header inicio-boas-vindas">
        <h2 id="inicio-titulo">Bem-vindo, {primeiroNome}</h2>
      </header>

      <div className="inicio-caixa-entrada">
        <section className="card inicio-painel inicio-painel--alertas" aria-labelledby="inicio-alertas-titulo">
          <header className="inicio-painel-cabecalho">
            <div className="inicio-painel-titulo">
              <div>
                <h3 id="inicio-alertas-titulo">Alertas importantes</h3>
                <p>Ocorrências que precisam da sua atenção.</p>
              </div>
            </div>
            {!carregandoAlertas && !falhaAlertas && alertas.length > 0 && (
              <span className="inicio-contagem" aria-label={`${alertas.length} alertas importantes`}>
                {alertas.length}
              </span>
            )}
          </header>

          <div className="inicio-painel-conteudo" aria-live="polite">
            {carregandoAlertas && <p className="inicio-estado-texto">Carregando alertas…</p>}

            {!carregandoAlertas && falhaAlertas && (
              <div className="inicio-estado-vazio">
                <strong>Não foi possível carregar os alertas.</strong>
                <span>Tente novamente para conferir as pendências atuais.</span>
                <button type="button" className="btn btn-outline" onClick={carregarAlertas}>
                  Tentar novamente
                </button>
              </div>
            )}

            {!carregandoAlertas && !falhaAlertas && alertas.length === 0 && (
              <div className="inicio-estado-vazio">
                <strong>Nenhum alerta importante</strong>
                <span>Não há ocorrências que precisem da sua atenção agora.</span>
              </div>
            )}

            {!carregandoAlertas && !falhaAlertas && alertas.length > 0 && (
              <div className="inicio-alertas-lista">
                {alertas.map((alerta, indice) => (
                  <article
                    key={`${alerta.tipo}-${indice}`}
                    className={`inicio-alerta inicio-alerta--${alerta.severidade.toLowerCase()}`}
                  >
                    <div className="inicio-alerta-meta">
                      <span className="inicio-alerta-severidade">
                        {alerta.severidade === 'CRITICO' ? 'Crítico' : 'Atenção'}
                      </span>
                      <span>{rotuloDoAlerta(alerta.tipo)}</span>
                    </div>
                    <p>{alerta.mensagem}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card inicio-painel inicio-painel--mensagens" aria-labelledby="inicio-mensagens-titulo">
          <header className="inicio-painel-cabecalho">
            <div className="inicio-painel-titulo">
              <div>
                <h3 id="inicio-mensagens-titulo">Mensagens não lidas</h3>
                <p>Atualizações enviadas diretamente para você.</p>
              </div>
            </div>
            <span className="inicio-contagem" aria-label={`${totalNaoLidas} mensagens não lidas`}>
              {totalNaoLidas}
            </span>
          </header>

          <div className="inicio-painel-conteudo">
            {erroConversas && !conversas ? (
              <div className="inicio-estado-vazio inicio-estado-vazio--mensagens" role="alert">
                <strong>Não foi possível carregar as mensagens</strong>
                <button type="button" className="btn btn-outline" onClick={recarregarConversas}>
                  Tentar novamente
                </button>
              </div>
            ) : !conversas ? (
              <p className="inicio-estado-texto" role="status">Carregando mensagens…</p>
            ) : conversasNaoLidas.length === 0 ? (
              <div className="inicio-estado-vazio inicio-estado-vazio--mensagens">
                <strong>Nenhuma mensagem não lida</strong>
                <span>Novas mensagens aparecerão aqui.</span>
              </div>
            ) : (
              <ul className="inicio-nao-lidas">
                {conversasNaoLidas.slice(0, 5).map((c) => (
                  <li key={`${c.contexto}-${c.id}`}>
                    <Link to={caminhoConversa(c.contexto, c.id)}>
                      <strong>
                        <span className="req-numero">{codigoConversa(c)}</span>
                        {tituloConversa(c)}
                      </strong>
                      <span className="inicio-nao-lidas-texto">
                        {c.ultimoAutor}: {c.ultimoTexto}
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
    </section>
  );
}
