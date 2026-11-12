import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ImagemProtegida, LinkArquivoProtegido } from '../../components/ArquivoProtegido';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useCarga } from '../../hooks/useCarga';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import type { RelatoProblema, StatusRelato } from '../../types';
import { formatarDataHora, ROTULO_PERFIL } from '../../utils/format';
import { ROTULO_STATUS_RELATO } from '../../utils/relato';

export function RelatoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusRelato>('ABERTO');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);

  const { dados: relato, carregando, falha } = useCarga(
    () => api.get<RelatoProblema>(`/relatos/${id}`),
    Boolean(id),
    'Não foi possível carregar o relato. Recarregue a página para tentar novamente.',
  );

  useEffect(() => {
    if (relato) setStatus(relato.status);
  }, [relato]);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.patch(`/relatos/${id}/status`, { status });
      void navigate('/configuracoes/relatos');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar o status.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaginaCadastro
      id="relato-detalhe"
      titulo="Bug reportado"
      formId="form-relato-detalhe"
      onCancelar={() => void navigate('/configuracoes/relatos')}
      onEnviar={aoEnviar}
      desabilitarSalvar={!relato || status === relato.status}
      enviando={enviando}
      erro={erro}
      aoExibirErro={() => setErro(null)}
      carregando={carregando}
      falha={falha}
    >
      {relato && (
        <>
          <section className="equipamento-secao">
            <h3>Situação</h3>
            <div className="novo-equipamento-grade">
              <div className="field novo-equipamento-largura-total">
                <label htmlFor="relato-status">Status</label>
                <select id="relato-status" value={status} onChange={(e) => setStatus(e.target.value as StatusRelato)}>
                  {Object.entries(ROTULO_STATUS_RELATO).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="equipamento-secao">
            <h3>O que a pessoa contou</h3>
            <dl className="equipamento-dados">
              <div>
                <dt>Quem enviou</dt>
                <dd>
                  {relato.usuario.nome}
                  <span className="dado-apoio">
                    {ROTULO_PERFIL[relato.perfil]} · {relato.usuario.email}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Enviado em</dt>
                <dd>{formatarDataHora(relato.criadoEm)}</dd>
              </div>
              <div>
                <dt>Tela</dt>
                <dd>{relato.tela}</dd>
              </div>
              <div>
                <dt>Navegador</dt>
                <dd className="relato-navegador">{relato.navegador || 'Não informado'}</dd>
              </div>
              <div className="relato-largura-total">
                <dt>O que esperava</dt>
                <dd className="relato-texto">{relato.esperado || 'Não informado'}</dd>
              </div>
              <div className="relato-largura-total">
                <dt>O que aconteceu</dt>
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
                    <ImagemProtegida key={caminho} caminho={caminho} alt={`Anexo ${i + 1} do bug`} className="solicitacao-anexo-imagem" />
                  ),
                )}
              </div>
            ) : (
              <div className="equipamento-historico-vazio">Sem arquivos anexados</div>
            )}
          </section>
        </>
      )}
    </PaginaCadastro>
  );
}
