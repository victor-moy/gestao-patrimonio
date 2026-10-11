import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ListaCadastro } from '../../components/ListaCadastro';
import { IconeEntrarComo } from '../../components/icons';
import { useAlertaNativo } from '../../hooks/useAlertaNativo';
import type { Usuario } from '../../types';
import { ROTULO_PERFIL } from '../../utils/format';

export interface UsuarioLista extends Usuario {
  unidade?: { nome: string } | null;
  ativo: boolean;
}

const VISUALIZACOES = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'ativo', rotulo: 'Ativos' },
  { valor: 'inativo', rotulo: 'Inativos' },
];

export function Usuarios() {
  const { usuario, impersonando, entrarComo } = useAuth();
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroEntrar, setErroEntrar] = useState<string | null>(null);
  useAlertaNativo(erroEntrar, () => setErroEntrar(null));
  const [entrandoId, setEntrandoId] = useState<string | null>(null);
  const podeImpersonar = usuario?.perfil === 'GESTOR_PATRIMONIO' && !impersonando;

  function carregar() {
    setCarregando(true);
    setErro(null);
    api
      .get<UsuarioLista[]>('/usuarios')
      .then(setUsuarios)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os usuários.'))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  // Assume a visão do usuário com um clique (só Gestor de Patrimônio; a ação é auditada no backend)
  async function entrar(alvo: UsuarioLista) {
    if (entrandoId) return;
    setEntrandoId(alvo.id);
    try {
      await entrarComo(alvo.id);
      navigate('/');
    } catch (e) {
      setErroEntrar(e instanceof Error ? e.message : 'Não foi possível entrar como este usuário.');
      setEntrandoId(null);
    }
  }

  return (
      <ListaCadastro
        id="usuarios"
        titulo="Usuários"
        nomes={{
          singular: 'usuário',
          plural: 'usuários',
          nenhum: 'Nenhum usuário cadastrado',
          nenhumEncontrado: 'Nenhum usuário encontrado',
        }}
        acoes={
          <Link to="/configuracoes/usuarios/novo" className="btn btn-primary">
            Novo usuário
          </Link>
        }
        itens={usuarios}
        carregando={carregando}
        erro={erro}
        onRecarregar={carregar}
        chave={(u) => u.id}
        textoBusca={(u) => [u.nome, u.email, u.matricula]}
        visualizacoes={VISUALIZACOES}
        correspondeVisualizacao={(u, valor) => (valor === 'ativo' ? u.ativo : !u.ativo)}
        colunas={[
          {
            titulo: 'Usuário',
            celula: (u) => (
              <>
                <div className="usuario-nome-linha">
                  <Link
                    className="inventario-equipamento-link"
                    to={`/configuracoes/usuarios/${u.id}`}
                    aria-label={`Editar usuário ${u.nome}`}
                  >
                    {u.nome}
                  </Link>
                  {podeImpersonar && u.ativo && u.id !== usuario?.id && (
                    <button
                      type="button"
                      className="icone-acao"
                      onClick={() => entrar(u)}
                      disabled={entrandoId !== null}
                      aria-label={`Entrar como ${u.nome}`}
                      title="Entrar como este usuário"
                    >
                      <IconeEntrarComo />
                    </button>
                  )}
                </div>
                <div className="cadastro-sub">{u.email}</div>
              </>
            ),
          },
          { titulo: 'Matrícula', celula: (u) => u.matricula },
          {
            titulo: 'Perfil',
            celula: (u) => (
              <>
                <div>{ROTULO_PERFIL[u.perfil]}</div>
                <div className="cadastro-sub">{u.unidade?.nome ?? 'Secretaria'}</div>
              </>
            ),
          },
          {
            titulo: 'Status',
            celula: (u) => (
              <span className={`inventario-status inventario-status--tom-${u.ativo ? 'green' : 'gray'}`}>
                <span aria-hidden />
                {u.ativo ? 'Ativo' : 'Inativo'}
              </span>
            ),
          },
        ]}
      />
  );
}
