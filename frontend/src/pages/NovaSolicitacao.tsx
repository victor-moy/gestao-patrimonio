import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { semAlteracoes } from '../utils/form';
import type { Categoria, Equipamento, TipoSolicitacao as TipoSolicitacaoValor, Unidade } from '../types';
import { ROTULO_TIPO_SOLICITACAO } from '../utils/format';
import { CampoAnexo } from '../components/CampoAnexo';
import { IconeFechar } from '../components/icons';
import { SelectEquipamento, SelectTipoEquipamento } from '../components/SelectItem';
import { ItemAusente } from '../components/ItemAusente';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

const JUSTIFICATIVA_MAX = 500;

// Tipos de solicitação disponíveis, com a descrição mostrada sob o seletor.
const CATALOGO_TIPOS: Array<{
  tipo: TipoSolicitacaoValor;
  descricao: string;
}> = [
  { tipo: 'SUBSTITUICAO', descricao: 'Trocar um item com defeito por um novo' },
  { tipo: 'AMPLIACAO', descricao: 'Adquirir um item novo, sem remover outro' },
  { tipo: 'CESSAO_USO', descricao: 'Ceder um item a uma entidade externa' },
  { tipo: 'EMPRESTIMO', descricao: 'Movimentar um item entre unidades da SES' },
  { tipo: 'RECOLHA', descricao: 'Processo para recolha de itens na unidade' },
];

