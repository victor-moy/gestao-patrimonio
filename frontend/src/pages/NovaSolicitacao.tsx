import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { semAlteracoes } from '../utils/form';
import {
  IconeAmpliacao,
  IconeBusca,
  IconeCaixa,
  IconeCessaoExterna,
  IconeDetalhes,
  IconeEmprestimo,
  IconeEnviar,
  IconeInventario,
  IconeRecolha,
  IconeSubstituicao,
} from '../components/icons';
import type { Categoria, Equipamento, TipoSolicitacao as TipoSolicitacaoValor, Unidade } from '../types';
import { ROTULO_TIPO_SOLICITACAO } from '../utils/format';
import { SeletorTipoEquipamento } from '../components/SeletorTipoEquipamento';
import { SeletorEquipamento } from '../components/SeletorEquipamento';

const JUSTIFICATIVA_MAX = 500;

// Catálogo de tipos — estilo "central de serviços" (referência: central de
// serviços da Prefeitura de Joinville, feedback do cliente).
const CATALOGO_TIPOS: Array<{
  tipo: TipoSolicitacaoValor;
  Icone: () => JSX.Element;
  descricao: string;
}> = [
  { tipo: 'SUBSTITUICAO', Icone: IconeSubstituicao, descricao: 'Trocar um equipamento com defeito por um novo' },
  { tipo: 'AMPLIACAO', Icone: IconeAmpliacao, descricao: 'Adquirir um item novo, sem remover outro' },
  { tipo: 'CESSAO_USO', Icone: IconeCessaoExterna, descricao: 'Ceder um equipamento a uma entidade externa' },
  { tipo: 'EMPRESTIMO', Icone: IconeEmprestimo, descricao: 'Movimentar um equipamento entre unidades da SES' },
  { tipo: 'RECOLHA', Icone: IconeRecolha, descricao: 'Enviar um equipamento para o galpão' },
];

