import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { ImagemProtegida } from './ArquivoProtegido';
import { IconeFechar } from './icons';
import { StatusPill } from './StatusPill';
import type { ChamadoParecido, Contrato, ItemSinapi, LinhaRelatorio, Manutencao } from '../types';
import { codigoManutencao, formatarData, formatarMoeda, ROTULO_STATUS_MANUTENCAO } from '../utils/format';

type Executar = (operacao: () => Promise<unknown>) => Promise<void>;

const valorLinha = (l: LinhaRelatorio) => Number(l.quantidade) * Number(l.valorUnitario);

export const totalRelatorio = (linhas: LinhaRelatorio[]) => linhas.reduce((t, l) => t + valorLinha(l), 0);

export function FotosCivil({ fotos }: { fotos: string[] }) {
  if (fotos.length === 0) return null;
  return (
    <section className="equipamento-secao solicitacao-secao-texto">
      <h3>Fotos</h3>
      <div className="civil-fotos">
        {fotos.map((caminho, i) => (
          <ImagemProtegida key={caminho} caminho={caminho} alt={`Foto ${i + 1} do problema`} className="civil-foto" />
        ))}
      </div>
    </section>
  );
}

// Preço de uma linha com a origem: tabela SINAPI e desconto do item de contrato
const origemPreco = (l: LinhaRelatorio) =>
  l.codigoSinapi && l.precoSinapi
    ? `SINAPI ${l.codigoSinapi} · ${formatarMoeda(l.precoSinapi)}${Number(l.descontoPercentual) > 0 ? ` com ${Number(l.descontoPercentual)}% de desconto` : ''}`
    : null;

