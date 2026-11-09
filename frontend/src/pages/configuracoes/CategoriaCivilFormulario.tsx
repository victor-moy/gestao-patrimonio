import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { IconeFechar } from '../../components/icons';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useCarga } from '../../hooks/useCarga';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import type { CategoriaCivil, TipoPergunta } from '../../types';
import { semAlteracoes } from '../../utils/form';

// Pergunta no formulário: as opções ficam num campo de texto, uma por linha
interface PerguntaForm {
  id?: string;
  texto: string;
  tipo: TipoPergunta;
  opcoes: string;
  obrigatoria: boolean;
}

interface Form {
  nome: string;
  ativo: boolean;
  perguntas: PerguntaForm[];
}

const VAZIO: Form = { nome: '', ativo: true, perguntas: [] };
const PERGUNTA_NOVA: PerguntaForm = { texto: '', tipo: 'OPCOES', opcoes: '', obrigatoria: true };

const listaDeOpcoes = (texto: string) => texto.split('\n').map((o) => o.trim()).filter(Boolean);

const doCadastro = (c: CategoriaCivil): Form => ({
  nome: c.nome,
  ativo: c.ativo,
  perguntas: c.perguntas
    .filter((p) => p.ativo)
    .map((p) => ({ id: p.id, texto: p.texto, tipo: p.tipo, opcoes: p.opcoes.join('\n'), obrigatoria: p.obrigatoria })),
});

