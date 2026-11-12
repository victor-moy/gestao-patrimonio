import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useCarga } from '../../hooks/useCarga';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import type { PrestadorServico, Unidade } from '../../types';
import { semAlteracoes } from '../../utils/form';
import { ROTULO_PERFIL } from '../../utils/format';
import { GRUPOS_PERMISSOES } from '../../utils/permissoes';

const IDS_PERMISSOES: string[] = GRUPOS_PERMISSOES.flatMap((g) => g.permissoes.map((p) => p.id));

// Na tela, as áreas com uma permissão só ficam juntas em um grupo, para o formulário não virar uma lista de linhas vazias
const [GRUPO_MANUTENCOES, ...OUTROS_GRUPOS] = GRUPOS_PERMISSOES;
const GRUPOS_NA_TELA: Array<{ grupo: string; permissoes: ReadonlyArray<{ id: string; rotulo: string }> }> = [
  { grupo: 'Solicitações - Manutenções', permissoes: GRUPO_MANUTENCOES.permissoes },
  { grupo: 'Áreas do sistema', permissoes: OUTROS_GRUPOS.flatMap((g) => [...g.permissoes]) },
];
import type { UsuarioLista } from './Usuarios';

const VAZIO = { nome: '', email: '', matricula: '', perfil: '', unidadeId: '', prestadorId: '', ativo: true, usuarioTeste: false, permissoes: [] as string[] };

