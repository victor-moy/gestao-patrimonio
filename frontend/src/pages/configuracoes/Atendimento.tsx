import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useCarga } from '../../hooks/useCarga';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import { semAlteracoes } from '../../utils/form';

// Exibe o número no formato brasileiro para edição: 5547999999999 -> (47) 99999-9999
function formatarWhatsapp(digitos: string | null) {
  if (!digitos) return '';
  const local = digitos.startsWith('55') ? digitos.slice(2) : digitos;
  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  const corte = resto.length > 8 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

// Contato exibido a quem não encontra o equipamento na lista ao abrir um chamado.
export function Atendimento() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  const [inicial, setInicial] = useState({ whatsapp: '' });
  const [form, setForm] = useState({ whatsapp: '' });

  const { dados, carregando, falha } = useCarga(
    () => api.get<{ whatsapp: string | null }>('/configuracoes/atendimento'),
    true,
    'Não foi possível carregar a configuração. Recarregue a página para tentar novamente.',
  );

  useEffect(() => {
    if (!dados) return;
    const valores = { whatsapp: formatarWhatsapp(dados.whatsapp) };
    setInicial(valores);
    setForm(valores);
  }, [dados]);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const salvo = await api.put<{ whatsapp: string | null }>('/configuracoes/atendimento', {
        whatsapp: form.whatsapp.trim() === '' ? null : form.whatsapp,
      });
      const valores = { whatsapp: formatarWhatsapp(salvo.whatsapp) };
      setInicial(valores);
      setForm(valores);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar o contato de atendimento.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PaginaCadastro
      id="atendimento"
      titulo="Atendimento"
      formId="form-atendimento"
      onCancelar={() => setForm(inicial)}
      onEnviar={aoEnviar}
      desabilitarSalvar={semAlteracoes(inicial, form)}
      enviando={enviando}
      erro={erro}
      aoExibirErro={() => setErro(null)}
      carregando={carregando}
      falha={falha}
    >
      <section className="equipamento-secao">
        <h3>Item não encontrado</h3>
        <div className="novo-equipamento-grade">
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="atendimento-whatsapp">WhatsApp do atendimento</label>
            <input
              id="atendimento-whatsapp"
              type="tel"
              inputMode="tel"
              placeholder="(47) 99999-9999"
              value={form.whatsapp}
              onChange={(e) => setForm({ whatsapp: e.target.value })}
              disabled={carregando || Boolean(falha)}
            />
            <p className="campo-ajuda">
              Quem não encontrar o equipamento ao abrir uma manutenção ou solicitação verá o link "Fale com o
              atendimento", que abre uma conversa neste número. Deixe em branco para esconder o link.
            </p>
          </div>
        </div>
      </section>
    </PaginaCadastro>
  );
}
