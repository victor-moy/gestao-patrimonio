import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import type { Contrato } from '../types';
import { ROTULO_STATUS_CONTRATO, TIPOS_CONTRATO } from '../utils/cadastros';
import { semAlteracoes } from '../utils/form';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

const VAZIO = {
  numero: '',
  empresa: '',
  tipo: '',
  objeto: '',
  valorTotal: '0',
  condicoesPagamento: '',
  vigenciaInicio: '',
  vigenciaFim: '',
  status: 'ATIVO',
  observacoes: '',
};

// Cadastro e edição de contrato em página própria (mesmo padrão dos demais cadastros).
export function ContratoFormulario() {
  const { id } = useParams();
  const editando = Boolean(id);
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const permitido = usuario?.perfil === 'GESTOR_MANUTENCAO' || usuario?.perfil === 'GESTOR_PATRIMONIO';
  const podeExcluir = usuario?.perfil === 'GESTOR_PATRIMONIO';
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [carregando, setCarregando] = useState(editando);
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  useAlertaNativo(erro, () => setErro(null));
  const [inicial, setInicial] = useState(VAZIO);
  const [form, setForm] = useState(VAZIO);

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
          empresa: c.empresa,
          tipo: c.tipo,
          objeto: c.objeto,
          valorTotal: c.valorTotal ? String(c.valorTotal) : '0',
          condicoesPagamento: c.condicoesPagamento ?? '',
          vigenciaInicio: c.vigenciaInicio.slice(0, 10),
          vigenciaFim: c.vigenciaFim.slice(0, 10),
          status: c.status,
          observacoes: c.observacoes ?? '',
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

  function voltar() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/contratos');
  }

  function concluir() {
    navigate('/contratos', { replace: true });
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    const payload = {
      numero: form.numero,
      empresa: form.empresa,
      tipo: form.tipo,
      objeto: form.objeto,
      valorTotal: Number(form.valorTotal),
      condicoesPagamento: form.condicoesPagamento || null,
      vigenciaInicio: form.vigenciaInicio,
      vigenciaFim: form.vigenciaFim,
      status: form.status,
      observacoes: form.observacoes || null,
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

  const bloqueado = carregando || Boolean(falha);

  return (
    <section className="gestao-page equipamento-pagina novo-equipamento" aria-labelledby="contrato-titulo">
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
            Cancelar
          </button>
          <button
            type="submit"
            form="form-contrato"
            className="btn btn-primary"
            disabled={enviando || bloqueado || semAlteracoes(inicial, form)}
          >
            {enviando ? 'Salvando…' : 'Salvar'}
          </button>
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
              <label htmlFor="ct-empresa">Fornecedor</label>
              <input
                id="ct-empresa"
                value={form.empresa}
                onChange={(e) => setForm({ ...form, empresa: e.target.value })}
                disabled={bloqueado}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ct-tipo">Tipo de contrato</label>
              <select
                id="ct-tipo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                disabled={bloqueado}
                required
              >
                <option value="">Selecione...</option>
                {TIPOS_CONTRATO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {form.tipo && !TIPOS_CONTRATO.includes(form.tipo) && <option value={form.tipo}>{form.tipo}</option>}
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
                rows={3}
                placeholder="Descreva o objeto do contrato..."
                value={form.objeto}
                onChange={(e) => setForm({ ...form, objeto: e.target.value })}
                disabled={bloqueado}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ct-valor">Valor total (R$)</label>
              <input
                id="ct-valor"
                type="number"
                step="0.01"
                min="0"
                value={form.valorTotal}
                onChange={(e) => setForm({ ...form, valorTotal: e.target.value })}
                disabled={bloqueado}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ct-pagamento">Condições de pagamento</label>
              <input
                id="ct-pagamento"
                value={form.condicoesPagamento}
                onChange={(e) => setForm({ ...form, condicoesPagamento: e.target.value })}
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
            <div className="field novo-equipamento-largura-total">
              <label htmlFor="ct-obs">Observações</label>
              <textarea
                id="ct-obs"
                rows={2}
                placeholder="Informações adicionais..."
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                disabled={bloqueado}
              />
            </div>
          </div>
        </section>
      </form>
    </section>
  );
}
