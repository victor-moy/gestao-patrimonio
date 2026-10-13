import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { semAlteracoes } from '../utils/form';
import { useCarga } from './useCarga';
import { useMensagemTemporaria } from './useMensagemTemporaria';

// Lista de um cadastro simples: carrega uma vez e permite tentar de novo; falhas ficam visíveis.
export function useListaCadastro<T>(rota: string, mensagemFalha: string) {
  const [itens, setItens] = useState<T[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(() => {
    setCarregando(true);
    setErro(null);
    api
      .get<T[]>(rota)
      .then(setItens)
      .catch((e) => setErro(e instanceof Error ? e.message : mensagemFalha))
      .finally(() => setCarregando(false));
  }, [rota, mensagemFalha]);

  useEffect(recarregar, [recarregar]);

  return { itens, carregando, erro, recarregar };
}

interface OpcoesFormulario<T extends { id: string }, F> {
  // Rota da API (ex.: '/prestadores'); a lista dela localiza o item na edição (não há endpoint por id)
  rotaApi: string;
  // Rota da lista no app, para onde Cancelar/Salvar/Excluir voltam
  rotaLista: string;
  // Como o cadastro é chamado nas mensagens, no masculino ("o prestador", "o escopo")
  rotulo: string;
  vazio: F;
  doItem: (item: T) => F;
  paraPayload: (form: F) => unknown;
  nomeDoItem: (item: T) => string;
}

// Formulário de cadastro/edição em página própria: carrega o item pela lista, salva (POST/PATCH), exclui com confirmação e volta.
export function useFormularioCadastro<T extends { id: string }, F>(opcoes: OpcoesFormulario<T, F>) {
  const { rotaApi, rotaLista, rotulo, vazio, doItem, paraPayload, nomeDoItem } = opcoes;
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  const [inicial, setInicial] = useState(vazio);
  const [form, setForm] = useState(vazio);
  const [item, setItem] = useState<T | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const { dados, carregando, falha } = useCarga(
    () => api.get<T[]>(rotaApi),
    editando,
    `Não foi possível carregar ${rotulo}. Recarregue a página para tentar novamente.`,
  );

  useEffect(() => {
    if (!dados || !editando) return;
    const encontrado = dados.find((d) => d.id === id);
    if (!encontrado) {
      setNaoEncontrado(true);
      return;
    }
    const valores = doItem(encontrado);
    setItem(encontrado);
    setInicial(valores);
    setForm(valores);
  }, [dados, editando, id]);

  function voltar() {
    if (location.key !== 'default') void navigate(-1);
    else void navigate(rotaLista);
  }

  function concluir() {
    void navigate(rotaLista, { replace: true });
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      if (item) await api.patch(`${rotaApi}/${item.id}`, paraPayload(form));
      else await api.post(rotaApi, paraPayload(form));
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : `Erro ao salvar ${rotulo}.`);
      setEnviando(false);
    }
  }

  async function excluir() {
    if (!item || enviando) return;
    if (!window.confirm(`Excluir ${rotulo} "${nomeDoItem(item)}"?`)) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.delete(`${rotaApi}/${item.id}`);
      concluir();
    } catch (err) {
      setErro(err instanceof Error ? err.message : `Erro ao excluir ${rotulo}.`);
      setEnviando(false);
    }
  }

  return {
    editando,
    form,
    setForm,
    item,
    enviando,
    erro,
    setErro,
    carregando,
    falha: falha ?? (naoEncontrado ? 'Cadastro não encontrado.' : null),
    bloqueado: carregando || Boolean(falha) || naoEncontrado,
    semAlteracao: semAlteracoes(inicial, form) || naoEncontrado,
    voltar,
    aoEnviar,
    excluir,
  };
}
