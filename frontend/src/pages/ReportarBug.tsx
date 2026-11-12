import { FormEvent, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { PaginaCadastro } from '../components/PaginaCadastro';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { AnexosBug } from '../components/AnexosBug';
import { MAX_ANEXOS_BUG, problemaDoAnexo, telaDeOrigem } from '../utils/relato';

// Qualquer perfil relata: o sistema anota sozinho a tela, o perfil e o navegador.
export function ReportarBug() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tela = telaDeOrigem(params.get('de'));
  const [esperado, setEsperado] = useState('');
  const [aconteceu, setAconteceu] = useState('');
  const [anexos, setAnexos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);

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
      dados.append('tela', tela);
      if (esperado.trim()) dados.append('esperado', esperado.trim());
      dados.append('aconteceu', aconteceu.trim());
      dados.append('navegador', navigator.userAgent.slice(0, 300));
      anexos.forEach((arquivo) => dados.append('anexos', arquivo));
      await api.post('/relatos', dados);
      // Volta para onde a pessoa estava antes de reportar
      navigate(tela);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar o relato.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaginaCadastro
      id="relato"
      titulo="Reportar bug"
      formId="form-relato"
      rotuloSalvar="Enviar"
      onCancelar={() => navigate(tela)}
      onEnviar={aoEnviar}
      desabilitarSalvar={aconteceu.trim().length < 5}
      enviando={enviando}
      erro={erro}
      aoExibirErro={() => setErro(null)}
      carregando={false}
      falha={null}
    >
      <section className="equipamento-secao">
        <h3>O que aconteceu</h3>
        <div className="novo-equipamento-grade">
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="relato-tela">Tela onde aconteceu</label>
            <input id="relato-tela" value={tela} readOnly />
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="relato-esperado">O que você esperava que acontecesse (opcional)</label>
            <textarea
              id="relato-esperado"
              rows={3}
              maxLength={1500}
              value={esperado}
              onChange={(e) => setEsperado(e.target.value)}
            />
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="relato-aconteceu">O que aconteceu de fato</label>
            <textarea
              id="relato-aconteceu"
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
