import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useFormularioCadastro } from '../../hooks/useCadastro';
import type { PrestadorServico } from '../../types';

const VAZIO = { nome: '', cnpj: '', telefone: '', email: '' };

export function PrestadorFormulario() {
  const c = useFormularioCadastro<PrestadorServico, typeof VAZIO>({
    rotaApi: '/prestadores',
    rotaLista: '/configuracoes/servicos/prestadores',
    rotulo: 'o prestador',
    vazio: VAZIO,
    doItem: (p) => ({ nome: p.nome, cnpj: p.cnpj ?? '', telefone: p.telefone ?? '', email: p.email ?? '' }),
    paraPayload: (f) => ({
      nome: f.nome.trim(),
      cnpj: f.cnpj.trim() || null,
      telefone: f.telefone.trim() || null,
      email: f.email.trim() || null,
    }),
    nomeDoItem: (p) => p.nome,
  });
  const { form, setForm, bloqueado } = c;

  return (
    <PaginaCadastro
      id="prestador"
      titulo={c.editando ? (c.item?.nome ?? 'Prestadores de serviço') : 'Novo prestador de serviço'}
      formId="form-prestador"
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
        <h3>Dados do prestador</h3>
        <div className="novo-equipamento-grade">
          <div className="field">
            <label htmlFor="prestador-nome">Nome da empresa</label>
            <input
              id="prestador-nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              disabled={bloqueado}
              required
              minLength={2}
            />
          </div>
          <div className="field">
            <label htmlFor="prestador-cnpj">CNPJ</label>
            <input
              id="prestador-cnpj"
              inputMode="numeric"
              placeholder="Somente números"
              value={form.cnpj}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
              disabled={bloqueado}
            />
          </div>
          <div className="field">
            <label htmlFor="prestador-telefone">Telefone</label>
            <input
              id="prestador-telefone"
              type="tel"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              disabled={bloqueado}
            />
          </div>
          <div className="field">
            <label htmlFor="prestador-email">E-mail</label>
            <input
              id="prestador-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={bloqueado}
            />
          </div>
        </div>
      </section>
    </PaginaCadastro>
  );
}