// Ilustração decorativa (prancheta + cruz) no canto do cabeçalho — puramente estética
function IlustracaoFormulario() {
  return (
    <svg className="pagina-ilustracao" viewBox="0 0 200 150" fill="none" aria-hidden>
      <circle cx="150" cy="45" r="58" fill="#dbeafe" />
      <circle cx="35" cy="110" r="30" fill="#eff6ff" />
      <rect x="92" y="22" width="72" height="96" rx="12" fill="#fff" stroke="#93c5fd" strokeWidth="3" />
      <rect x="114" y="14" width="28" height="16" rx="4" fill="#93c5fd" />
      <path d="M106 58h48M106 76h48M106 94h32" stroke="#bfdbfe" strokeWidth="5" strokeLinecap="round" />
      <circle cx="150" cy="46" r="14" fill="#2563eb" />
      <path d="M150 39v14M143 46h14" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function NovaSolicitacao() {
  const navigate = useNavigate();
  const location = useLocation();
  const [tipo, setTipo] = useState<TipoSolicitacaoValor | null>(null);
  const [buscaTipo, setBuscaTipo] = useState('');
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [semRetorno, setSemRetorno] = useState(false);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [previewAnexo, setPreviewAnexo] = useState<string | null>(null);
  const inputAnexo = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useMensagemTemporaria();
  const inicial = {
    equipamentoId: '',
    unidadeDestinoId: '',
    tipoEquipamentoId: '',
    quantidade: 1,
    // Ampliação: seleção de múltiplos itens numa única tela — vira uma
    // solicitação por item internamente (feedback do cliente 17/08)
    itensAmpliacao: [{ tipoEquipamentoId: '', quantidade: 1 }],
    // Substituição: mesmo padrão de lista repetível da Ampliação, mas cada
    // linha também escolhe o equipamento existente a ser substituído
    // (feedback do cliente 25/08 — formulário ficou inconsistente com o de
    // Ampliação e não permitia substituir vários equipamentos de uma vez).
    // Justificativa e anexo são por item — cada equipamento pode ter um
    // defeito/motivo diferente (feedback do cliente 25/08).
    itensSubstituicao: [
      {
        equipamentoId: '',
        tipoEquipamentoId: '',
        quantidade: 1,
        justificativa: '',
        anexo: null as File | null,
        anexoPreview: null as string | null,
      },
    ],
    justificativa: '',
    entidadeExternaNome: '',
    dataRetornoPrevista: '',
  };
  const [form, setForm] = useState(inicial);

  useEffect(() => {
    api.get<Equipamento[]>('/equipamentos?status=ATIVO').then(setEquipamentos).catch(() => {});
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
    api.get<Categoria[]>('/categorias').then(setCategorias).catch(() => {});
  }, []);

  // Sempre volta pra página em que o usuário estava antes; se a tela foi
  // aberta direto (sem histórico de navegação no app), cai na lista.
  function voltar() {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/solicitacoes');
    }
  }

  const galpoes = unidades.filter((u) => u.tipo === 'GALPAO');
  // Ampliação e Substituição usam listas repetíveis próprias (itens/
  // itensSubstituicao) — só os demais tipos usam o campo único de equipamento
  const precisaEquipamento = tipo !== 'AMPLIACAO' && tipo !== 'SUBSTITUICAO';

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!tipo) return;
    setErro(null);
    try {
      const { ids } = await api.post<{ ids: string[] }>('/solicitacoes', {
        tipo,
        // Substituição carrega justificativa por item, não aqui (feedback do
        // cliente 25/08) — os demais tipos continuam com uma só, global.
        ...(tipo !== 'SUBSTITUICAO' ? { justificativa: form.justificativa } : {}),
        ...(precisaEquipamento ? { equipamentoId: form.equipamentoId } : {}),
        ...(tipo === 'AMPLIACAO'
          ? {
              itens: form.itensAmpliacao.map((item) => ({
                tipoEquipamentoId: item.tipoEquipamentoId,
                quantidade: Number(item.quantidade),
              })),
            }
          : {}),
        ...(tipo === 'SUBSTITUICAO'
          ? {
              itens: form.itensSubstituicao.map((item) => ({
                equipamentoId: item.equipamentoId,
                tipoEquipamentoId: item.tipoEquipamentoId,
                quantidade: Number(item.quantidade),
                justificativa: item.justificativa,
              })),
            }
          : {}),
        ...(tipo === 'CESSAO_USO' ? { entidadeExternaNome: form.entidadeExternaNome } : {}),
        ...(tipo === 'EMPRESTIMO' || tipo === 'RECOLHA'
          ? { unidadeDestinoId: form.unidadeDestinoId }
          : {}),
        ...(tipo === 'EMPRESTIMO' && !semRetorno
          ? { dataRetornoPrevista: form.dataRetornoPrevista }
          : {}),
      });
      if (tipo === 'SUBSTITUICAO') {
        // Anexo por item — cada id criado corresponde, na mesma ordem, ao
        // item da lista que o gerou (ver solicitacoes.service.ts)
        await Promise.all(
          form.itensSubstituicao.map((item, i) => {
            if (!item.anexo) return null;
            const dados = new FormData();
            dados.append('anexo', item.anexo);
            return api.post(`/solicitacoes/${ids[i]}/anexo`, dados);
          }),
        );
      } else if (anexo) {
        await Promise.all(
          ids.map((id) => {
            const dados = new FormData();
            dados.append('anexo', anexo);
            return api.post(`/solicitacoes/${id}/anexo`, dados);
          }),
        );
      }
      navigate('/solicitacoes', {
        state: {
          mensagem:
            ids.length > 1 ? `${ids.length} solicitações registradas.` : 'Solicitação registrada.',
        },
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  if (!tipo) {
    const catalogoFiltrado = CATALOGO_TIPOS.filter((item) =>
      ROTULO_TIPO_SOLICITACAO[item.tipo].toLowerCase().includes(buscaTipo.toLowerCase()),
    );
    return (
      <>
        <button type="button" className="catalogo-voltar pagina-voltar" onClick={voltar}>
          ← Voltar
        </button>
        <div className="page-header pagina-cabecalho-decorada">
          <div>
            <h2>Nova Solicitação</h2>
            <p className="subtitle">Selecione o tipo de solicitação</p>
          </div>
          <IlustracaoFormulario />
        </div>
        <div className="card card-pad">
          <div className="catalogo-busca">
            <IconeBusca />
            <input
              placeholder="Buscar tipo de solicitação..."
              value={buscaTipo}
              onChange={(e) => setBuscaTipo(e.target.value)}
              autoFocus
            />
          </div>
          <div className="catalogo-grid">
            {catalogoFiltrado.map(({ tipo: valor, Icone, descricao }) => (
              <button type="button" key={valor} className="catalogo-card" onClick={() => setTipo(valor)}>
                <div className="catalogo-card-icone">
                  <Icone />
                </div>
                <div className="catalogo-card-titulo">{ROTULO_TIPO_SOLICITACAO[valor]}</div>
                <div className="catalogo-card-desc">{descricao}</div>
              </button>
            ))}
            {catalogoFiltrado.length === 0 && (
              <div className="catalogo-vazio">Nenhum tipo encontrado para "{buscaTipo}".</div>
            )}
          </div>
        </div>
      </>
    );
  }

  const infoTipo = CATALOGO_TIPOS.find((item) => item.tipo === tipo)!;

  return (
    <>
      <button type="button" className="catalogo-voltar pagina-voltar" onClick={voltar}>
        ← Voltar
      </button>
      <div className="page-header pagina-cabecalho-decorada">
        <div>
          <h2>Nova Solicitação</h2>
          <p className="subtitle">Preencha os campos abaixo para registrar sua solicitação.</p>
        </div>
        <IlustracaoFormulario />
      </div>
      <div className="card card-pad">
        <form onSubmit={aoEnviar} className="form-minimalista">
          {erro && <div className="error-banner toast-erro">{erro}</div>}

          <div className="tipo-resumo">
            <div className="tipo-resumo-icone">
              <infoTipo.Icone />
            </div>
            <div className="tipo-resumo-texto">
              <div className="tipo-resumo-titulo">{ROTULO_TIPO_SOLICITACAO[tipo]}</div>
              <div className="tipo-resumo-desc">{infoTipo.descricao}</div>
            </div>
            <button type="button" className="catalogo-voltar catalogo-voltar--com-icone" onClick={() => setTipo(null)}>
              <IconeSubstituicao /> Trocar tipo
            </button>
          </div>

          <div className={`form-colunas${tipo === 'SUBSTITUICAO' ? ' form-colunas-unica' : ''}`}>
          <div className="form-coluna">
          {precisaEquipamento && (
            <div className="form-secao">
              <div className="form-secao-titulo">
                <div className="form-secao-titulo-icone">
                  <IconeInventario />
                </div>
                Equipamento
              </div>
              <div className="info-grid">
                <div className="field">
                  <label>Equipamento (do seu inventário) *</label>
                  <select
                    value={form.equipamentoId}
                    onChange={(e) => setForm({ ...form, equipamentoId: e.target.value })}
                    required
                  >
                    <option value="">Selecione um equipamento</option>
                    {equipamentos.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.tombamento} — {eq.tipoEquipamento.nome}
                      </option>
                    ))}
                  </select>
                </div>
                {tipo === 'CESSAO_USO' && (
                  <div className="field">
                    <label>Entidade Externa (nome) *</label>
                    <input
                      placeholder="Ex: Hospital Regional (outro município)"
                      value={form.entidadeExternaNome}
                      onChange={(e) => setForm({ ...form, entidadeExternaNome: e.target.value })}
                      required
                    />
                  </div>
                )}
                {tipo === 'EMPRESTIMO' && (
                  <div className="field">
                    <label>Unidade de Destino *</label>
                    <select
                      value={form.unidadeDestinoId}
                      onChange={(e) => setForm({ ...form, unidadeDestinoId: e.target.value })}
                      required
                    >
                      <option value="">Selecione a unidade</option>
                      {unidades.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {tipo === 'RECOLHA' && (
                  <div className="field">
                    <label>Galpão de Destino *</label>
                    <select
                      value={form.unidadeDestinoId}
                      onChange={(e) => setForm({ ...form, unidadeDestinoId: e.target.value })}
                      required
                    >
                      <option value="">Selecione o galpão</option>
                      {galpoes.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {tipo === 'EMPRESTIMO' && (
                <>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={semRetorno}
                      onChange={(e) => setSemRetorno(e.target.checked)}
                    />
                    <div>
                      <div className="toggle-row-titulo">Transferência permanente</div>
                      <div className="toggle-row-desc">Sem data de retorno — o equipamento passa a pertencer à unidade de destino</div>
                    </div>
                  </label>
                  {!semRetorno && (
                    <div className="field" style={{ maxWidth: 240 }}>
                      <label>Data Prevista de Retorno *</label>
                      <input
                        type="date"
                        value={form.dataRetornoPrevista}
                        onChange={(e) => setForm({ ...form, dataRetornoPrevista: e.target.value })}
                        required
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tipo === 'SUBSTITUICAO' && (
            <div className="form-secao">
              <div className="form-secao-titulo">
                <div className="form-secao-titulo-icone">
                  <IconeCaixa />
                </div>
                Equipamentos a Substituir
              </div>
              {form.itensSubstituicao.map((item, i) => (
                <div key={i} className="item-ampliacao">
                  <div className="item-ampliacao-cabecalho">
                    <span className="item-ampliacao-numero">Item {i + 1}</span>
                    {form.itensSubstituicao.length > 1 && (
                      <button
                        type="button"
                        className="item-ampliacao-remover"
                        onClick={() =>
                          setForm({
                            ...form,
                            itensSubstituicao: form.itensSubstituicao.filter((_, j) => j !== i),
                          })
                        }
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  <div className="field">
                    <label>Equipamento a Substituir *</label>
                    <SeletorEquipamento
                      equipamentos={equipamentos}
                      value={item.equipamentoId}
                      idsExcluidos={form.itensSubstituicao
                        .filter((_, j) => j !== i)
                        .map((it) => it.equipamentoId)
                        .filter(Boolean)}
                      onChange={(id) => {
                        const itens = [...form.itensSubstituicao];
                        itens[i] = { ...item, equipamentoId: id };
                        setForm({ ...form, itensSubstituicao: itens });
                      }}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Tipo do Item de Reposição *</label>
                    <SeletorTipoEquipamento
                      categorias={categorias}
                      value={item.tipoEquipamentoId}
                      onChange={(id) => {
                        const itens = [...form.itensSubstituicao];
                        itens[i] = { ...item, tipoEquipamentoId: id };
                        setForm({ ...form, itensSubstituicao: itens });
                      }}
                      required
                    />
                  </div>
                  <div className="field item-ampliacao-quantidade">
                    <label>Quantidade *</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantidade}
                      onChange={(e) => {
                        const itens = [...form.itensSubstituicao];
                        itens[i] = { ...item, quantidade: Number(e.target.value) };
                        setForm({ ...form, itensSubstituicao: itens });
                      }}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Justificativa *</label>
                    <textarea
                      rows={2}
                      maxLength={JUSTIFICATIVA_MAX}
                      placeholder="Explique o motivo da substituição deste equipamento..."
                      value={item.justificativa}
                      onChange={(e) => {
                        const itens = [...form.itensSubstituicao];
                        itens[i] = { ...item, justificativa: e.target.value };
                        setForm({ ...form, itensSubstituicao: itens });
                      }}
                      required
                    />
                    <div className="campo-contador">
                      {item.justificativa.length}/{JUSTIFICATIVA_MAX} caracteres
                    </div>
                  </div>
                  <div className="field">
                    <label>Anexo</label>
                    <input
                      type="file"
                      id={`anexo-substituicao-${i}`}
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const arquivo = e.target.files?.[0];
                        if (arquivo) {
                          const itens = [...form.itensSubstituicao];
                          itens[i] = {
                            ...item,
                            anexo: arquivo,
                            anexoPreview:
                              arquivo.type === 'application/pdf' ? null : URL.createObjectURL(arquivo),
                          };
                          setForm({ ...form, itensSubstituicao: itens });
                        }
                        e.target.value = '';
                      }}
                    />
                    {item.anexo ? (
                      <div className="foto-preview-grande">
                        {item.anexoPreview ? (
                          <img src={item.anexoPreview} alt="" />
                        ) : (
                          <div className="foto-dropzone-texto" style={{ padding: '20px 0' }}>
                            <div className="foto-dropzone-titulo">📄 {item.anexo.name}</div>
                          </div>
                        )}
                        <button
                          type="button"
                          className="foto-preview-remover"
                          aria-label="Remover anexo"
                          onClick={() => {
                            const itens = [...form.itensSubstituicao];
                            itens[i] = { ...item, anexo: null, anexoPreview: null };
                            setForm({ ...form, itensSubstituicao: itens });
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <label htmlFor={`anexo-substituicao-${i}`} className="foto-dropzone">
                        <IconeCaixa />
                        <div className="foto-dropzone-texto">
                          <div className="foto-dropzone-titulo">Selecionar anexo</div>
                          <div className="foto-dropzone-sub">PDF, PNG, JPG ou WebP até 5MB</div>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ marginTop: 12 }}
                onClick={() =>
                  setForm({
                    ...form,
                    itensSubstituicao: [
                      ...form.itensSubstituicao,
                      {
                        equipamentoId: '',
                        tipoEquipamentoId: '',
                        quantidade: 1,
                        justificativa: '',
                        anexo: null,
                        anexoPreview: null,
                      },
                    ],
                  })
                }
              >
                + Adicionar item
              </button>
            </div>
          )}

          {tipo === 'AMPLIACAO' && (
            <div className="form-secao">
              <div className="form-secao-titulo">
                <div className="form-secao-titulo-icone">
                  <IconeCaixa />
                </div>
                Itens Solicitados
              </div>
              {form.itensAmpliacao.map((item, i) => (
                <div key={i} className="item-ampliacao">
                  <div className="item-ampliacao-cabecalho">
                    <span className="item-ampliacao-numero">Item {i + 1}</span>
                    {form.itensAmpliacao.length > 1 && (
                      <button
                        type="button"
                        className="item-ampliacao-remover"
                        onClick={() =>
                          setForm({
                            ...form,
                            itensAmpliacao: form.itensAmpliacao.filter((_, j) => j !== i),
                          })
                        }
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  <div className="field">
                    <label>Tipo de Equipamento *</label>
                    <SeletorTipoEquipamento
                      categorias={categorias}
                      value={item.tipoEquipamentoId}
                      idsExcluidos={form.itensAmpliacao
                        .filter((_, j) => j !== i)
                        .map((it) => it.tipoEquipamentoId)
                        .filter(Boolean)}
                      onChange={(id) => {
                        const itens = [...form.itensAmpliacao];
                        itens[i] = { ...item, tipoEquipamentoId: id };
                        setForm({ ...form, itensAmpliacao: itens });
                      }}
                      required
                    />
                  </div>
                  <div className="field item-ampliacao-quantidade">
                    <label>Quantidade *</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantidade}
                      onChange={(e) => {
                        const itens = [...form.itensAmpliacao];
                        itens[i] = { ...item, quantidade: Number(e.target.value) };
                        setForm({ ...form, itensAmpliacao: itens });
                      }}
                      required
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ marginTop: 12 }}
                onClick={() =>
                  setForm({
                    ...form,
                    itensAmpliacao: [...form.itensAmpliacao, { tipoEquipamentoId: '', quantidade: 1 }],
                  })
                }
              >
                + Adicionar item
              </button>
            </div>
          )}
          </div>

          {tipo !== 'SUBSTITUICAO' && (
          <div className="form-coluna">
          <div className="form-secao">
            <div className="form-secao-titulo">
              <div className="form-secao-titulo-icone">
                <IconeDetalhes />
              </div>
              Detalhes
            </div>
            <div className="field">
              <label>Justificativa *</label>
              <textarea
                rows={3}
                maxLength={JUSTIFICATIVA_MAX}
                placeholder="Explique o motivo da solicitação..."
                value={form.justificativa}
                onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
                required
              />
              <div className="campo-contador">
                {form.justificativa.length}/{JUSTIFICATIVA_MAX} caracteres
              </div>
            </div>
            <div className="field">
              <label>Anexo</label>
              <input
                ref={inputAnexo}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) {
                    setAnexo(arquivo);
                    setPreviewAnexo(arquivo.type === 'application/pdf' ? null : URL.createObjectURL(arquivo));
                  }
                  e.target.value = '';
                }}
              />
              {anexo ? (
                <div className="foto-preview-grande">
                  {previewAnexo ? (
                    <img src={previewAnexo} alt="" />
                  ) : (
                    <div className="foto-dropzone-texto" style={{ padding: '20px 0' }}>
                      <div className="foto-dropzone-titulo">📄 {anexo.name}</div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="foto-preview-remover"
                    aria-label="Remover anexo"
                    onClick={() => {
                      setAnexo(null);
                      setPreviewAnexo(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button type="button" className="foto-dropzone" onClick={() => inputAnexo.current?.click()}>
                  <IconeCaixa />
                  <div className="foto-dropzone-texto">
                    <div className="foto-dropzone-titulo">Selecionar anexo</div>
                    <div className="foto-dropzone-sub">PDF, PNG, JPG ou WebP até 5MB</div>
                  </div>
                </button>
              )}
            </div>
          </div>
          </div>
          )}
          </div>

          <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-outline" onClick={voltar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={semAlteracoes(inicial, form)}>
              <IconeEnviar /> Enviar Solicitação
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