export function UsuarioFormulario() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  const [inicial, setInicial] = useState(VAZIO);
  const [form, setForm] = useState(VAZIO);
  const [usuario, setUsuario] = useState<UsuarioLista | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const { dados, carregando, falha } = useCarga(
    async () => {
      const [unidades, usuarios, prestadores] = await Promise.all([
        api.get<Unidade[]>('/unidades'),
        editando ? api.get<UsuarioLista[]>('/usuarios') : Promise.resolve([] as UsuarioLista[]),
        // Só a terceirizada usa a lista; se falhar, o restante do cadastro continua e o campo avisa
        api.get<PrestadorServico[]>('/prestadores').catch(() => null),
      ]);
      return { unidades, usuarios, prestadores };
    },
    true,
    'Não foi possível carregar os dados. Recarregue a página para tentar novamente.',
  );

  useEffect(() => {
    if (!dados || !editando) return;
    const encontrado = dados.usuarios.find((u) => u.id === id);
    if (!encontrado) {
      setNaoEncontrado(true);
      return;
    }
    const valores = {
      nome: encontrado.nome,
      email: encontrado.email,
      matricula: encontrado.matricula,
      perfil: encontrado.perfil,
      unidadeId: encontrado.unidadeId ?? '',
      prestadorId: encontrado.prestadorId ?? '',
      ativo: encontrado.ativo,
      usuarioTeste: encontrado.usuarioTeste ?? false,
      permissoes: IDS_PERMISSOES.filter((p) => encontrado.permissoes?.includes(p)),
    };
    setUsuario(encontrado);
    setInicial(valores);
    setForm(valores);
  }, [dados, editando, id]);

  function voltar() {
    if (location.key !== 'default') void navigate(-1);
    else void navigate('/configuracoes/usuarios');
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      if (usuario) {
        await api.patch(`/usuarios/${usuario.id}`, {
          nome: form.nome,
          perfil: form.perfil,
          unidadeId: form.unidadeId || null,
          prestadorId: form.perfil === 'TERCEIRIZADA' ? form.prestadorId || null : null,
          ativo: form.ativo,
          usuarioTeste: form.usuarioTeste,
          ...(form.perfil === 'OPERADOR' ? { permissoes: form.permissoes } : {}),
        });
      } else {
        // Cadastro prévio: só e-mail e perfil (mais unidade ou prestador, quando o perfil exige)
        await api.post('/usuarios', {
          email: form.email,
          perfil: form.perfil,
          unidadeId: form.perfil === 'UNIDADE' || form.perfil === 'GALPAO' ? form.unidadeId || null : null,
          prestadorId: form.perfil === 'TERCEIRIZADA' ? form.prestadorId || null : null,
          usuarioTeste: form.usuarioTeste,
          ...(form.perfil === 'OPERADOR' ? { permissoes: form.permissoes } : {}),
        });
      }
      void navigate('/configuracoes/usuarios', { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar o usuário.');
      setEnviando(false);
    }
  }

  const bloqueado = carregando || Boolean(falha) || naoEncontrado;

  function alternarPermissao(id: string, marcada: boolean) {
    setForm((atual) => ({
      ...atual,
      // Sempre na ordem do catálogo, para marcar e desmarcar não contar como alteração
      permissoes: IDS_PERMISSOES.filter((p) => (p === id ? marcada : atual.permissoes.includes(p))),
    }));
  }

  return (
    <PaginaCadastro
      id="usuario"
      titulo={editando ? (usuario?.nome ?? 'Usuário') : 'Novo usuário'}
      formId="form-usuario"
      onCancelar={voltar}
      onEnviar={aoEnviar}
      desabilitarSalvar={semAlteracoes(inicial, form) || naoEncontrado}
      enviando={enviando}
      erro={erro}
      aoExibirErro={() => setErro(null)}
      carregando={carregando}
      falha={falha ?? (naoEncontrado ? 'Usuário não encontrado.' : null)}
    >
      <section className="equipamento-secao">
        <h3>Dados do usuário</h3>
        <div className="novo-equipamento-grade">
          {editando && (
            <div className="field">
              <label htmlFor="usuario-nome">Nome completo</label>
              <input
                id="usuario-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                disabled={bloqueado}
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="usuario-email">E-mail</label>
            <input
              id="usuario-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={editando || bloqueado}
              required
            />
          </div>
          {editando && (
            <div className="field">
              <label htmlFor="usuario-matricula">Matrícula</label>
              <input id="usuario-matricula" value={form.matricula} disabled />
            </div>
          )}
          <div className="field">
            <label htmlFor="usuario-perfil">Perfil de acesso</label>
            <select
              id="usuario-perfil"
              value={form.perfil}
              onChange={(e) => setForm({ ...form, perfil: e.target.value })}
              disabled={bloqueado}
              required
            >
              {!editando && <option value="">Selecione…</option>}
              {/* Pré-cadastrar sem acesso não faz sentido; "Sem acesso" só aparece na edição, para revogar */}
              {Object.entries(ROTULO_PERFIL)
                .filter(([valor]) => editando || valor !== 'SEM_ACESSO')
                .map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
            </select>
          </div>
          {/* No cadastro novo a unidade só aparece quando o perfil exige */}
          {(editando || form.perfil === 'UNIDADE' || form.perfil === 'GALPAO') && (
          <div className="field">
            <label htmlFor="usuario-unidade">Unidade</label>
            <select
              id="usuario-unidade"
              value={form.unidadeId}
              onChange={(e) => setForm({ ...form, unidadeId: e.target.value })}
              disabled={bloqueado}
              required={form.perfil === 'UNIDADE' || form.perfil === 'GALPAO'}
            >
              <option value="">--</option>
              {(dados?.unidades ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
          )}
          {form.perfil === 'TERCEIRIZADA' && (
            <div className="field">
              <label htmlFor="usuario-prestador">Prestador de serviço</label>
              <select
                id="usuario-prestador"
                value={form.prestadorId}
                onChange={(e) => setForm({ ...form, prestadorId: e.target.value })}
                disabled={bloqueado}
                required
              >
                <option value="">{dados?.prestadores === null ? 'Não foi possível carregar os prestadores' : 'Selecione…'}</option>
                {(dados?.prestadores ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          {editando && (
            <div className="field">
              <label htmlFor="usuario-status">Status</label>
              <select
                id="usuario-status"
                value={form.ativo ? 'ativo' : 'inativo'}
                onChange={(e) => setForm({ ...form, ativo: e.target.value === 'ativo' })}
                disabled={bloqueado}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          )}
          <div className="novo-equipamento-largura-total">
            <label className="permissoes-opcao">
              <input
                type="checkbox"
                checked={form.usuarioTeste}
                onChange={(e) => setForm({ ...form, usuarioTeste: e.target.checked })}
                disabled={bloqueado}
              />
              Usuário de teste
            </label>
          </div>
        </div>
      </section>
      {form.perfil === 'OPERADOR' && (
        <section className="equipamento-secao permissoes-secao" aria-labelledby="usuario-permissoes-titulo">
          <div className="permissoes-cabecalho">
            <h3 id="usuario-permissoes-titulo">Permissões do operador</h3>
            <span className="permissoes-contagem" role="status">
              {form.permissoes.length === 1 ? '1 permissão selecionada' : `${form.permissoes.length} permissões selecionadas`}
            </span>
          </div>
          <p className="permissoes-apoio">
            Defina aqui as permissões ativas para o usuário.
          </p>
          {GRUPOS_NA_TELA.map((grupo, indice) => (
            <div
              key={grupo.grupo}
              className="permissoes-grupo"
              role="group"
              aria-labelledby={`permissoes-grupo-${indice}`}
            >
              <span className="permissoes-grupo-nome" id={`permissoes-grupo-${indice}`}>
                {grupo.grupo}
              </span>
              <div className="permissoes-opcoes">
                {grupo.permissoes.map((permissao) => (
                  <label key={permissao.id} className="permissoes-opcao">
                    <input
                      type="checkbox"
                      checked={form.permissoes.includes(permissao.id)}
                      onChange={(e) => alternarPermissao(permissao.id, e.target.checked)}
                      disabled={bloqueado}
                    />
                    {permissao.rotulo}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </PaginaCadastro>
  );
}
