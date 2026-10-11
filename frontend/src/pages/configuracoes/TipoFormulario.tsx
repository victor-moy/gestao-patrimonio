import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, urlArquivo } from '../../api/client';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { IconeCaixa } from '../../components/icons';
import { useCarga } from '../../hooks/useCarga';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import type { Categoria, TipoEquipamento } from '../../types';
import { semAlteracoes } from '../../utils/form';

const VAZIO = { codigo: '', nome: '', categoriaId: '', descricao: '', preco: '' };

export function TipoFormulario() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  const [inicial, setInicial] = useState(VAZIO);
  const [form, setForm] = useState(VAZIO);
  const [tipo, setTipo] = useState<TipoEquipamento | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [imagemAtual, setImagemAtual] = useState<string | null>(null);
  const [arquivoImagem, setArquivoImagem] = useState<File | null>(null);
  const [previewImagem, setPreviewImagem] = useState<string | null>(null);
  const inputImagem = useRef<HTMLInputElement>(null);

  const { dados, carregando, falha } = useCarga(
    async () => {
      const [categorias, tipos] = await Promise.all([
        api.get<Categoria[]>('/categorias'),
        editando ? api.get<TipoEquipamento[]>('/categorias/tipos') : Promise.resolve([] as TipoEquipamento[]),
      ]);
      return { categorias, tipos };
    },
    true,
    'Não foi possível carregar os dados. Recarregue a página para tentar novamente.',
  );

  useEffect(() => {
    if (!dados || !editando) return;
    const encontrado = dados.tipos.find((t) => t.id === id);
    if (!encontrado) {
      setNaoEncontrado(true);
      return;
    }
    const valores = {
      codigo: encontrado.codigo,
      nome: encontrado.nome,
      categoriaId: encontrado.categoriaId,
      descricao: encontrado.descricao ?? '',
      preco: encontrado.preco ?? '',
    };
    setTipo(encontrado);
    setImagemAtual(encontrado.imagemUrl ?? null);
    setInicial(valores);
    setForm(valores);
  }, [dados, editando, id]);

  function voltar() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/configuracoes/tipos');
  }

  function concluir() {
    navigate('/configuracoes/tipos', { replace: true });
  }

  function selecionarImagem(arquivo: File) {
    setArquivoImagem(arquivo);
    setPreviewImagem(URL.createObjectURL(arquivo));
  }

  async function removerImagemAtual() {
    if (!tipo || !window.confirm('Remover a imagem deste tipo de item?')) return;
    try {
      await api.delete(`/categorias/tipos/${tipo.id}/imagem`);
      setImagemAtual(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao remover a imagem.');
    }
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    const payload = {
      ...form,
      descricao: form.descricao || null,
      preco: form.preco === '' ? null : Number(form.preco),
    };
    try {
      const salvo = tipo
        ? await api.patch<TipoEquipamento>(`/categorias/tipos/${tipo.id}`, payload)
        : await api.post<TipoEquipamento>('/categorias/tipos', payload);
      if (arquivoImagem) {
        const dadosImagem = new FormData();
        dadosImagem.append('imagem', arquivoImagem);
        await api.post(`/categorias/tipos/${salvo.id}/imagem`, dadosImagem);
      }
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar o tipo.');
      setEnviando(false);
    }
  }

  async function excluir() {
    if (!tipo || enviando) return;
    if (!window.confirm(`Excluir o tipo "${tipo.nome}"?`)) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.delete(`/categorias/tipos/${tipo.id}`);
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir o tipo.');
      setEnviando(false);
    }
  }

  const bloqueado = carregando || Boolean(falha) || naoEncontrado;

  return (
    <PaginaCadastro
      id="tipo"
      titulo={editando ? (tipo?.nome ?? 'Tipo de item') : 'Novo tipo de item'}
      formId="form-tipo"
      onCancelar={voltar}
      onEnviar={aoEnviar}
      desabilitarSalvar={(semAlteracoes(inicial, form) && !arquivoImagem) || naoEncontrado}
      enviando={enviando}
      erro={erro}
      aoExibirErro={() => setErro(null)}
      carregando={carregando}
      falha={falha ?? (naoEncontrado ? 'Tipo não encontrado.' : null)}
      acoesExtras={
        tipo && (
          <button type="button" className="btn btn-outline" disabled={enviando} onClick={excluir}>
            Excluir
          </button>
        )
      }
    >
      <section className="equipamento-secao">
        <h3>Dados do tipo</h3>
        <div className="novo-equipamento-grade">
          <div className="field">
            <label htmlFor="tipo-codigo">Código</label>
            <input
              id="tipo-codigo"
              placeholder="Ex.: AUT-V50"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              disabled={bloqueado}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="tipo-nome">Nome do item</label>
            <input
              id="tipo-nome"
              placeholder="Ex.: Autoclave vertical 50L"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              disabled={bloqueado}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="tipo-categoria">Categoria</label>
            <select
              id="tipo-categoria"
              value={form.categoriaId}
              onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}
              disabled={bloqueado}
              required
            >
              <option value="">Selecione…</option>
              {(dados?.categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tipo-preco">Preço de referência (R$)</label>
            <input
              id="tipo-preco"
              type="number"
              step="0.01"
              min="0"
              value={form.preco}
              onChange={(e) => setForm({ ...form, preco: e.target.value })}
              disabled={bloqueado}
            />
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="tipo-descricao">Descrição</label>
            <textarea
              id="tipo-descricao"
              rows={3}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              disabled={bloqueado}
            />
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="tipo-imagem">Imagem do item</label>
            <div className="imagem-upload">
              <div className="imagem-upload-preview">
                {previewImagem || imagemAtual ? (
                  <img src={previewImagem ?? urlArquivo(imagemAtual!)} alt="" />
                ) : (
                  <IconeCaixa />
                )}
              </div>
              <div className="imagem-upload-acoes">
                <input
                  id="tipo-imagem"
                  ref={inputImagem}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    if (arquivo) selecionarImagem(arquivo);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={bloqueado}
                  onClick={() => inputImagem.current?.click()}
                >
                  {imagemAtual || previewImagem ? 'Trocar imagem' : 'Selecionar imagem'}
                </button>
                {tipo && imagemAtual && !previewImagem && (
                  <button type="button" className="btn btn-outline" onClick={removerImagemAtual}>
                    Remover imagem
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </PaginaCadastro>
  );
}
