import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { PaginaCadastro } from '../../components/PaginaCadastro';
import { useCarga } from '../../hooks/useCarga';
import { useMensagemTemporaria } from '../../hooks/useMensagemTemporaria';
import type { Unidade } from '../../types';
import { semAlteracoes } from '../../utils/form';
import { ROTULO_PERFIL } from '../../utils/format';
import type { UsuarioLista } from './Usuarios';

const VAZIO = { nome: '', email: '', matricula: '', senha: '', perfil: 'UNIDADE', unidadeId: '', ativo: true };

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
      const [unidades, usuarios] = await Promise.all([
        api.get<Unidade[]>('/unidades'),
        editando ? api.get<UsuarioLista[]>('/usuarios') : Promise.resolve([] as UsuarioLista[]),
      ]);
      return { unidades, usuarios };
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
      senha: '',
      perfil: encontrado.perfil,
      unidadeId: encontrado.unidadeId ?? '',
      ativo: encontrado.ativo,
    };
    setUsuario(encontrado);
    setInicial(valores);
    setForm(valores);
  }, [dados, editando, id]);

  function voltar() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/configuracoes/usuarios');
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
          ativo: form.ativo,
          ...(form.senha ? { senha: form.senha } : {}),
        });
      } else {
        await api.post('/usuarios', { ...form, unidadeId: form.unidadeId || null });
      }
      navigate('/configuracoes/usuarios', { replace: true });
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
          <div className="field">
            <label htmlFor="usuario-matricula">Matrícula</label>
            <input
              id="usuario-matricula"
              value={form.matricula}
              onChange={(e) => setForm({ ...form, matricula: e.target.value })}
              disabled={editando || bloqueado}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="usuario-senha">{editando ? 'Nova senha' : 'Senha'}</label>
            <input
              id="usuario-senha"
              type="password"
              minLength={6}
              autoComplete="new-password"
              placeholder={editando ? 'Preencha só para redefinir' : undefined}
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              disabled={bloqueado}
              required={!editando}
            />
          </div>
          <div className="field">
            <label htmlFor="usuario-perfil">Perfil de acesso</label>
            <select
              id="usuario-perfil"
              value={form.perfil}
              onChange={(e) => setForm({ ...form, perfil: e.target.value })}
              disabled={bloqueado}
            >
              {Object.entries(ROTULO_PERFIL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="usuario-unidade">Unidade</label>
            <select
              id="usuario-unidade"
              value={form.unidadeId}
              onChange={(e) => setForm({ ...form, unidadeId: e.target.value })}
              disabled={bloqueado}
              required={form.perfil === 'UNIDADE' || form.perfil === 'GALPAO'}
            >
              <option value="">Secretaria (sem unidade)</option>
              {(dados?.unidades ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
          {editando && (
            <div className="field novo-equipamento-largura-total">
              <label className="campo-checkbox">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  disabled={bloqueado}
                />
                Usuário ativo
              </label>
            </div>
          )}
        </div>
      </section>
    </PaginaCadastro>
  );
}
