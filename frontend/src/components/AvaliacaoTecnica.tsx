import { type ReactNode, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { EdicaoAvaliacao } from '../hooks/useEdicaoAvaliacao';
import type { ItemSinapi, Manutencao } from '../types';
import { formatarMoeda } from '../utils/format';
import { nomeEquipamento } from '../utils/manutencao';
import { useCategoriasCivis } from '../hooks/useCategoriasCivis';
import { TabelaItens } from './ManutencaoCivil';
import { MultiSelecao } from './MultiSelecao';
import { rotuloSinapi, SelecaoItem } from './SelecaoItem';

type Executar = (operacao: () => Promise<unknown>) => Promise<void>;

// Tudo o que a avaliação técnica produziu, num único box: parecer, orientações, itens previstos e encerramento.
// Os itens previstos só aparecem até o prestador iniciar; depois viram o relatório de execução.
export function ResumoAvaliacaoTecnica({ m }: { m: Manutencao }) {
  const previstos = m.status === 'AGUARDANDO_EXECUCAO' ? (m.linhasRelatorio ?? []) : [];
  const encerrada = m.status === 'ENCERRADA' && m.motivoEncerramento;
  if (!m.parecerTecnico && !m.parecerVistoria && !m.orientacoesTerceirizada && previstos.length === 0 && !encerrada) return null;
  const tituloEncerramento =
    m.tipoEncerramento === 'DUPLICADO' ? 'Chamado duplicado' : m.tipoEncerramento === 'UNIFICADO' ? 'Chamado unificado' : 'Chamado encerrado';
  return (
    <section className="equipamento-secao" aria-labelledby="resumo-avaliacao-titulo">
      <h3 id="resumo-avaliacao-titulo">Avaliação técnica</h3>
      <dl className="equipamento-dados equipamento-dados--lateral">
        {m.parecerTecnico && (
          <div>
            <dt>Parecer</dt>
            <dd className="avaliacao-texto">{m.parecerTecnico}</dd>
          </div>
        )}
        {m.parecerVistoria && (
          <div>
            <dt>Parecer da vistoria</dt>
            <dd className="avaliacao-texto">{m.parecerVistoria}</dd>
          </div>
        )}
        {m.orientacoesTerceirizada && (
          <div>
            <dt>Orientações para a terceirizada</dt>
            <dd className="avaliacao-texto">{m.orientacoesTerceirizada}</dd>
          </div>
        )}
        {previstos.length > 0 && (
          <div>
            <dt>Itens previstos</dt>
            <dd>
              <TabelaItens linhas={previstos} rotulo="Itens previstos" encaixada />
            </dd>
          </div>
        )}
        {encerrada && (
          <div>
            <dt>{tituloEncerramento}</dt>
            <dd className="avaliacao-texto">
              {m.motivoEncerramento}
              {m.chamadoOriginal && (
                <span className="dado-apoio">
                  Segue no chamado MAN-{String(m.chamadoOriginal.numero).padStart(4, '0')}
                  {m.chamadoOriginal.titulo ? ` · ${m.chamadoOriginal.titulo}` : ''}
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

// Nas seções de cima da página, durante a avaliação técnica, os próprios dados do chamado viram campos editáveis
export function LinhasEditaveis({ m, edicao }: { m: Manutencao; edicao: EdicaoAvaliacao }) {
  const { form, setForm, campo } = edicao;
  const civil = m.tipo === 'CIVIL';
  const { categorias } = useCategoriasCivis(civil);
  const linha = (id: string, rotulo: string, controle: ReactNode, larga = false) => (
    <div className={larga ? 'avaliacao-largura-total' : undefined}>
      <dt>
        <label htmlFor={id}>{rotulo}</label>
      </dt>
      <dd>{controle}</dd>
    </div>
  );
  return (
    <>
      {linha(
        'aval-unidade',
        'Unidade',
        <select
          id="aval-unidade"
          value={form.unidadeId}
          disabled={Boolean(edicao.equipamentoId)}
          onChange={(e) => setForm({ ...form, unidadeId: e.target.value, setorIds: [] })}
        >
          {edicao.unidades.length === 0 && <option value={form.unidadeId}>{m.unidade.nome}</option>}
          {edicao.unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </select>,
      )}
      {linha(
        'aval-setor',
        'Setor afetado',
        <MultiSelecao
          id="aval-setor"
          opcoes={edicao.setores}
          valor={form.setorIds}
          onChange={(ids) => setForm({ ...form, setorIds: ids })}
          placeholder="Não informado"
          semOpcoes="Esta unidade não tem setores cadastrados"
        />,
      )}
      {linha('aval-solicitante', 'Solicitado por', <span>{m.solicitante.nome}</span>)}
      {linha('aval-titulo', 'Título', <input id="aval-titulo" maxLength={80} value={form.titulo} onChange={campo('titulo')} />)}
      {!civil &&
        linha(
          'aval-equip-busca',
          'Item',
          <>
            <span>
              {nomeEquipamento(m)}
              <span className="dado-apoio">{m.equipamento?.tombamento}</span>
            </span>
            <span className="avaliacao-linha">
              <input
                id="aval-equip-busca"
                placeholder="Trocar: tombamento ou descrição"
                value={edicao.buscaEquip}
                onChange={(e) => edicao.setBuscaEquip(e.target.value)}
              />
              <button type="button" className="btn btn-outline" disabled={!edicao.buscaEquip.trim()} onClick={() => void edicao.buscarEquipamento()}>
                Buscar
              </button>
            </span>
            {edicao.achados.length > 0 && (
              <select aria-label="Equipamento encontrado" value={edicao.equipamentoId} onChange={(e) => edicao.setEquipamentoId(e.target.value)}>
                <option value="">Manter o equipamento atual</option>
                {edicao.achados.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.tombamento} · {eq.descricao} ({eq.unidade.nome})
                  </option>
                ))}
              </select>
            )}
          </>,
          true,
        )}
      {civil &&
        linha(
          'aval-categoria',
          'Tipo de problema',
          <select id="aval-categoria" value={form.categoriaCivilId} onChange={campo('categoriaCivilId')}>
            <option value="">Não informado</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
            {/* categoria já desativada continua aparecendo no chamado que a usa */}
            {m.categoriaCivil && !categorias.some((c) => c.id === m.categoriaCivil?.id) && (
              <option value={m.categoriaCivil.id}>{m.categoriaCivil.nome}</option>
            )}
          </select>,
        )}
      {linha(
        'aval-prestador',
        'Prestador',
        <select id="aval-prestador" value={edicao.prestadorId} onChange={(e) => edicao.trocarPrestador(e.target.value)}>
          <option value="">Selecione…</option>
          {edicao.prestadores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>,
      )}
      {linha(
        'aval-item',
        'Item do contrato',
        <select id="aval-item" value={form.contratoItemId} onChange={campo('contratoItemId')} disabled={!edicao.prestadorId}>
          <option value="">Selecione…</option>
          {edicao.itensContrato.map((i) => (
            <option key={i.id} value={i.id} title={i.rotulo}>
              {i.servico} — saldo {formatarMoeda(i.saldo)}
            </option>
          ))}
        </select>,
      )}
      {linha(
        'aval-descricao',
        'Descrição do problema',
        <textarea id="aval-descricao" rows={3} maxLength={2000} value={form.descricaoProblema} onChange={campo('descricaoProblema')} />,
        true,
      )}
    </>
  );
}

type Destino = 'encerrar' | 'informacoes' | 'orcamento' | 'dispensa' | null;

export function AvaliacaoTecnica({
  m,
  edicao,
  executar,
  ocupado,
}: {
  m: Manutencao;
  edicao: EdicaoAvaliacao;
  executar: Executar;
  ocupado: boolean;
}) {
  const { ativo, form, campo, semMudanca } = edicao;
  const civil = m.tipo === 'CIVIL';
  const [destino, setDestino] = useState<Destino>(null);
  const [tipoEncerramento, setTipoEncerramento] = useState('ENCERRADO');
  const [motivo, setMotivo] = useState('');
  const [numeroOriginal, setNumeroOriginal] = useState('');
  // O campo do item é também a busca: ao digitar, a lista (datalist) vem filtrada da tabela
  const [textoItem, setTextoItem] = useState('');
  const buscaSinapi = textoItem;
  const [itensSinapi, setItensSinapi] = useState<ItemSinapi[]>([]);
  const [material, setMaterial] = useState({ itemSinapiId: '', quantidade: '' });

  useEffect(() => {
    setDestino(null);
    setMotivo('');
    setNumeroOriginal('');
  }, [m.status]);

  useEffect(() => {
    if (!ativo || !civil) return;
    let vivo = true;
    api
      .get<ItemSinapi[]>(`/sinapi${buscaSinapi.trim() ? `?busca=${encodeURIComponent(buscaSinapi.trim())}` : ''}`)
      .then((l) => vivo && setItensSinapi(l))
      .catch(() => vivo && setItensSinapi([]));
    return () => {
      vivo = false;
    };
  }, [ativo, civil, buscaSinapi]);

  if (!ativo) return null;

  const parecerOk = form.parecerTecnico.trim().length >= 3;
  // Serviço que exige orçamento prévio: só segue ao prestador com orçamento aprovado ou, em risco à vida, justificando
  const exigeOrcamento = civil && m.contratoItem?.servico.exigeOrcamentoPrevio === true && !m.dispensaOrcamentoMotivo && !m.cotacaoAprovadaId;
  const linhas = m.linhasRelatorio ?? [];
  const encerramentoValido = motivo.trim().length >= 3 && (tipoEncerramento === 'ENCERRADO' || Number(numeroOriginal) > 0);

  return (
    <section className="equipamento-secao avaliacao-tecnica" aria-labelledby="avaliacao-titulo">
      <h3 id="avaliacao-titulo">Avaliação técnica</h3>
      {/* Depois da vistoria o chamado volta à avaliação: o parecer precisa estar à vista de quem vai decidir de novo */}
      {m.parecerVistoria && (
        <dl className="equipamento-dados equipamento-dados--lateral">
          <div>
            <dt>Parecer da vistoria</dt>
            <dd className="avaliacao-texto">{m.parecerVistoria}</dd>
          </div>
        </dl>
      )}
      {edicao.falhaApoio && (
        <p className="itens-aviso itens-aviso--acao" role="alert">
          {edicao.falhaApoio}
        </p>
      )}

      {civil && (
        <div className="avaliacao-bloco">
          <h4>Itens previstos</h4>
          <div className="avaliacao-adicionar">
            <SelecaoItem
              texto={textoItem}
              itens={itensSinapi}
              onTexto={(t) => {
                setTextoItem(t);
                setMaterial((atual) => ({ ...atual, itemSinapiId: '' }));
              }}
              onEscolher={(i) => {
                setTextoItem(rotuloSinapi(i));
                setMaterial((atual) => ({ ...atual, itemSinapiId: i.id }));
              }}
            />
            <input
              aria-label="Quantidade"
              className="avaliacao-qtd"
              inputMode="decimal"
              placeholder="Qtd."
              value={material.quantidade}
              onChange={(e) => setMaterial({ ...material, quantidade: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-outline"
              disabled={ocupado || !material.itemSinapiId || !(Number(material.quantidade.replace(',', '.')) > 0)}
              onClick={() =>
                executar(async () => {
                  await api.post(`/manutencoes/${m.id}/materiais`, {
                    itemSinapiId: material.itemSinapiId,
                    quantidade: Number(material.quantidade.replace(',', '.')),
                  });
                  setMaterial({ itemSinapiId: '', quantidade: '' });
                  setTextoItem('');
                })
              }
            >
              Adicionar
            </button>
          </div>
          {linhas.length > 0 && (
            <TabelaItens
              linhas={linhas}
              rotulo="Itens previstos"
              encaixada
              ocupado={ocupado}
              onRemover={(l) => executar(() => api.delete(`/manutencoes/${m.id}/materiais/${l.id}`))}
            />
          )}
        </div>
      )}

      <div className="avaliacao-textos">
        <div className="field">
          <label htmlFor="aval-orientacoes">Orientações para a terceirizada</label>
          <textarea id="aval-orientacoes" rows={2} maxLength={2000} value={form.orientacoesTerceirizada} onChange={campo('orientacoesTerceirizada')} />
        </div>
        <div className="field">
          <label htmlFor="aval-parecer">Parecer da avaliação técnica *</label>
          <textarea id="aval-parecer" rows={2} maxLength={1000} value={form.parecerTecnico} onChange={campo('parecerTecnico')} />
        </div>
      </div>

      {destino === 'encerrar' && (
        <div className="avaliacao-encerrar" role="group" aria-label="Encerrar chamado">
          <div className="field">
            <label htmlFor="aval-tipo-encerramento">Como encerrar</label>
            <select id="aval-tipo-encerramento" value={tipoEncerramento} onChange={(e) => setTipoEncerramento(e.target.value)}>
              <option value="ENCERRADO">Encerrado</option>
              <option value="DUPLICADO">Duplicado</option>
              <option value="UNIFICADO">Unificado a outro chamado</option>
            </select>
          </div>
          {tipoEncerramento !== 'ENCERRADO' && (
            <div className="field">
              <label htmlFor="aval-original">Chamado original (número) *</label>
              <input id="aval-original" inputMode="numeric" placeholder="Ex.: 12" value={numeroOriginal} onChange={(e) => setNumeroOriginal(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}
          <div className="field avaliacao-encerrar-motivo">
            <label htmlFor="aval-motivo">Motivo *</label>
            <input id="aval-motivo" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
      )}

      {destino === 'orcamento' && (
        <div className="avaliacao-encerrar avaliacao-encerrar--simples" role="group" aria-label="Solicitar orçamento">
          <div className="field avaliacao-encerrar-motivo">
            <label htmlFor="aval-instrucoes-orcamento">O que o prestador deve orçar? *</label>
            <textarea id="aval-instrucoes-orcamento" rows={3} maxLength={2000} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <p className="itens-aviso">O prestador envia três cotações em PDF. O fiscal escolhe uma ou pede novas; a publicação no Diário Oficial é feita fora do sistema.</p>
        </div>
      )}

      {destino === 'dispensa' && (
        <div className="avaliacao-encerrar avaliacao-encerrar--simples" role="group" aria-label="Encaminhar sem orçamento">
          <div className="field avaliacao-encerrar-motivo">
            <label htmlFor="aval-dispensa">Qual o risco à vida? *</label>
            <textarea id="aval-dispensa" rows={3} maxLength={1000} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <p className="itens-aviso">Exceção: o chamado vai ao prestador sem orçamento prévio, com esta justificativa registrada, e a publicação é feita depois.</p>
        </div>
      )}

      {destino === 'informacoes' && (
        <div className="avaliacao-encerrar avaliacao-encerrar--simples" role="group" aria-label="Pedir informações">
          <div className="field avaliacao-encerrar-motivo">
            <label htmlFor="aval-informacoes">O que falta saber? *</label>
            <input id="aval-informacoes" maxLength={500} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <p className="itens-aviso">O chamado volta à triagem, que fala com o solicitante pelo chat. A escolha do item de contrato será refeita.</p>
        </div>
      )}

      {exigeOrcamento && !destino && (
        <p className="itens-aviso" role="status">
          Este serviço exige orçamento prévio: solicite o orçamento ao prestador. Só em risco à vida o chamado segue sem ele.
        </p>
      )}

      <div className="avaliacao-acoes">
        {destino === 'orcamento' || destino === 'dispensa' ? (
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDestino(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado || motivo.trim().length < (destino === 'dispensa' ? 10 : 3)}
              onClick={() =>
                executar(async () => {
                  if (!semMudanca) await edicao.salvar();
                  await (destino === 'orcamento'
                    ? api.post(`/manutencoes/${m.id}/solicitar-orcamento`, { instrucoes: motivo.trim() })
                    : api.post(`/manutencoes/${m.id}/dispensar-orcamento`, { justificativa: motivo.trim() }));
                })
              }
            >
              {destino === 'orcamento' ? 'Solicitar orçamento' : 'Encaminhar sem orçamento'}
            </button>
          </>
        ) : destino === 'informacoes' ? (
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDestino(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado || motivo.trim().length < 3}
              onClick={() => executar(() => api.post(`/manutencoes/${m.id}/solicitar-informacoes`, { motivo: motivo.trim() }))}
            >
              Devolver à triagem
            </button>
          </>
        ) : destino === 'encerrar' ? (
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDestino(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado || !encerramentoValido}
              onClick={() =>
                executar(() =>
                  api.post(`/manutencoes/${m.id}/encerrar`, {
                    tipo: tipoEncerramento,
                    motivo: motivo.trim(),
                    ...(tipoEncerramento !== 'ENCERRADO' ? { chamadoOriginalNumero: Number(numeroOriginal) } : {}),
                  }),
                )
              }
            >
              Confirmar encerramento
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-outline avaliacao-acoes-esquerda" disabled={ocupado} onClick={() => { setMotivo(''); setDestino('encerrar'); }}>
              Encerrar chamado
            </button>
            <button type="button" className="btn btn-outline" disabled={ocupado} onClick={() => { setMotivo(''); setDestino('informacoes'); }}>
              Pedir informações
            </button>
            <button type="button" className="btn btn-outline" disabled={ocupado} onClick={() => executar(() => api.post(`/manutencoes/${m.id}/marcar-vistoria`, {}))}>
              Marcar vistoria
            </button>
            {civil && (
              <button type="button" className="btn btn-outline" disabled={ocupado || !edicao.itemEscolhido} onClick={() => { setMotivo(''); setDestino('orcamento'); }}>
                Solicitar orçamento
              </button>
            )}
            {exigeOrcamento && (
              <button type="button" className="btn btn-outline" disabled={ocupado || !edicao.itemEscolhido} onClick={() => { setMotivo(''); setDestino('dispensa'); }}>
                Encaminhar sem orçamento (risco à vida)
              </button>
            )}
            <button type="button" className="btn btn-outline" disabled={ocupado || semMudanca || !edicao.itemEscolhido} onClick={() => executar(edicao.salvar)}>
              Salvar e manter em análise
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={ocupado || !parecerOk || !edicao.itemEscolhido || exigeOrcamento}
              onClick={() =>
                executar(async () => {
                  if (!semMudanca) await edicao.salvar();
                  await api.post(`/manutencoes/${m.id}/devolver-avaliado`, { parecer: form.parecerTecnico.trim() });
                })
              }
            >
              Aprovar e devolver à triagem
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={ocupado || !parecerOk || !edicao.itemEscolhido || exigeOrcamento}
              onClick={() =>
                executar(async () => {
                  if (!semMudanca) await edicao.salvar();
                  await api.post(`/manutencoes/${m.id}/concluir-avaliacao`, { parecer: form.parecerTecnico.trim() });
                })
              }
            >
              Encaminhar ao prestador
            </button>
          </>
        )}
      </div>
    </section>
  );
}
