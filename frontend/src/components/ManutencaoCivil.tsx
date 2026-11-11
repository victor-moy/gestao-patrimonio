import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { ImagemProtegida } from './ArquivoProtegido';
import { IconeFechar } from './icons';
import { StatusPill } from './StatusPill';
import { rotuloSinapi, SelecaoItem } from './SelecaoItem';
import type { ChamadoParecido, Contrato, ItemSinapi, LinhaRelatorio, Manutencao } from '../types';
import { codigoManutencao, formatarData, formatarMoeda, statusManutencaoExibido } from '../utils/format';

type Executar = (operacao: () => Promise<unknown>) => Promise<void>;

const valorLinha = (l: LinhaRelatorio) => Number(l.quantidade) * Number(l.valorUnitario);

export const totalRelatorio = (linhas: LinhaRelatorio[]) => linhas.reduce((t, l) => t + valorLinha(l), 0);

// Só as miniaturas, para usar dentro de outro card
export function GradeFotosCivil({ fotos }: { fotos: string[] }) {
  if (fotos.length === 0) return null;
  return (
    <div className="civil-fotos">
      {fotos.map((caminho, i) => (
        <ImagemProtegida key={caminho} caminho={caminho} alt={`Foto ${i + 1} do problema`} className="civil-foto" />
      ))}
    </div>
  );
}

export function FotosCivil({ fotos }: { fotos: string[] }) {
  if (fotos.length === 0) return null;
  return (
    <section className="equipamento-secao solicitacao-secao-texto">
      <h3>Fotos</h3>
      <GradeFotosCivil fotos={fotos} />
    </section>
  );
}

// Preço de uma linha com a origem: tabela SINAPI e desconto do item de contrato
const origemPreco = (l: LinhaRelatorio) =>
  l.codigoSinapi && l.precoSinapi
    ? `SINAPI ${l.codigoSinapi} · ${formatarMoeda(l.precoSinapi)}${Number(l.descontoPercentual) > 0 ? ` com ${Number(l.descontoPercentual)}% de desconto` : ''}`
    : null;

