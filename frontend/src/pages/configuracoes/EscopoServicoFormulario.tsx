import { PaginaCadastro } from '../../components/PaginaCadastro';
import { TipoManutencaoSelect } from '../../components/TipoManutencaoSelect';
import { useFormularioCadastro } from '../../hooks/useCadastro';
import type { EscopoServico } from '../../types';

const VAZIO = { nome: '', descricao: '', cobrePreventiva: true, cobreCorretiva: true };

export function EscopoServicoFormulario() {
  const c = useFormularioCadastro<EscopoServico, typeof VAZIO>({
    rotaApi: '/escopos-servico',
    rotaLista: '/configuracoes/servicos/escopos',
    rotulo: 'o escopo',
    vazio: VAZIO,
    doItem: (e) => ({
      nome: e.nome,
      descricao: e.descricao ?? '',
      cobrePreventiva: e.cobrePreventiva,
      cobreCorretiva: e.cobreCorretiva,
    }),
    paraPayload: (f) => ({
      nome: f.nome.trim(),
      descricao: f.descricao.trim() || null,
      cobrePreventiva: f.cobrePreventiva,
      cobreCorretiva: f.cobreCorretiva,
    }),
    nomeDoItem: (e) => e.nome,
  });
  const { form, setForm, bloqueado } = c;

  return (
    <PaginaCadastro
      id="escopo-servico"
      titulo={c.editando ? (c.item?.nome ?? 'Escopos de serviço') : 'Novo escopo'}
      formId="form-escopo-servico"
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
        <h3>Dados do escopo</h3>
        <div className="novo-equipamento-grade">
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="escopo-nome">Nome do escopo</label>
            <input
              id="escopo-nome"
              placeholder="Ex.: Manutenção preventiva"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              disabled={bloqueado}
              required
              minLength={2}
              maxLength={160}
            />
          </div>
          <div className="field">
            <TipoManutencaoSelect
              id="escopo-manutencao-coberta"
              legenda="Manutenção coberta"
              preventiva={form.cobrePreventiva}
              corretiva={form.cobreCorretiva}
              onChange={({ preventiva, corretiva }) =>
                setForm({ ...form, cobrePreventiva: preventiva, cobreCorretiva: corretiva })
              }
              disabled={bloqueado}
            />
          </div>
          <div className="field novo-equipamento-largura-total">
            <label htmlFor="escopo-descricao">Descrição</label>
            <textarea
              id="escopo-descricao"
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
