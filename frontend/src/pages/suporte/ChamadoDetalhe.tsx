import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ChatConversa } from '../../components/ChatConversa';
import { ImagemProtegida, LinkArquivoProtegido } from '../../components/ArquivoProtegido';
import { StatusPill } from '../../components/StatusPill';
import { useAlertaNativo } from '../../hooks/useAlertaNativo';
import { useCarga } from '../../hooks/useCarga';
import { pode } from '../../utils/permissoes';
import type { RelatoProblema, StatusRelato } from '../../types';
import { formatarDataHora, ROTULO_PERFIL } from '../../utils/format';
import { codigoSuporte, ROTULO_CATEGORIA_RELATO, ROTULO_STATUS_RELATO } from '../../utils/relato';
import '../conversas/Conversas.css';

// O que o atendimento pode fazer em cada status (reabrir é só dele)
const ACOES: Record<StatusRelato, Array<{ para: StatusRelato; rotulo: string; principal?: boolean }>> = {
  ABERTO: [
    { para: 'AGUARDANDO_RETORNO', rotulo: 'Pedir retorno' },
    { para: 'RESOLVIDO', rotulo: 'Resolver', principal: true },
  ],
  EM_ANALISE: [
    { para: 'AGUARDANDO_RETORNO', rotulo: 'Pedir retorno' },
    { para: 'RESOLVIDO', rotulo: 'Resolver', principal: true },
  ],
  AGUARDANDO_RETORNO: [
    { para: 'EM_ANALISE', rotulo: 'Voltar à análise' },
    { para: 'RESOLVIDO', rotulo: 'Resolver', principal: true },
  ],
  RESOLVIDO: [{ para: 'EM_ANALISE', rotulo: 'Reabrir', principal: true }],
};

// Chamado de suporte: dados, anexos e conversa. Quem abriu e o atendimento veem; só o atendimento muda o status.
export function ChamadoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const atendente = usuario?.perfil === 'OPERADOR' && pode(usuario, 'SUPORTE_ATENDER');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useAlertaNativo(erro, () => setErro(null));

  const { dados: carregado, carregando, falha } = useCarga(
    () => api.get<RelatoProblema>(`/relatos/${id}`),
    Boolean(id),
    'Não foi possível carregar o chamado. Recarregue a página para tentar novamente.',
  );
  const [relato, setRelato] = useState<RelatoProblema | null>(null);
  useEffect(() => {
    if (carregado) setRelato(carregado);
  }, [carregado]);

  const mudarStatus = useCallback(
    async (status: StatusRelato) => {
      if (ocupado) return;
      setOcupado(true);
      setErro(null);
      try {
        setRelato(await api.patch<RelatoProblema>(`/relatos/${id}/status`, { status }));
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível mudar o status.');
      } finally {
        setOcupado(false);
      }
    },
    [id, ocupado],
  );

  const voltar = '/suporte';

  const campos = relato
    ? [
        { rotulo: 'Categoria', valor: ROTULO_CATEGORIA_RELATO[relato.categoria] },
        {
          rotulo: 'Quem abriu',
          valor: (
            <>
              {relato.usuario.nome}
              <span className="dado-apoio">
                {ROTULO_PERFIL[relato.perfil]}
                {atendente ? ` · ${relato.usuario.email}` : ''}
              </span>
            </>
          ),
        },
        { rotulo: 'Aberto em', valor: formatarDataHora(relato.criadoEm) },
        ...(relato.resolvidoEm ? [{ rotulo: 'Resolvido em', valor: formatarDataHora(relato.resolvidoEm) }] : []),
        { rotulo: 'Tela de origem', valor: relato.tela },
        ...(atendente ? [{ rotulo: 'Navegador', valor: relato.navegador || 'Não informado', classe: 'relato-navegador' }] : []),
      ]
    : [];

  return (
    <section className="gestao-page equipamento-pagina suporte-pagina" aria-labelledby="chamado-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div className="equipamento-titulo-linha">
          <h2 id="chamado-titulo">{relato ? `${codigoSuporte(relato.numero)} · ${relato.titulo ?? relato.tela}` : 'Chamado de suporte'}</h2>
          {relato && <StatusPill valor={relato.status}>{ROTULO_STATUS_RELATO[relato.status]}</StatusPill>}
        </div>
        <div className="novo-equipamento-acoes">
          <button type="button" className="btn btn-outline" onClick={() => void navigate(voltar)}>
            Voltar
          </button>
          {atendente &&
            relato &&
            ACOES[relato.status].map((a) => (
              <button key={a.para} type="button" className={`btn ${a.principal ? 'btn-primary' : 'btn-outline'}`} disabled={ocupado} onClick={() => void mudarStatus(a.para)}>
                {a.rotulo}
              </button>
            ))}
        </div>
      </div>

      {carregando && <p className="novo-equipamento-estado" role="status">Carregando…</p>}
      {falha && <div className="error-banner" role="alert">{falha}</div>}

      {relato && (
        <>
          <section className="equipamento-secao">
            <h3>Chamado</h3>
            <dl className="equipamento-dados">
              {campos.map((c, i) => (
                // Se sobra um campo sozinho na última linha, ele ocupa a linha toda (o traço de cima vai de ponta a ponta)
                <div key={c.rotulo} className={campos.length % 2 === 1 && i === campos.length - 1 ? 'relato-largura-total' : undefined}>
                  <dt>{c.rotulo}</dt>
                  <dd className={c.classe}>{c.valor}</dd>
                </div>
              ))}
              {relato.categoria === 'BUG' && (
                <div className="relato-largura-total">
                  <dt>O que esperava</dt>
                  <dd className="relato-texto">{relato.esperado || 'Não informado'}</dd>
                </div>
              )}
              <div className="relato-largura-total">
                <dt>{relato.categoria === 'BUG' ? 'O que aconteceu' : 'Descrição'}</dt>
                <dd className="relato-texto">{relato.aconteceu}</dd>
              </div>
            </dl>
          </section>

          <section className="equipamento-secao solicitacao-secao-texto">
            <h3>Anexos</h3>
            {relato.anexos.length > 0 ? (
              <div className="civil-fotos">
                {relato.anexos.map((caminho, i) =>
                  caminho.endsWith('.pdf') ? (
                    <div key={caminho} className="relato-anexo-pdf">
                      <span className="anexos-bug-miniatura anexos-bug-pdf" aria-hidden>
                        PDF
                      </span>
                      <LinkArquivoProtegido caminho={caminho}>Abrir documento</LinkArquivoProtegido>
                    </div>
                  ) : (
                    <ImagemProtegida key={caminho} caminho={caminho} alt={`Anexo ${i + 1} do chamado`} className="solicitacao-anexo-imagem" />
                  ),
                )}
              </div>
            ) : (
              <div className="equipamento-historico-vazio">Sem arquivos anexados</div>
            )}
          </section>

          <section className="equipamento-secao">
            <h3>Conversa</h3>
            <div className="suporte-conversa">
              <ChatConversa
                id="suporte-conversa"
                caminho={`/relatos/${relato.id}/mensagens`}
                semLeitura
                bloqueada={relato.status === 'RESOLVIDO' ? (atendente ? 'Chamado resolvido. Reabra para voltar a conversar.' : 'Chamado resolvido. O atendimento pode reabri-lo se for preciso.') : null}
              />
            </div>
          </section>
        </>
      )}
    </section>
  );
}