// Tabela de itens (serviços e materiais da tabela SINAPI) com quantidade, valor unitário e total. Usada nos itens
// previstos (avaliação técnica) e nos itens executados; com `onRemover` mostra o botão de remover em cada linha.
export function TabelaItens({
  linhas,
  rotulo,
  onRemover,
  ocupado = false,
  encaixada = false,
  semValores = false,
}: {
  linhas: LinhaRelatorio[];
  rotulo: string;
  onRemover?: (linha: LinhaRelatorio) => void;
  ocupado?: boolean;
  // Dentro de um box com outros campos: tabela com borda própria, sem sangrar até a borda do box
  encaixada?: boolean;
  // O prestador lança itens e quantidades, mas não vê preços nem totais
  semValores?: boolean;
}) {
  const podeApagar = Boolean(onRemover);
  return (
    <div className={`relatorio-civil-scroll${encaixada ? ' relatorio-civil-scroll--encaixada' : ''}`} role="region" aria-label={rotulo} tabIndex={0}>
      <table className="relatorio-civil">
        <thead>
          <tr>
            <th scope="col">Descrição</th>
            <th scope="col" className="relatorio-civil-num">Qtd.</th>
            {!semValores && <th scope="col" className="relatorio-civil-num">Valor unit.</th>}
            {!semValores && <th scope="col" className="relatorio-civil-num">Total</th>}
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
                  {!semValores && origemPreco(l) ? ` · ${origemPreco(l)}` : ''}
                  {semValores && l.codigoSinapi ? ` · SINAPI ${l.codigoSinapi}` : ''}
                </div>
              </td>
              <td className="relatorio-civil-num" data-label="Qtd.">
                {Number(l.quantidade)}
                {l.unidadeMedida ? ` ${l.unidadeMedida}` : ''}
              </td>
              {!semValores && <td className="relatorio-civil-num" data-label="Valor unit.">{formatarMoeda(l.valorUnitario)}</td>}
              {!semValores && <td className="relatorio-civil-num relatorio-civil-total" data-label="Total">{formatarMoeda(valorLinha(l))}</td>}
              {podeApagar && (
                <td className="relatorio-civil-acoes">
                  <button
                    type="button"
                    className="itens-remover"
                    disabled={ocupado}
                    aria-label={`Remover ${l.descricao}`}
                    title="Remover"
                    onClick={() => onRemover?.(l)}
                  >
                    <IconeFechar />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {!semValores && (
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="relatorio-civil-num">
                Total
              </th>
              <td className="relatorio-civil-num relatorio-civil-total" data-label="Total">{formatarMoeda(totalRelatorio(linhas))}</td>
              {podeApagar && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// Itens executados, informados pelo prestador: itens da tabela SINAPI com quantidade; o preço vem da tabela com o
// desconto do contrato. Enquanto o serviço está em execução, o prestador lança e remove itens no próprio box;
// depois da finalização é só leitura. Finalizar fica no menu "Ações".
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
  const vazioLinha = { itemSinapiId: '', quantidade: '' };
  const [linha, setLinha] = useState(vazioLinha);
  const [buscaSinapi, setBuscaSinapi] = useState('');
  const [itensSinapi, setItensSinapi] = useState<ItemSinapi[]>([]);
  const [falhaSinapi, setFalhaSinapi] = useState(false);
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

  const linhas = m.linhasRelatorio ?? [];
  // Os itens previstos ficam no box da avaliação técnica (antes de iniciar a execução)
  const aindaPrevisto = m.status === 'AGUARDANDO_AVALIACAO_TECNICA' || m.status === 'AGUARDANDO_EXECUCAO';
  if (!registrando && (linhas.length === 0 || aindaPrevisto)) return null;

  const linhaValida = linha.itemSinapiId !== '' && Number(linha.quantidade) > 0;
  const lancar = () =>
    executar(async () => {
      await api.post(`/manutencoes/${m.id}/relatorio`, {
        itemSinapiId: linha.itemSinapiId,
        quantidade: Number(linha.quantidade),
      });
      setLinha(vazioLinha);
      setBuscaSinapi('');
    });

  return (
    <section className="equipamento-secao lancar-itens">
      <h3>Itens executados</h3>
      {registrando && (
        <div className="lancar-itens-form">
          {m.contestacaoUnidade && (
            <div className="aviso-manutencao" role="alert">
              <strong>A unidade contestou a execução</strong>
              <p>{m.contestacaoUnidade}</p>
            </div>
          )}
          {m.motivoAjuste && (
            <div className="aviso-manutencao" role="alert">
              <strong>O operador pediu ajustes</strong>
              <p>{m.motivoAjuste}</p>
            </div>
          )}
          {falhaSinapi && (
            <div className="aviso-manutencao" role="alert">
              Não foi possível carregar a tabela SINAPI. Altere a busca para tentar novamente.
            </div>
          )}
          <div className="field">
            <label htmlFor="civil-linha-item">Item *</label>
            <SelecaoItem
              id="civil-linha-item"
              texto={buscaSinapi}
              itens={itensSinapi}
              onTexto={(t) => {
                setBuscaSinapi(t);
                setLinha((atual) => ({ ...atual, itemSinapiId: '' }));
              }}
              onEscolher={(i) => {
                setBuscaSinapi(rotuloSinapi(i));
                setLinha((atual) => ({ ...atual, itemSinapiId: i.id }));
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="civil-linha-qtd">Quantidade *</label>
            <input id="civil-linha-qtd" type="number" step="0.001" min="0" value={linha.quantidade} onChange={(e) => setLinha({ ...linha, quantidade: e.target.value })} />
          </div>
          <div className="actions-row">
            <button type="button" className="btn btn-outline" disabled={ocupado || !linhaValida} onClick={lancar}>
              Adicionar
            </button>
          </div>
        </div>
      )}
      {linhas.length > 0 && (
        <TabelaItens
          linhas={linhas}
          rotulo="Itens executados"
          ocupado={ocupado}
          semValores={ehTerceirizada}
          onRemover={registrando ? (l) => executar(() => api.delete(`/manutencoes/${m.id}/relatorio/${l.id}`)) : undefined}
        />
      )}
    </section>
  );
}

// Painéis do chamado civil abertos pelo menu "Ações" (cada um pede os dados da ação): aprovar ou negar na triagem,
// contestar (Unidade) e solicitar ajustes (Administrador). O fluxo: triagem → prestador inicia a execução → prestador
// finaliza informando os itens executados → confirmação da Unidade → aprovação final (ou ajustes) do Administrador;
// se houver ajustes, a nova finalização volta direto ao Administrador.
// Fim do prazo de 7 dias corridos para a Unidade confirmar a resolução
const prazoDeConfirmacao = (desde: string) => new Date(new Date(desde).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

export function AcoesCivil({
  m,
  executar,
  ocupado,
  podeTriar,
  podeFiscalizar,
  ehUnidadeDona,
  painel,
  fechar,
}: {
  m: Manutencao;
  executar: Executar;
  ocupado: boolean;
  podeTriar: boolean;
  podeFiscalizar: boolean;
  ehUnidadeDona: boolean;
  painel: string | null;
  fechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [contratoItemId, setContratoItemId] = useState('');
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [parecidos, setParecidos] = useState<ChamadoParecido[]>([]);
  const [falhaApoio, setFalhaApoio] = useState<string | null>(null);

  const emTriagem = podeTriar && m.status === 'PENDENTE_APROVACAO' && (painel === 'aprovar' || painel === 'negar');
  const modo = painel === 'aprovar' ? 'encaminhar' : 'negar';

  // Ao mudar de etapa ou de painel, os formulários voltam ao início
  useEffect(() => {
    setMotivo('');
    setContratoItemId('');
  }, [m.status, painel]);

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

  // Itens elegíveis: contrato vigente. O saldo aparece como informação, mas não bloqueia a escolha
  const contratosElegiveis = contratos.filter((c) => c.status !== 'EXPIRADO' && c.itens.length > 0);

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
          Nenhum item de contrato vigente. Sem cobertura, o chamado não pode ser aprovado.
        </p>
      )}
      {falhaApoio && (
        <p className="itens-aviso itens-aviso--acao" role="alert">
          {falhaApoio}
        </p>
      )}
    </div>
  );

  const campoMotivo = (rotulo: string) => (
    <div className="field">
      <label htmlFor="civil-motivo">{rotulo} *</label>
      <input id="civil-motivo" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
    </div>
  );

  const painelMotivo = (titulo: string, rotuloCampo: string, confirmar: () => Promise<void>, minimo = 1, textoConfirmar = 'Confirmar') => (
    <div className="actions-box">
      <div className="actions-title">{titulo}</div>
      {campoMotivo(rotuloCampo)}
      <div className="actions-row">
        <button type="button" className="btn btn-outline" onClick={fechar}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" disabled={ocupado || motivo.trim().length < minimo} onClick={() => void confirmar()}>
          {textoConfirmar}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Triagem do Administrador: conferir cobertura, duplicidade e disponibilidade antes de aprovar */}
      {emTriagem && (
        <div className="actions-box">
          <div className="actions-title">{modo === 'encaminhar' ? 'Aprovar chamado' : 'Negar chamado'}</div>
          {parecidos.length > 0 && (
            <section className="civil-parecidos" role="status" aria-labelledby="civil-parecidos-titulo">
              <h4 id="civil-parecidos-titulo">
                Chamados parecidos em aberto <span className="civil-parecidos-total">{parecidos.length}</span>
              </h4>
              <p>Mesmo tipo de problema nesta unidade. Confira antes de aprovar para não duplicar o atendimento.</p>
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
                      <StatusPill valor={statusManutencaoExibido(p).valor}>{statusManutencaoExibido(p).texto}</StatusPill>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="itens-aviso">
            Confira se o serviço é manutenção (e não alteração de estrutura ou layout, que pode ter outra cobertura) e se
            tem contrato vigente.
          </p>
          {modo === 'encaminhar' ? campoItem : campoMotivo('Motivo da negação')}
          <div className="actions-row">
            <button type="button" className="btn btn-outline" onClick={fechar}>
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
                    : api.post(`/manutencoes/${m.id}/negar`, { motivo }),
                )
              }
            >
              {modo === 'encaminhar' ? 'Confirmar aprovação' : 'Confirmar negação'}
            </button>
          </div>
        </div>
      )}

      {/* Unidade: contesta a execução (o problema persiste); "problema resolvido" é uma ação direta do menu */}
      {ehUnidadeDona && m.status === 'AGUARDANDO_RETORNO' && (
        <p className="itens-aviso" role="status">
          Confirme se o problema foi resolvido. Sem resposta
          {m.aguardandoRetornoEm ? ` até ${formatarData(prazoDeConfirmacao(m.aguardandoRetornoEm))}` : ' em 7 dias'}, o chamado é dado como
          resolvido automaticamente. Se o problema persiste, ao contestar este atendimento é encerrado e um novo chamado é aberto na
          triagem.
        </p>
      )}
      {ehUnidadeDona &&
        m.status === 'AGUARDANDO_RETORNO' &&
        painel === 'contestar' &&
        painelMotivo('Contestar execução', 'Por que o problema persiste', () => executar(() => api.post(`/manutencoes/${m.id}/contestar`, { motivo })), 5)}

      {/* Administrador: depois da confirmação da Unidade, aprova (ação direta do menu) ou pede ajustes */}
      {podeFiscalizar && m.status === 'AGUARDANDO_MEDICAO' && (
        <>
          <p className="itens-aviso" role="status">
            {m.resolvidoAutomaticamenteEm
              ? 'A unidade não respondeu em 7 dias e o chamado foi dado como resolvido automaticamente.'
              : 'A unidade confirmou que o problema foi resolvido.'}{' '}
            Ao aprovar, os itens executados, no total de {formatarMoeda(m.custoFinal)}, são
            liberados para a medição e o consumo do saldo do contrato é finalizado.
          </p>
          {painel === 'ajustes' &&
            painelMotivo('Solicitar ajustes', 'O que precisa ser ajustado', () => executar(() => api.post(`/manutencoes/${m.id}/solicitar-ajustes`, { motivo })), 5)}
        </>
      )}
    </>
  );
}