// Serviços e materiais executados, informados pelo prestador: itens da tabela SINAPI com quantidade; o preço vem da
// tabela com o desconto do contrato. O prestador edita durante a execução; depois da finalização, é só leitura.
export function RelatorioCivil({
  m,
  executar,
  ocupado,
  ehTerceirizada,
}: {
  m: Manutencao;
  executar: Executar;
  ocupado: boolean;
  ehTerceirizada: boolean;
}) {
  const linhas = m.linhasRelatorio ?? [];
  if (linhas.length === 0) return null;
  const podeApagar = ehTerceirizada && m.status === 'EM_EXECUCAO';
  return (
    <section className="equipamento-secao">
      <h3>Serviços e materiais executados</h3>
      <div className="relatorio-civil-scroll" role="region" aria-label="Serviços e materiais executados" tabIndex={0}>
        <table className="relatorio-civil">
          <thead>
            <tr>
              <th scope="col">Descrição</th>
              <th scope="col" className="relatorio-civil-num">Qtd.</th>
              <th scope="col" className="relatorio-civil-num">Valor unit.</th>
              <th scope="col" className="relatorio-civil-num">Total</th>
              {podeApagar && <th scope="col"><span className="gestao-sr-only">Ações</span></th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className="relatorio-civil-descricao">
                  <div className="relatorio-civil-nome">{l.descricao}</div>
                  <div className="relatorio-civil-sub">
                    {l.tipo === 'MATERIAL' ? 'Material' : 'Serviço'}
                    {origemPreco(l) ? ` · ${origemPreco(l)}` : ''}
                  </div>
                </td>
                <td className="relatorio-civil-num" data-label="Qtd.">
                  {Number(l.quantidade)}
                  {l.unidadeMedida ? ` ${l.unidadeMedida}` : ''}
                </td>
                <td className="relatorio-civil-num" data-label="Valor unit.">{formatarMoeda(l.valorUnitario)}</td>
                <td className="relatorio-civil-num relatorio-civil-total" data-label="Total">{formatarMoeda(valorLinha(l))}</td>
                {podeApagar && (
                  <td className="relatorio-civil-acoes">
                    <button
                      type="button"
                      className="itens-remover"
                      disabled={ocupado}
                      aria-label={`Remover lançamento ${l.descricao}`}
                      title="Remover"
                      onClick={() => executar(() => api.delete(`/manutencoes/${m.id}/relatorio/${l.id}`))}
                    >
                      <IconeFechar />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="relatorio-civil-num">
                Total
              </th>
              <td className="relatorio-civil-num relatorio-civil-total" data-label="Total">{formatarMoeda(totalRelatorio(linhas))}</td>
              {podeApagar && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

type ModoTriagem = 'encaminhar' | 'negar' | 'providencias' | 'ajustes' | null;

// Ações do chamado civil, por perfil e etapa. O fluxo: triagem → prestador inicia a execução → prestador finaliza
// informando os serviços executados → confirmação da Unidade → aprovação final (ou ajustes) do Administrador;
// se houver ajustes, a nova finalização volta direto ao Administrador.
export function AcoesCivil({
  m,
  executar,
  ocupado,
  ehAdministrador,
  ehTerceirizada,
  ehUnidadeDona,
}: {
  m: Manutencao;
  executar: Executar;
  ocupado: boolean;
  ehAdministrador: boolean;
  ehTerceirizada: boolean;
  ehUnidadeDona: boolean;
}) {
  const [modo, setModo] = useState<ModoTriagem>(null);
  const [motivo, setMotivo] = useState('');
  const [contratoItemId, setContratoItemId] = useState('');
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [parecidos, setParecidos] = useState<ChamadoParecido[]>([]);
  const [falhaApoio, setFalhaApoio] = useState<string | null>(null);
  const [contestando, setContestando] = useState(false);

  const vazioLinha = { itemSinapiId: '', quantidade: '' };
  const [linha, setLinha] = useState(vazioLinha);
  const [buscaSinapi, setBuscaSinapi] = useState('');
  const [itensSinapi, setItensSinapi] = useState<ItemSinapi[]>([]);
  const [falhaSinapi, setFalhaSinapi] = useState(false);

  const emTriagem = ehAdministrador && (m.status === 'PENDENTE_APROVACAO' || m.status === 'AGUARDANDO_PROVIDENCIAS');

  // Ao mudar de etapa, os formulários voltam ao início
  useEffect(() => {
    setModo(null);
    setMotivo('');
    setContratoItemId('');
    setLinha(vazioLinha);
    setContestando(false);
  }, [m.status]);

  useEffect(() => {
    if (!emTriagem) return;
    setFalhaApoio(null);
    api
      .get<Contrato[]>('/contratos')
      .then(setContratos)
      .catch((e) => setFalhaApoio(e instanceof Error ? e.message : 'Não foi possível carregar os contratos.'));
  }, [emTriagem]);

  useEffect(() => {
    if (!emTriagem) return;
    api
      .get<ChamadoParecido[]>(`/manutencoes/${m.id}/similares`)
      .then((l) => setParecidos(Array.isArray(l) ? l : []))
      .catch(() => setParecidos([]));
  }, [emTriagem, m.id]);

  // Itens elegíveis: contrato vigente, escopo que cobre manutenção civil e saldo disponível
  const contratosElegiveis = contratos
    .filter((c) => c.status !== 'EXPIRADO')
    .map((c) => ({ ...c, itens: c.itens.filter((i) => i.saldo > 0 && i.escopo.cobreCivil) }))
    .filter((c) => c.itens.length > 0);

  const campoItem = (
    <div className="field">
      <label htmlFor="civil-item-contrato">Item do contrato *</label>
      <select id="civil-item-contrato" value={contratoItemId} onChange={(e) => setContratoItemId(e.target.value)}>
        <option value="">Selecione…</option>
        {contratosElegiveis.map((c) => (
          <optgroup key={c.id} label={`${c.numero} · ${c.prestador.nome}`}>
            {c.itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.servico.nome} — saldo {formatarMoeda(i.saldo)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {contratosElegiveis.length === 0 && !falhaApoio && (
        <p className="itens-aviso itens-aviso--acao" role="status">
          Nenhum item de contrato civil com saldo. Sem cobertura, o chamado pode aguardar providências em vez de ir à empresa.
        </p>
      )}
      {falhaApoio && (
        <p className="itens-aviso itens-aviso--acao" role="alert">
          {falhaApoio}
        </p>
      )}
    </div>
  );

  const registrando = ehTerceirizada && m.status === 'EM_EXECUCAO';
  useEffect(() => {
    if (!registrando) return;
    let ativo = true;
    setFalhaSinapi(false);
    api
      .get<ItemSinapi[]>(`/sinapi${buscaSinapi.trim() ? `?busca=${encodeURIComponent(buscaSinapi.trim())}` : ''}`)
      .then((itens) => {
        if (ativo) setItensSinapi(itens);
      })
      .catch(() => {
        if (ativo) setFalhaSinapi(true);
      });
    return () => {
      ativo = false;
    };
  }, [registrando, buscaSinapi]);

  const campoMotivo = (rotulo: string) => (
    <div className="field">
      <label htmlFor="civil-motivo">{rotulo} *</label>
      <input id="civil-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
    </div>
  );

  const linhaValida = linha.itemSinapiId !== '' && Number(linha.quantidade) > 0;
  const lancar = () =>
    executar(async () => {
      await api.post(`/manutencoes/${m.id}/relatorio`, {
        itemSinapiId: linha.itemSinapiId,
        quantidade: Number(linha.quantidade),
      });
      setLinha(vazioLinha);
    });

  const linhas = m.linhasRelatorio ?? [];

  return (
    <>
      {/* Triagem do Administrador: conferir cobertura, duplicidade e disponibilidade antes de encaminhar */}
      {emTriagem && (
        <div className="actions-box">
          <div className="actions-title">
            {m.status === 'AGUARDANDO_PROVIDENCIAS' ? 'Aguardando providências' : 'Triagem do chamado'}
          </div>
          {m.status === 'AGUARDANDO_PROVIDENCIAS' && m.motivoPendencia && (
            <p className="itens-aviso" role="status">
              Motivo: {m.motivoPendencia}
            </p>
          )}
          {parecidos.length > 0 && (
            <section className="civil-parecidos" role="status" aria-labelledby="civil-parecidos-titulo">
              <h4 id="civil-parecidos-titulo">
                Chamados parecidos em aberto <span className="civil-parecidos-total">{parecidos.length}</span>
              </h4>
              <p>Mesmo tipo de problema nesta unidade. Confira antes de encaminhar para não duplicar o atendimento.</p>
              <ul>
                {parecidos.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/manutencoes/${p.id}`}
                      className="civil-parecido"
                      aria-label={`Abrir ${codigoManutencao(p.numero)}${p.titulo ? ` · ${p.titulo}` : ''}`}
                    >
                      <span className="civil-parecido-texto">
                        <span className="civil-parecido-numero">{codigoManutencao(p.numero)}</span>
                        <span className="civil-parecido-sub">
                          {[p.titulo, p.localAfetado, `aberto em ${formatarData(p.criadoEm)}`].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <StatusPill valor={p.status}>{ROTULO_STATUS_MANUTENCAO[p.status]}</StatusPill>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="itens-aviso">
            Confira se o serviço é manutenção (e não alteração de estrutura ou layout, que pode ter outra cobertura) e se
            está no escopo de um contrato com saldo.
          </p>
          {modo === 'encaminhar' && campoItem}
          {modo === 'negar' && campoMotivo('Motivo da negação')}
          {modo === 'providencias' && campoMotivo('O que falta para encaminhar')}
          <div className={`actions-row${modo === null ? ' actions-row--pilha' : ''}`}>
            {modo === null ? (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setModo('negar')}>
                  Negar chamado
                </button>
                {m.status === 'PENDENTE_APROVACAO' && (
                  <button type="button" className="btn btn-outline" onClick={() => setModo('providencias')}>
                    Aguardar providências
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={() => setModo('encaminhar')}>
                  Encaminhar ao prestador
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setModo(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={ocupado || (modo === 'encaminhar' ? !contratoItemId : !motivo.trim())}
                  onClick={() =>
                    executar(() =>
                      modo === 'encaminhar'
                        ? api.post(`/manutencoes/${m.id}/aprovar`, { contratoItemId })
                        : modo === 'negar'
                          ? api.post(`/manutencoes/${m.id}/negar`, { motivo })
                          : api.post(`/manutencoes/${m.id}/aguardar-providencias`, { motivo }),
                    )
                  }
                >
                  {modo === 'encaminhar' ? 'Confirmar encaminhamento' : modo === 'negar' ? 'Confirmar negação' : 'Confirmar'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Prestador: recebe o chamado encaminhado e inicia a execução */}
      {ehTerceirizada && m.status === 'AGUARDANDO_EXECUCAO' && (
        <div className="actions-box actions-box--simples">
          <div className="actions-row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado}
              onClick={() => executar(() => api.post(`/manutencoes/${m.id}/iniciar-execucao`, {}))}
            >
              Iniciar execução
            </button>
          </div>
        </div>
      )}

      {/* Prestador em execução: informa os serviços e materiais executados e confirma a finalização */}
      {ehTerceirizada && m.status === 'EM_EXECUCAO' && (
        <div className="actions-box">
          <div className="actions-title">Serviços e materiais executados</div>
          {m.contestacaoUnidade && (
            <div className="aviso-manutencao" role="alert">
              <strong>A unidade contestou a execução</strong>
              <p>{m.contestacaoUnidade}</p>
            </div>
          )}
          {m.motivoAjuste && (
            <div className="aviso-manutencao" role="alert">
              <strong>O Administrador pediu ajustes</strong>
              <p>{m.motivoAjuste}</p>
            </div>
          )}
          {falhaSinapi && (
            <div className="aviso-manutencao" role="alert">
              Não foi possível carregar a tabela SINAPI. Altere a busca para tentar novamente.
            </div>
          )}
          <div className="field">
            <label htmlFor="civil-sinapi-busca">Buscar na tabela SINAPI</label>
            <input
              id="civil-sinapi-busca"
              maxLength={80}
              placeholder="Código ou descrição"
              value={buscaSinapi}
              onChange={(e) => setBuscaSinapi(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="civil-linha-item">Serviço ou material *</label>
            <select id="civil-linha-item" value={linha.itemSinapiId} onChange={(e) => setLinha({ ...linha, itemSinapiId: e.target.value })}>
              <option value="">{itensSinapi.length === 0 ? 'Nenhum item encontrado' : 'Selecione...'}</option>
              {itensSinapi.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.codigo} · {i.descricao} ({i.unidade})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="civil-linha-qtd">Quantidade *</label>
            <input id="civil-linha-qtd" type="number" step="0.001" min="0" value={linha.quantidade} onChange={(e) => setLinha({ ...linha, quantidade: e.target.value })} />
          </div>
          <div className="actions-row">
            <button type="button" className="btn btn-outline" disabled={ocupado || !linhaValida} onClick={lancar}>
              Adicionar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado || linhas.length === 0}
              onClick={() => executar(() => api.post(`/manutencoes/${m.id}/registrar-retorno`, {}))}
            >
              Confirmar reparo concluído
            </button>
          </div>
        </div>
      )}

      {/* Unidade: "problema resolvido" ou contestação — não aceita o serviço sozinha */}
      {ehUnidadeDona && m.status === 'AGUARDANDO_RETORNO' && (
        <div className="actions-box actions-box--simples">
          {contestando && campoMotivo('Por que o problema persiste')}
          <div className="actions-row">
            {!contestando ? (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setContestando(true)}>
                  Contestar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={ocupado}
                  onClick={() => executar(() => api.post(`/manutencoes/${m.id}/confirmar-retorno`, {}))}
                >
                  Confirmar
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setContestando(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={ocupado || motivo.trim().length < 5}
                  onClick={() => executar(() => api.post(`/manutencoes/${m.id}/contestar`, { motivo }))}
                >
                  Confirmar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Administrador: depois da confirmação da Unidade, dá a aprovação final (autoriza a medição) ou pede ajustes */}
      {ehAdministrador && m.status === 'AGUARDANDO_MEDICAO' && (
        <div className="actions-box">
          <div className="actions-title">Aprovação final</div>
          <p className="itens-aviso" role="status">
            A unidade confirmou que o problema foi resolvido. Ao aprovar, os serviços executados, no total de {formatarMoeda(m.custoFinal)}, são
            liberados para a medição e o consumo do saldo do contrato é finalizado.
          </p>
          {modo === 'ajustes' && campoMotivo('O que precisa ser ajustado')}
          <div className="actions-row">
            {modo !== 'ajustes' ? (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setModo('ajustes')}>
                  Solicitar ajustes
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={ocupado}
                  onClick={() => executar(() => api.post(`/manutencoes/${m.id}/autorizar-medicao`, {}))}
                >
                  Aprovar
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-outline" onClick={() => setModo(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={ocupado || motivo.trim().length < 5}
                  onClick={() => executar(() => api.post(`/manutencoes/${m.id}/solicitar-ajustes`, { motivo }))}
                >
                  Confirmar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function SeloMedicao({ m }: { m: Manutencao }) {
  if (!m.conferidoMedicaoEm) return null;
  return <StatusPill valor="CONCLUIDA">Conferido para medição</StatusPill>;
}
