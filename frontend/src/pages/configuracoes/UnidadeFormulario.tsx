import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useCarga } from '../../hooks/useCarga';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import type { Unidade } from '../../types';
import { semAlteracoes } from '../../utils/form';
import { ROTULO_TIPO_UNIDADE } from '../../utils/format';
import type { UsuarioLista } from './Usuarios';

const VAZIO = { nome: '', tipo: 'UBSF', endereco: '', emailBase: '', responsavelId: '', ativo: true };

export function UnidadeFormulario() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  const [inicial, setInicial] = useState(VAZIO);
  const [form, setForm] = useState(VAZIO);
  const [unidade, setUnidade] = useState<Unidade | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  const { dados, carregando, falha } = useCarga(
    async () => {
      const [usuarios, unidades] = await Promise.all([
        api.get<UsuarioLista[]>('/usuarios'),
        editando ? api.get<Unidade[]>('/unidades?incluirInativos=true') : Promise.resolve([] as Unidade[]),
      ]);
      return { usuarios, unidades };
    },
    true,
    'Não foi possível carregar os dados. Recarregue a página para tentar novamente.',
  );

  useEffect(() => {
    if (!dados || !editando) return;
    const encontrada = dados.unidades.find((u) => u.id === id);
    if (!encontrada) {
      setNaoEncontrada(true);
      return;
    }
    const valores = {
      nome: encontrada.nome,
      tipo: encontrada.tipo,
      endereco: encontrada.endereco ?? '',
      emailBase: encontrada.emailBase ?? '',
      responsavelId: encontrada.responsavel?.id ?? encontrada.responsavelId ?? '',
      ativo: encontrada.ativo,
    };
    setUnidade(encontrada);
    setInicial(valores);
    setForm(valores);
  }, [dados, editando, id]);

  function voltar() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/configuracoes/unidades');
  }

  function concluir() {
    navigate('/configuracoes/unidades', { replace: true });
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    const payload = {
      nome: form.nome,
      tipo: form.tipo,
      endereco: form.endereco || null,
      emailBase: form.emailBase || null,
      responsavelId: form.responsavelId || null,
    };
    try {
      if (unidade) {
        await api.patch(`/unidades/${unidade.id}`, { ...payload, ativo: form.ativo });
      } else {
        await api.post('/unidades', payload);
      }
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar a unidade.');
      setEnviando(false);
    }
  }

  async function excluir() {
    if (!unidade || enviando) return;
    if (!window.confirm(`Excluir a unidade "${unidade.nome}"?`)) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.delete(`/unidades/${unidade.id}`);
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir a unidade.');
      setEnviando(false);
    }
  }

  const bloqueado = carregando || Boolean(falha) || naoEncontrada;

  return (
    <PaginaCadastro
      id="unidade"
      titulo={editando ? (unidade?.nome ?? 'Unidade') : 'Nova unidade'}
      formId="form-unidade"
      onCancelar={voltar}
      onEnviar={aoEnviar}
      desabilitarSalvar={semAlteracoes(inicial, form) || naoEncontrada}
      enviando={enviando}
      erro={erro}
      aoExibirErro={() => setErro(null)}
      carregando={carregando}
      falha={falha ?? (naoEncontrada ? 'Unidade não encontrada.' : null)}
      acoesExtras={
        unidade && (
          <button type="button" className="btn btn-outline" disabled={enviando} onClick={excluir}>
            Excluir
          </button>
        )
      }
    >
      <section className="equipamento-secao">
        <h3>Dados da unidade</h3>
        <div className="novo-equipamento-grade">
          <div className="field">
            <label htmlFor="unidade-nome">Nome da unidade</label>
            <input
              id="unidade-nome"
              placeholder="Ex.: UBS Aventureiro"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              disabled={bloqueado}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="unidade-tipo">Tipo</label>
            <select
              id="unidade-tipo"
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              disabled={bloqueado}
            >
              {Object.entries(ROTULO_TIPO_UNIDADE).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="unidade-endereco">Endereço</label>
            <input
              id="unidade-endereco"
              value={form.endereco}
              onChange={(e) => setForm({ ...form, endereco: e.target.value })}
              disabled={bloqueado}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="unidade-email">E-mail</label>
            <input
              id="unidade-email"
              type="email"
              placeholder="Ex.: unidade@joinville.sc.gov.br"
              value={form.emailBase}
              onChange={(e) => setForm({ ...form, emailBase: e.target.value })}
              disabled={bloqueado}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="unidade-responsavel">Responsável</label>
            <select
              id="unidade-responsavel"
              value={form.responsavelId}
              onChange={(e) => setForm({ ...form, responsavelId: e.target.value })}
              disabled={bloqueado}
              required
            >
              <option value="">Selecione…</option>
              {(dados?.usuarios ?? [])
                .filter((u) => u.ativo || u.id === form.responsavelId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} — {u.email}
                  </option>
                ))}
            </select>
          </div>
          {editando && (
            <div className="field novo-equipamento-largura-total">
              <label className="campo-checkbox">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  disabled={bloqueado}
                />
                Unidade ativa
              </label>
            </div>
          )}
        </div>
      </section>
    </PaginaCadastro>
  );
}
