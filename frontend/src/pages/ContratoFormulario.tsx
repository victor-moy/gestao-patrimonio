import { CSSProperties, FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import type { Contrato, EscopoServico, PrestadorServico, ServicoContrato } from '../types';
import { ROTULO_STATUS_CONTRATO } from '../utils/cadastros';
import { formatarMoeda } from '../utils/format';
import { semAlteracoes } from '../utils/form';
import { useAlertaNativo } from '../hooks/useAlertaNativo';
import { IconeFechar } from '../components/icons';

interface ItemForm {
  servicoId: string;
  valor: string;
  descontoPercentual: string;
  escopoId: string;
  // Só para itens já gravados: valor menos o já comprometido pelas manutenções
  saldo?: number;
}

const ITEM_VAZIO: ItemForm = { servicoId: '', valor: '', descontoPercentual: '0', escopoId: '' };

const VAZIO = {
  numero: '',
  prestadorId: '',
  objeto: '',
  vigenciaInicio: '',
  vigenciaFim: '',
  status: 'ATIVO',
  itens: [{ ...ITEM_VAZIO }] as ItemForm[],
};

// Soma em centavos, igual ao servidor, para o total mostrado ser o que será gravado.
function somarValores(itens: ItemForm[]) {
  return itens.reduce((total, i) => total + Math.round((Number(i.valor) || 0) * 100), 0) / 100;
}

// Cadastro e edição de contrato em página própria (mesmo padrão dos demais cadastros).
export function ContratoFormulario() {
  const { id } = useParams();
  const editando = Boolean(id);
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // A terceirizada vê o contrato do próprio prestador exatamente como o gestor, com tudo bloqueado
  const somenteLeitura = usuario?.perfil === 'TERCEIRIZADA';
  const permitido =
    usuario?.perfil === 'OPERADOR' || somenteLeitura;
  const podeExcluir = usuario?.perfil === 'OPERADOR';
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [carregando, setCarregando] = useState(editando);
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  useAlertaNativo(erro, () => setErro(null));
  const [inicial, setInicial] = useState(VAZIO);
  const [form, setForm] = useState(VAZIO);
  const [prestadores, setPrestadores] = useState<PrestadorServico[]>([]);
  const [servicos, setServicos] = useState<ServicoContrato[]>([]);
  const [catalogosFalha, setCatalogosFalha] = useState(false);
  const [escopos, setEscopos] = useState<EscopoServico[]>([]);

  useEffect(() => {
    // Os cadastros de prestadores, serviços e escopos são dos gestores; em leitura as opções vêm do próprio contrato
    if (!permitido || somenteLeitura) return;
    let ativo = true;
    Promise.all([
      api.get<PrestadorServico[]>('/prestadores'),
      api.get<ServicoContrato[]>('/servicos-contrato'),
      api.get<EscopoServico[]>('/escopos-servico'),
    ])
      .then(([listaPrestadores, listaServicos, listaEscopos]) => {
        if (!ativo) return;
        setPrestadores(listaPrestadores);
        setServicos(listaServicos);
        setEscopos(listaEscopos);
      })
      .catch(() => {
        if (ativo) setCatalogosFalha(true);
      });
    return () => {
      ativo = false;
    };
  }, [permitido, somenteLeitura]);

  useEffect(() => {
    if (!permitido || !editando) return;
    let ativo = true;
    api
      .get<Contrato[]>('/contratos')
      .then((lista) => {
        if (!ativo) return;
        const c = lista.find((item) => item.id === id);
        if (!c) {
          setFalha('Contrato não encontrado.');
          return;
        }
        const valores = {
          numero: c.numero,
          prestadorId: c.prestadorId,
          objeto: c.objeto,
          vigenciaInicio: c.vigenciaInicio.slice(0, 10),
          vigenciaFim: c.vigenciaFim.slice(0, 10),
          status: c.status,
          // Contrato antigo, sem itens, abre sem linhas até que o gestor os informe
          itens: c.itens.map((i) => ({
            servicoId: i.servicoId,
            valor: String(i.valor),
            descontoPercentual: String(Number(i.descontoPercentual ?? 0)),
            escopoId: i.escopoId,
            saldo: i.saldo,
          })),
        };
        setContrato(c);
        setInicial(valores);
        setForm(valores);
      })
      .catch(() => {
        if (ativo) setFalha('Não foi possível carregar o contrato. Recarregue a página para tentar novamente.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [permitido, editando, id]);

  if (!permitido) return <Navigate to="/" replace />;
  if (somenteLeitura && !editando) return <Navigate to="/contratos" replace />;

  // Em leitura, as opções dos selects são só o que o contrato já usa
  const opcoesPrestadores = somenteLeitura && contrato ? [contrato.prestador as PrestadorServico] : prestadores;
  const opcoesServicos = somenteLeitura && contrato ? contrato.itens.map((i) => i.servico as ServicoContrato) : servicos;
  const opcoesEscopos = somenteLeitura && contrato ? contrato.itens.map((i) => i.escopo as EscopoServico) : escopos;

  const total = form.itens.length > 0 ? somarValores(form.itens) : Number(contrato?.valorTotal ?? 0);
  const contratoAntigoSemItens = editando && contrato !== null && contrato.itens.length === 0;

  function editarItem(indice: number, parcial: Partial<ItemForm>) {
    setForm((atual) => ({
      ...atual,
      itens: atual.itens.map((item, j) => (j === indice ? { ...item, ...parcial } : item)),
    }));
  }

  function adicionarItem() {
    setForm((atual) => ({ ...atual, itens: [...atual.itens, { ...ITEM_VAZIO }] }));
  }

  function removerItem(indice: number) {
    setForm((atual) => ({ ...atual, itens: atual.itens.filter((_, j) => j !== indice) }));
  }

  function voltar() {
    if (location.key !== 'default') void navigate(-1);
    else void navigate('/contratos');
  }

  function concluir() {
    void navigate('/contratos', { replace: true });
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    const payload = {
      numero: form.numero,
      prestadorId: form.prestadorId,
      objeto: form.objeto,
      vigenciaInicio: form.vigenciaInicio,
      vigenciaFim: form.vigenciaFim,
      status: form.status,
      itens: form.itens.map((i) => ({
        servicoId: i.servicoId,
        valor: Number(i.valor),
        descontoPercentual: Number(i.descontoPercentual) || 0,
        escopoId: i.escopoId,
      })),
    };
    try {
      if (contrato) {
        await api.patch(`/contratos/${contrato.id}`, payload);
        concluir();
      } else {
        await api.post('/contratos', payload);
        concluir();
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar o contrato.');
      setEnviando(false);
    }
  }

  async function excluir() {
    if (!contrato || enviando) return;
    if (!window.confirm(`Excluir o contrato ${contrato.numero}?`)) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.delete(`/contratos/${contrato.id}`);
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir o contrato.');
      setEnviando(false);
    }
  }

  const bloqueado = carregando || Boolean(falha) || somenteLeitura;

  return (
    <section className="gestao-page equipamento-pagina novo-equipamento contrato-pagina" aria-labelledby="contrato-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div className="equipamento-titulo-linha">
          <h2 id="contrato-titulo">{editando ? `Contrato ${contrato?.numero ?? ''}`.trim() : 'Novo contrato'}</h2>
        </div>
        <div className="novo-equipamento-acoes">
          {editando && podeExcluir && contrato && (
            <button type="button" className="btn btn-outline" disabled={enviando} onClick={excluir}>
              Excluir
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={voltar}>
            {somenteLeitura ? 'Voltar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <button
              type="submit"
              form="form-contrato"
              className="btn btn-primary"
              disabled={enviando || bloqueado || semAlteracoes(inicial, form)}
            >
              {enviando ? 'Salvando…' : 'Salvar'}
            </button>
          )}
        </div>
      </div>

      {carregando && <p className="novo-equipamento-estado" role="status">Carregando…</p>}
      {falha && <div className="error-banner" role="alert">{falha}</div>}

      <form id="form-contrato" onSubmit={aoEnviar}>
        <section className="equipamento-secao">
          <h3>Dados do contrato</h3>
          <div className="novo-equipamento-grade">
            <div className="field">
              <label htmlFor="ct-numero">Número do contrato</label>
              <input
                id="ct-numero"
                placeholder="Ex.: CONT-2026-001"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
                disabled={editando || bloqueado}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ct-prestador">Prestador de serviço</label>
              <select
                id="ct-prestador"
                value={form.prestadorId}
                onChange={(e) => setForm({ ...form, prestadorId: e.target.value })}
                disabled={bloqueado}
                required
              >
                <option value="">Selecione...</option>
                {opcoesPrestadores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ct-status">Status</label>
              <select
                id="ct-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                disabled={bloqueado}
              >
                {Object.entries(ROTULO_STATUS_CONTRATO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="field novo-equipamento-largura-total">
              <label htmlFor="ct-objeto">Descrição</label>
              <textarea
                id="ct-objeto"
                rows={2}
                placeholder="Descreva o objeto do contrato..."
                value={form.objeto}
                onChange={(e) => setForm({ ...form, objeto: e.target.value })}
                disabled={bloqueado}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ct-inicio">Início da vigência</label>
              <input
                id="ct-inicio"
                type="date"
                value={form.vigenciaInicio}
                onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })}
                disabled={bloqueado}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ct-fim">Término da vigência</label>
              <input
                id="ct-fim"
                type="date"
                value={form.vigenciaFim}
                onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })}
                disabled={bloqueado}
                required
              />
            </div>
          </div>
        </section>

        <section className="equipamento-secao" aria-labelledby="ct-itens-titulo">
          <h3 id="ct-itens-titulo">Itens do contrato</h3>
          {catalogosFalha && (
            <div className="error-banner" role="alert">
              Não foi possível carregar prestadores, serviços e escopos. Recarregue a página para tentar novamente.
            </div>
          )}
          <div
            className="itens-lista"
            style={{ '--colunas': `minmax(0,1fr) 220px 140px 130px ${editando ? '140px ' : ''}34px` } as CSSProperties}
          >
            {form.itens.length > 0 && (
              <div className="itens-cabecalho" aria-hidden>
                <span>Tipo de serviço</span>
                <span>Escopo</span>
                <span>Valor (R$)</span>
                <span>Desconto SINAPI (%)</span>
                {editando && <span>Saldo (R$)</span>}
                <span />
              </div>
            )}
            {form.itens.map((item, i) => (
              <div key={i} className="itens-linha" role="group" aria-label={`Item ${i + 1}`}>
                <div className="itens-celula" data-rotulo="Tipo de serviço">
                  <select
                    aria-label="Tipo de serviço"
                    value={item.servicoId}
                    onChange={(e) => editarItem(i, { servicoId: e.target.value })}
                    disabled={bloqueado}
                    required
                  >
                    <option value="">Selecione...</option>
                    {opcoesServicos
                      .filter((sv) => sv.id === item.servicoId || !form.itens.some((o) => o.servicoId === sv.id))
                      .map((sv) => (
                        <option key={sv.id} value={sv.id}>
                          {sv.nome}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="itens-celula" data-rotulo="Escopo">
                  <select
                    aria-label="Escopo"
                    value={item.escopoId}
                    onChange={(e) => editarItem(i, { escopoId: e.target.value })}
                    disabled={bloqueado}
                    required
                  >
                    <option value="">Selecione...</option>
                    {opcoesEscopos.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="itens-celula" data-rotulo="Valor (R$)">
                  <input
                    aria-label="Valor do item (R$)"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={item.valor}
                    onChange={(e) => editarItem(i, { valor: e.target.value })}
                    disabled={bloqueado}
                    required
                  />
                </div>
                <div className="itens-celula" data-rotulo="Desconto SINAPI (%)">
                  <input
                    aria-label="Desconto sobre a tabela SINAPI (%)"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    inputMode="decimal"
                    value={item.descontoPercentual}
                    onChange={(e) => editarItem(i, { descontoPercentual: e.target.value })}
                    disabled={bloqueado}
                  />
                </div>
                {editando && (
                  <div className="itens-celula" data-rotulo="Saldo (R$)">
                    <input
                      aria-label="Saldo do item (R$)"
                      value={item.saldo === undefined ? '—' : formatarMoeda(item.saldo)}
                      readOnly
                      disabled
                    />
                  </div>
                )}
                <div className="itens-celula itens-celula-remover">
                  {!somenteLeitura && (form.itens.length > 1 || contratoAntigoSemItens) ? (
                    <button
                      type="button"
                      className="itens-remover"
                      aria-label={`Remover item ${i + 1}`}
                      title="Remover item"
                      disabled={bloqueado}
                      onClick={() => removerItem(i)}
                    >
                      <IconeFechar />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              </div>
            ))}
          </div>
          {!somenteLeitura && (
            <button type="button" className="btn btn-outline itens-adicionar" disabled={bloqueado} onClick={adicionarItem}>
              + Adicionar item
            </button>
          )}
          <p className="itens-total" role="status" aria-live="polite">
            Valor total do contrato: <span>{formatarMoeda(total)}</span>
          </p>
        </section>
      </form>
    </section>
  );
}
