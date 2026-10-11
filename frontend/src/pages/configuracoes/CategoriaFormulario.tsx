import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useCarga } from '../../hooks/useCarga';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import type { Categoria } from '../../types';
import { semAlteracoes } from '../../utils/form';

const VAZIO = { nome: '', descricao: '' };

export function CategoriaFormulario() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  const [inicial, setInicial] = useState(VAZIO);
  const [form, setForm] = useState(VAZIO);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  const { dados, carregando, falha } = useCarga(
    () => api.get<Categoria[]>('/categorias'),
    editando,
    'Não foi possível carregar a categoria. Recarregue a página para tentar novamente.',
  );

  useEffect(() => {
    if (!dados || !editando) return;
    const encontrada = dados.find((c) => c.id === id);
    if (!encontrada) {
      setNaoEncontrada(true);
      return;
    }
    const valores = {
      nome: encontrada.nome,
      descricao: encontrada.descricao ?? '',
    };
    setCategoria(encontrada);
    setInicial(valores);
    setForm(valores);
  }, [dados, editando, id]);

  function voltar() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/configuracoes/categorias');
  }

  function concluir() {
    navigate('/configuracoes/categorias', { replace: true });
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    const payload = { nome: form.nome, descricao: form.descricao || null };
    try {
      if (categoria) await api.patch(`/categorias/${categoria.id}`, payload);
      else await api.post('/categorias', payload);
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar a categoria.');
      setEnviando(false);
    }
  }

  async function excluir() {
    if (!categoria || enviando) return;
    if (!window.confirm(`Excluir a categoria "${categoria.nome}"?`)) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.delete(`/categorias/${categoria.id}`);
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir a categoria.');
      setEnviando(false);
    }
  }

  const bloqueado = carregando || Boolean(falha) || naoEncontrada;

  return (
    <PaginaCadastro
      id="categoria"
      titulo={editando ? (categoria?.nome ?? 'Categorias de itens') : 'Nova categorias de itens'}
      formId="form-categoria"
      onCancelar={voltar}
      onEnviar={aoEnviar}
      desabilitarSalvar={semAlteracoes(inicial, form) || naoEncontrada}
      enviando={enviando}
      erro={erro}
      aoExibirErro={() => setErro(null)}
      carregando={carregando}
      falha={falha ?? (naoEncontrada ? 'Categoria não encontrada.' : null)}
      acoesExtras={
        categoria && (
          <button type="button" className="btn btn-outline" disabled={enviando} onClick={excluir}>
            Excluir
          </button>
        )
      }
    >
      <section className="equipamento-secao">
        <h3>Dados da categoria</h3>
        <div className="novo-equipamento-grade">
          <div className="field">
            <label htmlFor="categoria-nome">Nome da categoria</label>
            <input
              id="categoria-nome"
              placeholder="Ex.: Esterilização"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              disabled={bloqueado}
              required
            />
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="categoria-descricao">Descrição</label>
            <textarea
              id="categoria-descricao"
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              disabled={bloqueado}
            />
          </div>
        </div>
      </section>
    </PaginaCadastro>
  );
}
