import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { HistoricoRecolhivel } from '../components/HistoricoRecolhivel';
import { QrCodeEquipamento } from '../components/QrCodeEquipamento';
import type { Equipamento } from '../types';
import {
  formatarData,
  ROTULO_ESTADO,
  ROTULO_MOVIMENTACAO,
  ROTULO_STATUS_EQUIPAMENTO,
} from '../utils/format';
import { EsqueletoDetalhe } from '../components/Esqueletos';

export function EquipamentoDetalhe() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const [equipamento, setEquipamento] = useState<Equipamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<Equipamento>(`/equipamentos/${id}`)
      .then(setEquipamento)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar o equipamento.'));
  }, [id]);

  if (erro) {
    return (
      <section className="gestao-page equipamento-pagina">
        <div className="error-banner" role="alert">{erro}</div>
      </section>
    );
  }

  if (!equipamento) {
    return <EsqueletoDetalhe rotulo="Carregando equipamento…" />;
  }

  return (
    <section className="gestao-page equipamento-pagina" aria-labelledby="equipamento-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div>
          <div className="equipamento-titulo-linha">
            <h2 id="equipamento-titulo">{equipamento.tipoEquipamento.nome}</h2>
            <span className={`inventario-status inventario-status--${equipamento.status}`}>
              <span aria-hidden />
              {ROTULO_STATUS_EQUIPAMENTO[equipamento.status]}
            </span>
          </div>
          <div className="equipamento-tombamento-linha">
            <span className="equipamento-tombamento">Tombamento {equipamento.tombamento}</span>
            <QrCodeEquipamento
              equipamentoId={equipamento.id}
              tombamento={equipamento.tombamento}
              descricao={equipamento.descricao ?? equipamento.tipoEquipamento.nome}
              unidade={equipamento.unidade.nome}
            />
          </div>
        </div>
        {/* Só a unidade dona abre chamados do próprio equipamento em operação */}
        {usuario?.perfil === 'UNIDADE' &&
          equipamento.status === 'ATIVO' &&
          equipamento.unidade.id === usuario.unidadeId && (
            <div className="inventario-lista-acoes">
              <Link className="btn btn-outline" to={`/solicitacoes/nova?equipamento=${equipamento.id}`}>
                Abrir solicitação
              </Link>
              <Link className="btn btn-outline" to={`/manutencoes/nova?equipamento=${equipamento.id}`}>
                Abrir manutenção
              </Link>
            </div>
          )}
      </div>

      <div className="equipamento-detalhe-layout">
        <div className="equipamento-detalhe-principal">
          <section className="equipamento-secao">
            <h3>Informações do equipamento</h3>
            <dl className="equipamento-dados">
              <div>
                <dt>Tipo de equipamento</dt>
                <dd>{equipamento.tipoEquipamento.nome}</dd>
              </div>
              {equipamento.descricao && equipamento.descricao !== equipamento.tipoEquipamento.nome && (
                <div>
                  <dt>Descrição</dt>
                  <dd>{equipamento.descricao}</dd>
                </div>
              )}
              <div>
                <dt>Tombamento</dt>
                <dd>{equipamento.tombamento}</dd>
              </div>
              <div>
                <dt>Estado de conservação</dt>
                <dd>{ROTULO_ESTADO[equipamento.estadoConservacao]}</dd>
              </div>
              <div>
                <dt>Data de aquisição</dt>
                <dd>{formatarData(equipamento.dataAquisicao)}</dd>
              </div>
              <div>
                <dt>Origem do recurso</dt>
                <dd>{equipamento.emendaParlamentar ? 'Emenda parlamentar' : 'Regular'}</dd>
              </div>
            </dl>
          </section>

          {equipamento.observacoes && (
            <section className="equipamento-secao">
              <h3>Observações</h3>
              <p>{equipamento.observacoes}</p>
            </section>
          )}

          <HistoricoRecolhivel id="historico-equipamento">
            {(equipamento.movimentacoes ?? []).length === 0 ? (
              <div className="equipamento-historico-vazio">Sem movimentações registradas.</div>
            ) : (
              <ol className="equipamento-historico historico-lista">
                {(equipamento.movimentacoes ?? []).map((movimentacao) => (
                  <li className="equipamento-evento" key={movimentacao.id}>
                    <div>
                      <strong>{ROTULO_MOVIMENTACAO[movimentacao.tipo] ?? movimentacao.tipo}</strong>
                      <p>{movimentacao.descricao}</p>
                      <p>
                        <time dateTime={movimentacao.criadoEm}>{formatarData(movimentacao.criadoEm)}</time>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </HistoricoRecolhivel>
        </div>

        <aside className="equipamento-detalhe-lateral" aria-label="Resumo do equipamento">
          <section className="equipamento-secao">
            <h3>Situação</h3>
            <dl className="equipamento-dados equipamento-dados--lateral">
              <div>
                <dt>Status</dt>
                <dd>{ROTULO_STATUS_EQUIPAMENTO[equipamento.status]}</dd>
              </div>
              <div>
                <dt>Conservação</dt>
                <dd>{ROTULO_ESTADO[equipamento.estadoConservacao]}</dd>
              </div>
            </dl>
          </section>

          <section className="equipamento-secao">
            <h3>Localização</h3>
            <dl className="equipamento-dados equipamento-dados--lateral">
              <div>
                <dt>Unidade responsável</dt>
                <dd>{equipamento.unidade.nome}</dd>
              </div>
              {equipamento.unidadeTemporaria && (
                <div>
                  <dt>Localização temporária</dt>
                  <dd>{equipamento.unidadeTemporaria.nome}</dd>
                </div>
              )}
            </dl>
          </section>

        </aside>
      </div>
    </section>
  );
}
