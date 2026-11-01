import { useId, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useAlertaNativo } from '../hooks/useAlertaNativo';
import type { Perfil } from '../types';
import { ROTULO_PERFIL } from '../utils/format';
import { IconeChevron, IconeUsuarios } from './icons';

interface UsuarioImpersonavel {
  id: string;
  nome: string;
  perfil: Perfil;
  // O próprio administrador (da conta de origem): serve para voltar a ela depois de assumir outro usuário
  proprio: boolean;
  unidadeNome: string | null;
  prestadorNome: string | null;
}

// Item do menu do usuário que abre a lista de quem o administrador pode assumir ("entrar como"). Começa recolhido e só
// busca a lista na primeira vez que abre. A ação é auditada no backend.
export function EntrarComoMenu({ aoEntrar }: { aoEntrar: () => void }) {
  const { entrarComo, voltarAoMestre, impersonando } = useAuth();
  const idLista = useId();
  const [aberto, setAberto] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioImpersonavel[] | null>(null);
  const [falha, setFalha] = useState(false);
  const [busca, setBusca] = useState('');
  const [entrandoId, setEntrandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useAlertaNativo(erro, () => setErro(null));

  function carregar() {
    setFalha(false);
    setUsuarios(null);
    api
      .get<UsuarioImpersonavel[]>('/auth/impersonaveis', { comoMestre: impersonando })
      .then(setUsuarios)
      .catch(() => setFalha(true));
  }

  function alternar() {
    if (!aberto && usuarios === null && !falha) carregar();
    setAberto((v) => !v);
  }

  const visiveis = useMemo(() => {
    const alvo = busca.trim().toLowerCase();
    return (usuarios ?? []).filter(
      (u) => !alvo || [u.nome, ROTULO_PERFIL[u.perfil], u.unidadeNome, u.prestadorNome].some((v) => v?.toLowerCase().includes(alvo)),
    );
  }, [usuarios, busca]);

  async function entrar(alvo: UsuarioImpersonavel) {
    if (entrandoId) return;
    setEntrandoId(alvo.id);
    try {
      if (alvo.proprio) await voltarAoMestre();
      else await entrarComo(alvo.id);
      aoEntrar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar como este usuário.');
      setEntrandoId(null);
    }
  }

  return (
    <div className="user-menu-entrar">
      <button
        type="button"
        className="user-menu-alternar"
        aria-expanded={aberto}
        aria-controls={idLista}
        onClick={alternar}
      >
        <IconeUsuarios /> Entrar como
        <span className={`user-menu-seta${aberto ? ' user-menu-seta--aberta' : ''}`} aria-hidden>
          <IconeChevron />
        </span>
      </button>
      <div id={idLista} role="group" aria-label="Entrar como" hidden={!aberto}>
        {aberto && (
          <>
            <input
              type="search"
              className="user-menu-busca"
              aria-label="Buscar usuário"
              placeholder="Buscar usuário"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <div className="user-menu-lista">
              {usuarios === null && !falha && (
                <span className="user-menu-estado" role="status">
                  Carregando…
                </span>
              )}
              {falha && (
                <span className="user-menu-estado" role="alert">
                  Não foi possível carregar os usuários.{' '}
                  <button type="button" className="user-menu-link" onClick={carregar}>
                    Tentar novamente
                  </button>
                </span>
              )}
              {usuarios !== null && visiveis.length === 0 && (
                <span className="user-menu-estado" role="status">
                  Nenhum usuário encontrado
                </span>
              )}
              {visiveis.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="user-menu-usuario"
                  // Fora de uma troca, a própria conta é a atual: aparece, mas não há para onde voltar
                  disabled={entrandoId !== null || (u.proprio && !impersonando)}
                  onClick={() => void entrar(u)}
                  aria-label={u.proprio ? `Voltar para ${u.nome}` : `Entrar como ${u.nome}`}
                >
                  <span className="user-menu-usuario-nome">{u.nome}</span>
                  <span className="user-menu-usuario-apoio">
                    {u.proprio
                      ? impersonando
                        ? 'Voltar à sua conta'
                        : 'Conta atual'
                      : `${ROTULO_PERFIL[u.perfil]}${u.unidadeNome ? ` · ${u.unidadeNome}` : u.prestadorNome ? ` · ${u.prestadorNome}` : ''}`}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