export function NovaSolicitacao() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Vindo do detalhe do equipamento (ou do QR), o item já chega escolhido nos tipos que usam um equipamento existente
  const [params] = useSearchParams();
  const equipamentoInicial = params.get('equipamento') ?? '';
  const [tipo, setTipo] = useState<TipoSolicitacaoValor | null>(null);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [anexo, setAnexo] = useState<File | null>(null);
  const [previewAnexo, setPreviewAnexo] = useState<string | null>(null);
  const [erro, setErro] = useMensagemTemporaria();
  useAlertaNativo(erro, () => setErro(null));
  const inicial = {
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
        equipamentoId: equipamentoInicial,
        tipoEquipamentoId: '',
        quantidade: 1,
        justificativa: '',
        anexo: null as File | null,
        anexoPreview: null as string | null,
      },
    ],
    // Recolha: lista repetível de equipamentos existentes a recolher — sem
    // escolher o galpão de destino, que agora é o Gestor quem define ao
    // aprovar (feedback do cliente 26/08).
    itensRecolha: [{ equipamentoId: equipamentoInicial }],
    // Empréstimo: mesmo padrão de lista repetível da Recolha — a unidade
    // escolhe um ou mais equipamentos próprios para emprestar de uma vez à
    // mesma unidade de destino.
    itensEmprestimo: [{ equipamentoId: equipamentoInicial }],
    // Cessão de Uso: mesmo padrão de lista repetível da Ampliação — o Gestor
    // escolhe um ou mais tipos de equipamento e a quantidade, reservando do
    // estoque de galpão (não escolhe um equipamento específico de uma
    // unidade).
    itensCessao: [{ tipoEquipamentoId: '', numeroPatrimonio: '' }],
    dataRetornoPrevista: '',
    justificativa: '',
    entidadeExternaNome: '',
  };
  const [form, setForm] = useState(inicial);

  useEffect(() => {
    const falhou = (e: unknown) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os dados do formulário.');
    api.get<Equipamento[]>('/equipamentos?status=ATIVO').then(setEquipamentos).catch(falhou);
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(falhou);
    api.get<Categoria[]>('/categorias').then(setCategorias).catch(falhou);
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

  type ChaveItens =
    | 'itensAmpliacao'
    | 'itensSubstituicao'
    | 'itensRecolha'
    | 'itensEmprestimo'
    | 'itensCessao';

  function editarItem(chave: ChaveItens, indice: number, parcial: Record<string, unknown>) {
    setForm((atual) => ({
      ...atual,
      [chave]: (atual[chave] as Array<Record<string, unknown>>).map((item, j) =>
        j === indice ? { ...item, ...parcial } : item,
      ),
    }) as typeof atual);
  }

  function removerItem(chave: ChaveItens, indice: number) {
    setForm((atual) => ({
      ...atual,
      [chave]: (atual[chave] as unknown[]).filter((_, j) => j !== indice),
    }) as typeof atual);
  }

  function adicionarItem(chave: ChaveItens, vazio: Record<string, unknown>) {
    setForm((atual) => ({ ...atual, [chave]: [...(atual[chave] as unknown[]), vazio] }) as typeof atual);
  }

  // Ids já escolhidos nas outras linhas — não aparecem de novo nas opções.
  function idsEmUso(chave: ChaveItens, campo: string, indice: number) {
    return (form[chave] as Array<Record<string, unknown>>)
      .filter((_, j) => j !== indice)
      .map((item) => String(item[campo] ?? ''))
      .filter(Boolean);
  }

  const botaoRemover = (chave: ChaveItens, indice: number) =>
    form[chave].length > 1 ? (
      <button
        type="button"
        className="itens-remover"
        aria-label={`Remover item ${indice + 1}`}
        title="Remover item"
        onClick={() => removerItem(chave, indice)}
      >
        <IconeFechar />
      </button>
    ) : (
      <span />
    );

  const botaoAdicionar = (chave: ChaveItens, vazio: Record<string, unknown>) => (
    <button type="button" className="btn btn-outline itens-adicionar" onClick={() => adicionarItem(chave, vazio)}>
      + Adicionar item
    </button>
  );

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
        ...(tipo === 'RECOLHA'
          ? {
              itens: form.itensRecolha.map((item) => ({
                equipamentoId: item.equipamentoId,
              })),
            }
          : {}),
        ...(tipo === 'EMPRESTIMO'
          ? {
              unidadeDestinoId: form.unidadeDestinoId,
              dataRetornoPrevista: form.dataRetornoPrevista,
              itens: form.itensEmprestimo.map((item) => ({
                equipamentoId: item.equipamentoId,
              })),
            }
          : {}),
        ...(tipo === 'CESSAO_USO'
          ? {
              entidadeExternaNome: form.entidadeExternaNome,
              // Reserva 1 unidade do estoque de galpão por item — a origem
              // vem do galpão que tinha saldo, não de uma unidade escolhida.
              itens: form.itensCessao.map((item) => ({
                tipoEquipamentoId: item.tipoEquipamentoId,
                numerosPatrimonio: [item.numeroPatrimonio],
              })),
            }
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
      navigate('/solicitacoes');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  const tiposDisponiveis = CATALOGO_TIPOS
    // Cessão de Uso envolve entidade externa à secretaria — só o Gestor
    // de Patrimônio pode abrir.
    .filter((item) => item.tipo !== 'CESSAO_USO' || usuario?.perfil === 'GESTOR_PATRIMONIO');

  const infoTipo = CATALOGO_TIPOS.find((item) => item.tipo === tipo);

  return (
    <section className="gestao-page equipamento-pagina nova-solicitacao" aria-labelledby="nova-solicitacao-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div className="equipamento-titulo-linha">
          <h2 id="nova-solicitacao-titulo">Nova solicitação</h2>
        </div>
        <div className="nova-solicitacao-acoes">
          <button type="button" className="btn btn-outline" onClick={voltar}>
            Cancelar
          </button>
          <button
            type="submit"
            form="form-nova-solicitacao"
            className="btn btn-primary"
            disabled={!tipo || semAlteracoes(inicial, form)}
          >
            Enviar solicitação
          </button>
        </div>
      </div>


      <form id="form-nova-solicitacao" onSubmit={aoEnviar}>
        <section className="equipamento-secao">
          <h3>Tipo de solicitação</h3>
          <div className="field nova-solicitacao-campo-tipo">
            <label htmlFor="nova-solicitacao-tipo">Tipo</label>
            <select
              id="nova-solicitacao-tipo"
              value={tipo ?? ''}
              onChange={(e) => setTipo((e.target.value || null) as TipoSolicitacaoValor | null)}
              required
            >
              <option value="">Selecione...</option>
              {tiposDisponiveis.map(({ tipo: valor }) => (
                <option key={valor} value={valor}>
                  {ROTULO_TIPO_SOLICITACAO[valor]}
                </option>
              ))}
            </select>
            {infoTipo && <p className="nova-solicitacao-descricao">{infoTipo.descricao}</p>}
          </div>
        </section>

        {tipo && (
          <>
          <div className={`form-colunas${tipo === 'SUBSTITUICAO' ? ' form-colunas-unica' : ''}`}>
          <div className="form-coluna">
          {tipo === 'SUBSTITUICAO' && (
            <div className="form-secao">
              <div className="form-secao-titulo">Itens a Substituir</div>
              <div className="itens-lista" style={{ '--colunas': 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr) 112px 34px' } as React.CSSProperties}>
                <div className="itens-cabecalho" aria-hidden>
                  <span>Item a substituir</span>
                  <span>Item para reposição</span>
                  <span>Justificativa</span>
                  <span>Anexo</span>
                  <span />
                </div>
                {form.itensSubstituicao.map((item, i) => (
                  <div key={i} className="itens-linha" role="group" aria-label={`Item ${i + 1}`}>
                    <div className="itens-celula" data-rotulo="Item a substituir">
                      <SelectEquipamento
                        label="Item a substituir"
                        equipamentos={equipamentos}
                        value={item.equipamentoId}
                        idsExcluidos={idsEmUso('itensSubstituicao', 'equipamentoId', i)}
                        onChange={(id) => editarItem('itensSubstituicao', i, { equipamentoId: id })}
                        required
                      />
                    </div>
                    <div className="itens-celula" data-rotulo="Item para reposição">
                      <SelectTipoEquipamento
                        label="Item para reposição"
                        categorias={categorias}
                        value={item.tipoEquipamentoId}
                        onChange={(id) => editarItem('itensSubstituicao', i, { tipoEquipamentoId: id })}
                        required
                      />
                    </div>
                    <div className="itens-celula" data-rotulo="Justificativa">
                      <input
                        aria-label="Justificativa"
                        maxLength={JUSTIFICATIVA_MAX}
                        placeholder="Motivo da substituição"
                        value={item.justificativa}
                        onChange={(e) => editarItem('itensSubstituicao', i, { justificativa: e.target.value })}
                        required
                      />
                    </div>
                    <div className="itens-celula" data-rotulo="Anexo">
                      <CampoAnexo
                        compacto
                        arquivo={item.anexo}
                        preview={item.anexoPreview}
                        onSelecionar={(arquivo) =>
                          editarItem('itensSubstituicao', i, {
                            anexo: arquivo,
                            anexoPreview:
                              arquivo.type === 'application/pdf' ? null : URL.createObjectURL(arquivo),
                          })
                        }
                        onRemover={() => editarItem('itensSubstituicao', i, { anexo: null, anexoPreview: null })}
                      />
                    </div>
                    <div className="itens-celula itens-celula-remover">{botaoRemover('itensSubstituicao', i)}</div>
                  </div>
                ))}
              </div>
              {botaoAdicionar('itensSubstituicao', {
                equipamentoId: '',
                tipoEquipamentoId: '',
                quantidade: 1,
                justificativa: '',
                anexo: null,
                anexoPreview: null,
              })}
            </div>
          )}

          {tipo === 'AMPLIACAO' && (
            <div className="form-secao">
              <div className="form-secao-titulo">Itens Solicitados</div>
              <div className="itens-lista" style={{ '--colunas': 'minmax(0,1fr) 96px 34px' } as React.CSSProperties}>
                <div className="itens-cabecalho" aria-hidden>
                  <span>Tipo de item</span>
                  <span>Quantidade</span>
                  <span />
                </div>
                {form.itensAmpliacao.map((item, i) => (
                  <div key={i} className="itens-linha" role="group" aria-label={`Item ${i + 1}`}>
                    <div className="itens-celula" data-rotulo="Tipo de item">
                      <SelectTipoEquipamento
                        label="Tipo de Item"
                        categorias={categorias}
                        value={item.tipoEquipamentoId}
                        idsExcluidos={idsEmUso('itensAmpliacao', 'tipoEquipamentoId', i)}
                        onChange={(id) => editarItem('itensAmpliacao', i, { tipoEquipamentoId: id })}
                        required
                      />
                    </div>
                    <div className="itens-celula" data-rotulo="Quantidade">
                      <input
                        type="number"
                        min="1"
                        aria-label="Quantidade"
                        value={item.quantidade}
                        onChange={(e) => editarItem('itensAmpliacao', i, { quantidade: Number(e.target.value) })}
                        required
                      />
                    </div>
                    <div className="itens-celula itens-celula-remover">{botaoRemover('itensAmpliacao', i)}</div>
                  </div>
                ))}
              </div>
              {botaoAdicionar('itensAmpliacao', { tipoEquipamentoId: '', quantidade: 1 })}
            </div>
          )}

          {tipo === 'RECOLHA' && (
            <div className="form-secao">
              <div className="form-secao-titulo">Itens a Recolher</div>
              <div className="itens-lista" style={{ '--colunas': 'minmax(0,1fr) 34px' } as React.CSSProperties}>
                <div className="itens-cabecalho" aria-hidden>
                  <span>Item</span>
                  <span />
                </div>
                {form.itensRecolha.map((item, i) => (
                  <div key={i} className="itens-linha" role="group" aria-label={`Item ${i + 1}`}>
                    <div className="itens-celula" data-rotulo="Item">
                      <SelectEquipamento
                        label="Item"
                        equipamentos={equipamentos}
                        value={item.equipamentoId}
                        idsExcluidos={idsEmUso('itensRecolha', 'equipamentoId', i)}
                        onChange={(id) => editarItem('itensRecolha', i, { equipamentoId: id })}
                        required
                      />
                    </div>
                    <div className="itens-celula itens-celula-remover">{botaoRemover('itensRecolha', i)}</div>
                  </div>
                ))}
              </div>
              {botaoAdicionar('itensRecolha', { equipamentoId: '' })}
            </div>
          )}

          {tipo === 'EMPRESTIMO' && (
            <div className="form-secao">
              <div className="form-secao-titulo">Itens a Emprestar</div>
              <div className="info-grid itens-alinhado">
                <div className="field">
                  <label htmlFor="emprestimo-unidade">Unidade de destino *</label>
                  <select
                    id="emprestimo-unidade"
                    value={form.unidadeDestinoId}
                    onChange={(e) => setForm({ ...form, unidadeDestinoId: e.target.value })}
                    required
                  >
                    <option value="">Selecione...</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="emprestimo-data">Data final do empréstimo *</label>
                  <input
                    id="emprestimo-data"
                    type="date"
                    value={form.dataRetornoPrevista}
                    onChange={(e) => setForm({ ...form, dataRetornoPrevista: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="itens-lista" style={{ '--colunas': 'minmax(0,1fr) 34px' } as React.CSSProperties}>
                <div className="itens-cabecalho" aria-hidden>
                  <span>Item</span>
                  <span />
                </div>
                {form.itensEmprestimo.map((item, i) => (
                  <div key={i} className="itens-linha" role="group" aria-label={`Item ${i + 1}`}>
                    <div className="itens-celula" data-rotulo="Item">
                      <SelectEquipamento
                        label="Item"
                        equipamentos={equipamentos}
                        value={item.equipamentoId}
                        idsExcluidos={idsEmUso('itensEmprestimo', 'equipamentoId', i)}
                        onChange={(id) => editarItem('itensEmprestimo', i, { equipamentoId: id })}
                        required
                      />
                    </div>
                    <div className="itens-celula itens-celula-remover">{botaoRemover('itensEmprestimo', i)}</div>
                  </div>
                ))}
              </div>
              {botaoAdicionar('itensEmprestimo', { equipamentoId: '' })}
            </div>
          )}

          {tipo === 'CESSAO_USO' && (
            <div className="form-secao">
              <div className="form-secao-titulo">Itens a Ceder</div>
              <div className="field itens-alinhado">
                <label htmlFor="cessao-entidade">Entidade externa *</label>
                <input
                  id="cessao-entidade"
                  placeholder="Ex: Hospital Regional (outro município)"
                  value={form.entidadeExternaNome}
                  onChange={(e) => setForm({ ...form, entidadeExternaNome: e.target.value })}
                  required
                />
              </div>
              <div className="itens-lista" style={{ '--colunas': 'minmax(0,1fr) minmax(0,1fr) 34px' } as React.CSSProperties}>
                <div className="itens-cabecalho" aria-hidden>
                  <span>Item</span>
                  <span>Nº de patrimônio</span>
                  <span />
                </div>
                {form.itensCessao.map((item, i) => (
                  <div key={i} className="itens-linha" role="group" aria-label={`Item ${i + 1}`}>
                    <div className="itens-celula" data-rotulo="Item">
                      <SelectTipoEquipamento
                        label="Item"
                        categorias={categorias}
                        value={item.tipoEquipamentoId}
                        idsExcluidos={idsEmUso('itensCessao', 'tipoEquipamentoId', i)}
                        onChange={(id) => editarItem('itensCessao', i, { tipoEquipamentoId: id })}
                        required
                      />
                    </div>
                    <div className="itens-celula" data-rotulo="Nº de patrimônio">
                      <input
                        aria-label="Nº de patrimônio"
                        value={item.numeroPatrimonio}
                        onChange={(e) => editarItem('itensCessao', i, { numeroPatrimonio: e.target.value })}
                        required
                      />
                    </div>
                    <div className="itens-celula itens-celula-remover">{botaoRemover('itensCessao', i)}</div>
                  </div>
                ))}
              </div>
              {botaoAdicionar('itensCessao', { tipoEquipamentoId: '', numeroPatrimonio: '' })}
            </div>
          )}
          </div>

          {tipo !== 'SUBSTITUICAO' && (
          <div className="form-coluna">
          <div className="form-secao">
            <div className="form-secao-titulo">
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
              <CampoAnexo
                arquivo={anexo}
                preview={previewAnexo}
                onSelecionar={(arquivo) => {
                  setAnexo(arquivo);
                  setPreviewAnexo(arquivo.type === 'application/pdf' ? null : URL.createObjectURL(arquivo));
                }}
                onRemover={() => {
                  setAnexo(null);
                  setPreviewAnexo(null);
                }}
              />
            </div>
          </div>
          </div>
          )}
          </div>
          {(tipo === 'SUBSTITUICAO' || tipo === 'RECOLHA' || tipo === 'EMPRESTIMO') && <ItemAusente />}
          </>
        )}
        </form>
    </section>
  );
}
