import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useFormularioCadastro } from '../../hooks/useCadastro';
import type { ServicoContrato } from '../../types';

const VAZIO = { nome: '', descricao: '', exigeAvaliacaoTecnica: false, exigeOrcamentoPrevio: false };

export function ServicoContratoFormulario() {
  const c = useFormularioCadastro<ServicoContrato, typeof VAZIO>({
    rotaApi: '/servicos-contrato',
    rotaLista: '/configuracoes/servicos/tipos',
    rotulo: 'o tipo de serviço',
    vazio: VAZIO,
    doItem: (s) => ({ nome: s.nome, descricao: s.descricao ?? '', exigeAvaliacaoTecnica: s.exigeAvaliacaoTecnica, exigeOrcamentoPrevio: s.exigeOrcamentoPrevio }),
    paraPayload: (f) => ({
      nome: f.nome.trim(),
      descricao: f.descricao.trim() || null,
      exigeAvaliacaoTecnica: f.exigeAvaliacaoTecnica,
      exigeOrcamentoPrevio: f.exigeOrcamentoPrevio,
    }),
    nomeDoItem: (s) => s.nome,
  });
  const { form, setForm, bloqueado } = c;

  return (
    <PaginaCadastro
      id="servico-contrato"
      titulo={c.editando ? (c.item?.nome ?? 'Tipos de serviço') : 'Novo tipo de serviço'}
      formId="form-servico-contrato"
      onCancelar={c.voltar}
      onEnviar={c.aoEnviar}
      desabilitarSalvar={c.semAlteracao}
      enviando={c.enviando}
      erro={c.erro}
      aoExibirErro={() => c.setErro(null)}
      carregando={c.carregando}
      falha={c.falha}
      acoesExtras={
        c.item && (
          <button type="button" className="btn btn-outline" disabled={c.enviando} onClick={c.excluir}>
            Excluir
          </button>
        )
      }
    >
      <section className="equipamento-secao">
        <h3>Dados do tipo de serviço</h3>
        <div className="novo-equipamento-grade">
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="servico-nome">Nome do tipo de serviço</label>
            <input
              id="servico-nome"
              placeholder="Ex.: Serviço de manutenção preventiva e corretiva"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              disabled={bloqueado}
              required
              minLength={2}
              maxLength={160}
            />
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="servico-avaliacao">Necessita avaliação técnica</label>
            <select
              id="servico-avaliacao"
              value={form.exigeAvaliacaoTecnica ? 'sim' : 'nao'}
              onChange={(e) => setForm({ ...form, exigeAvaliacaoTecnica: e.target.value === 'sim' })}
              disabled={bloqueado}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="servico-orcamento">Exige orçamento prévio</label>
            <select
              id="servico-orcamento"
              value={form.exigeOrcamentoPrevio ? 'sim' : 'nao'}
              onChange={(e) => setForm({ ...form, exigeOrcamentoPrevio: e.target.value === 'sim' })}
              disabled={bloqueado}
            >
              <option value="nao">Não</option>
              <option value="sim">Sim: o chamado civil só segue com 3 cotações e orçamento aprovado</option>
            </select>
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="servico-descricao">Descrição</label>
            <textarea
              id="servico-descricao"
              rows={3}
              maxLength={500}
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
