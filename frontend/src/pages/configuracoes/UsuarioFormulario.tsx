import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useCarga } from '../../hooks/useCarga';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import type { PrestadorServico, Unidade } from '../../types';
import { semAlteracoes } from '../../utils/form';
import { ROTULO_PERFIL } from '../../utils/format';
import type { UsuarioLista } from './Usuarios';

const VAZIO = { nome: '', email: '', matricula: '', perfil: '', unidadeId: '', prestadorId: '', ativo: true };

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
        });
      } else {
        // Cadastro prévio: só e-mail e perfil (mais unidade ou prestador, quando o perfil exige)
        await api.post('/usuarios', {
          email: form.email,
          perfil: form.perfil,
          unidadeId: form.perfil === 'UNIDADE' || form.perfil === 'GALPAO' ? form.unidadeId || null : null,
          prestadorId: form.perfil === 'TERCEIRIZADA' ? form.prestadorId || null : null,
        });
      }
      void navigate('/configuracoes/usuarios', { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar o usuário.');
      setEnviando(false);
    }
  }

  const bloqueado = carregando || Boolean(falha) || naoEncontrado;

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
        </div>
      </section>
    </PaginaCadastro>
  );
}