export function CategoriaCivilFormulario() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  const [inicial, setInicial] = useState<Form>(VAZIO);
  const [form, setForm] = useState<Form>(VAZIO);
  const [categoria, setCategoria] = useState<CategoriaCivil | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  const { dados, carregando, falha } = useCarga(
    () => api.get<CategoriaCivil[]>('/categorias-civis?todas=true'),
    editando,
    'Não foi possível carregar o tipo. Recarregue a página para tentar novamente.',
  );

  useEffect(() => {
    if (!dados || !editando) return;
    const encontrada = dados.find((c) => c.id === id);
    if (!encontrada) {
      setNaoEncontrada(true);
      return;
    }
    setCategoria(encontrada);
    setInicial(doCadastro(encontrada));
    setForm(doCadastro(encontrada));
  }, [dados, editando, id]);

  const voltar = () => (location.key !== 'default' ? void navigate(-1) : void navigate('/configuracoes/chamados/tipos-civis'));
  const concluir = () => void navigate('/configuracoes/chamados/tipos-civis', { replace: true });

  const editarPergunta = (i: number, parcial: Partial<PerguntaForm>) =>
    setForm({ ...form, perguntas: form.perguntas.map((p, j) => (j === i ? { ...p, ...parcial } : p)) });

  const perguntaInvalida = (p: PerguntaForm) =>
    p.texto.trim().length < 3 || (p.tipo === 'OPCOES' && new Set(listaDeOpcoes(p.opcoes)).size < 2);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    const payload = {
      nome: form.nome.trim(),
      ativo: form.ativo,
      perguntas: form.perguntas.map((p) => ({
        ...(p.id ? { id: p.id } : {}),
        texto: p.texto.trim(),
        tipo: p.tipo,
        opcoes: p.tipo === 'OPCOES' ? listaDeOpcoes(p.opcoes) : [],
        obrigatoria: p.obrigatoria,
      })),
    };
    try {
      if (categoria) await api.patch(`/categorias-civis/${categoria.id}`, payload);
      else await api.post('/categorias-civis', payload);
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar o tipo.');
      setEnviando(false);
    }
  }

  async function excluir() {
    if (!categoria || enviando) return;
    if (!window.confirm(`Excluir o tipo "${categoria.nome}"?`)) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.delete(`/categorias-civis/${categoria.id}`);
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao excluir o tipo.');
      setEnviando(false);
    }
  }

  const bloqueado = carregando || Boolean(falha) || naoEncontrada;
  const invalido = form.nome.trim().length < 2 || form.perguntas.some(perguntaInvalida);

  return (
    <PaginaCadastro
      id="categoria-civil"
      titulo={editando ? (categoria?.nome ?? 'Tipo') : 'Novo tipo'}
      formId="form-categoria-civil"
      onCancelar={voltar}
      onEnviar={aoEnviar}
      desabilitarSalvar={semAlteracoes(inicial, form) || naoEncontrada || invalido}
      enviando={enviando}
      erro={erro}
      aoExibirErro={() => setErro(null)}
      carregando={carregando}
      falha={falha ?? (naoEncontrada ? 'Tipo não encontrado.' : null)}
      acoesExtras={
        categoria && (
          <button type="button" className="btn btn-outline" disabled={enviando} onClick={excluir}>
            Excluir
          </button>
        )
      }
    >
      <section className="equipamento-secao">
        <h3>Dados do tipo</h3>
        <div className="novo-equipamento-grade">
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="categoria-civil-nome">Nome *</label>
            <input
              id="categoria-civil-nome"
              placeholder="Ex.: Hidráulica"
              maxLength={60}
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              disabled={bloqueado}
              required
            />
          </div>
        </div>
      </section>

      <section className="equipamento-secao">
        <h3>Questionário</h3>
        {form.perguntas.length === 0 && <p className="dado-apoio">Nenhuma pergunta: o chamado desse tipo só pede a descrição do problema.</p>}
        {form.perguntas.map((p, i) => (
          <div key={p.id ?? `nova-${i}`} className="pergunta-bloco" role="group" aria-label={`Pergunta ${i + 1}`}>
            <div className="field">
              <label htmlFor={`pergunta-texto-${i}`}>Pergunta *</label>
              <input
                id={`pergunta-texto-${i}`}
                maxLength={200}
                placeholder="Ex.: O vazamento é contínuo?"
                value={p.texto}
                onChange={(e) => editarPergunta(i, { texto: e.target.value })}
                disabled={bloqueado}
              />
            </div>
            <div className="field">
              <label htmlFor={`pergunta-tipo-${i}`}>Tipo de resposta</label>
              <select id={`pergunta-tipo-${i}`} value={p.tipo} onChange={(e) => editarPergunta(i, { tipo: e.target.value as TipoPergunta })} disabled={bloqueado}>
                <option value="OPCOES">Seletor de opções pré-definidas</option>
                <option value="TEXTO">Texto corrido</option>
              </select>
            </div>
            {p.tipo === 'OPCOES' && (
              <div className="field">
                <label htmlFor={`pergunta-opcoes-${i}`}>Opções (uma por linha, no mínimo duas) *</label>
                <textarea
                  id={`pergunta-opcoes-${i}`}
                  rows={4}
                  value={p.opcoes}
                  onChange={(e) => editarPergunta(i, { opcoes: e.target.value })}
                  disabled={bloqueado}
                />
              </div>
            )}
            <div className="field">
              <label className="checkbox-linha interruptor-linha" htmlFor={`pergunta-obrigatoria-${i}`}>
                <input
                  id={`pergunta-obrigatoria-${i}`}
                  type="checkbox"
                  role="switch"
                  checked={p.obrigatoria}
                  onChange={(e) => editarPergunta(i, { obrigatoria: e.target.checked })}
                  disabled={bloqueado}
                />
                <span>Resposta obrigatória</span>
              </label>
            </div>
            <button
              type="button"
              className="itens-remover pergunta-remover"
              aria-label={`Remover pergunta ${i + 1}`}
              title="Remover pergunta"
              disabled={bloqueado}
              onClick={() => setForm({ ...form, perguntas: form.perguntas.filter((_, j) => j !== i) })}
            >
              <IconeFechar />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-outline itens-adicionar" disabled={bloqueado || form.perguntas.length >= 30} onClick={() => setForm({ ...form, perguntas: [...form.perguntas, { ...PERGUNTA_NOVA }] })}>
          + Adicionar pergunta
        </button>
      </section>
    </PaginaCadastro>
  );
}
