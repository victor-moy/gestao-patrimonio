import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import { AnexosBug } from '../../components/AnexosBug';
import type { CategoriaRelato } from '../../types';
import { MAX_ANEXOS_BUG, problemaDoAnexo, ROTULO_CATEGORIA_RELATO, telaDeOrigem } from '../../utils/relato';

// Qualquer perfil abre um chamado de suporte: o sistema anota sozinho a tela, o perfil e o navegador.
export function NovoChamado() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tela = telaDeOrigem(params.get('de'));
  const [categoria, setCategoria] = useState<CategoriaRelato>('BUG');
  const [titulo, setTitulo] = useState('');
  const [esperado, setEsperado] = useState('');
  const [aconteceu, setAconteceu] = useState('');
  const [anexos, setAnexos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  const ehBug = categoria === 'BUG';

  function adicionar(novos: File[]) {
    const aceitos: File[] = [];
    for (const arquivo of novos) {
      const motivo = problemaDoAnexo(arquivo);
      if (motivo) {
        setErro(motivo);
        continue;
      }
      if (anexos.length + aceitos.length >= MAX_ANEXOS_BUG) {
        setErro(`Você pode anexar no máximo ${MAX_ANEXOS_BUG} arquivos.`);
        break;
      }
      aceitos.push(arquivo);
    }
    if (aceitos.length > 0) setAnexos((atuais) => [...atuais, ...aceitos]);
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const dados = new FormData();
      dados.append('categoria', categoria);
      dados.append('titulo', titulo.trim());
      dados.append('tela', tela);
      if (ehBug && esperado.trim()) dados.append('esperado', esperado.trim());
      dados.append('aconteceu', aconteceu.trim());
      dados.append('navegador', navigator.userAgent.slice(0, 300));
      anexos.forEach((arquivo) => dados.append('anexos', arquivo));
      const criado = await api.post<{ id: string }>('/relatos', dados);
      // Abre o chamado criado, onde a pessoa acompanha o protocolo e a conversa
      void navigate(`/suporte/${criado.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível abrir o chamado.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaginaCadastro
      id="chamado-novo"
      titulo="Abrir chamado de suporte"
      formId="form-chamado-novo"
      rotuloSalvar="Enviar"
      onCancelar={() => void navigate(tela)}
      onEnviar={aoEnviar}
      desabilitarSalvar={titulo.trim().length < 3 || aconteceu.trim().length < 5}
      enviando={enviando}
      erro={erro}
      aoExibirErro={() => setErro(null)}
      carregando={false}
      falha={null}
    >
      <section className="equipamento-secao">
        <h3>Chamado</h3>
        <div className="novo-equipamento-grade">
          <div className="field">
            <label htmlFor="chamado-categoria">Categoria</label>
            <select id="chamado-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaRelato)}>
              {Object.entries(ROTULO_CATEGORIA_RELATO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="chamado-tela">Tela de origem</label>
            <input id="chamado-tela" value={tela} readOnly />
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="chamado-titulo">Título</label>
            <input
              id="chamado-titulo"
              maxLength={80}
              required
              placeholder="Resuma o chamado em poucas palavras"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>
          {ehBug && (
            <div className="field novo-equipamento-largura-total">
              <label htmlFor="chamado-esperado">O que você esperava que acontecesse (opcional)</label>
              <textarea id="chamado-esperado" rows={3} maxLength={1500} value={esperado} onChange={(e) => setEsperado(e.target.value)} />
            </div>
          )}
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="chamado-descricao">{ehBug ? 'O que aconteceu de fato' : 'Descrição'}</label>
            <textarea
              id="chamado-descricao"
              rows={5}
              maxLength={3000}
              required
              value={aconteceu}
              onChange={(e) => setAconteceu(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="equipamento-secao">
        <h3>Anexos</h3>
        <AnexosBug arquivos={anexos} onAdicionar={adicionar} onRemover={(i) => setAnexos((atuais) => atuais.filter((_, j) => j !== i))} />
      </section>
    </PaginaCadastro>
  );
}
