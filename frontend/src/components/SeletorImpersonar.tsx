import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ROTULO_PERFIL } from '../utils/format';
import { Modal } from './Modal';
import type { Usuario } from '../types';

interface UsuarioLista extends Usuario {
  ativo: boolean;
}

// Só o Gestor de Patrimônio vê isso — facilita testar os outros perfis sem
// precisar deslogar e logar de novo com outra conta.
export function SeletorImpersonar({ onFechar }: { onFechar: () => void }) {
  const { entrarComo } = useAuth();
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.get<UsuarioLista[]>('/usuarios').then(setUsuarios).catch(() => {});
  }, []);

  const alvo = busca.toLowerCase();
  const filtrados = usuarios.filter(
    (u) =>
      u.ativo &&
      (u.nome.toLowerCase().includes(alvo) ||
        u.email.toLowerCase().includes(alvo) ||
        ROTULO_PERFIL[u.perfil].toLowerCase().includes(alvo)),
  );

  async function selecionar(u: UsuarioLista) {
    setErro(null);
    setCarregando(u.id);
    try {
      await entrarComo(u.id);
      onFechar();
      navigate('/');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao entrar como este usuário');
    } finally {
      setCarregando(null);
    }
  }

  return (
    <Modal titulo="Entrar como..." subtitulo="Só pra testar — dá pra voltar depois" onFechar={onFechar}>
      {erro && <div className="error-banner toast-erro">{erro}</div>}
      <input
        className="search"
        style={{ width: '100%', marginBottom: 14 }}
        placeholder="Buscar por nome, e-mail ou perfil..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        autoFocus
      />
      <div className="request-list" style={{ maxHeight: 360, overflowY: 'auto' }}>
        {filtrados.map((u) => (
          <div
            key={u.id}
            className="request-item"
            style={{ cursor: carregando ? 'wait' : 'pointer', opacity: carregando && carregando !== u.id ? 0.5 : 1 }}
            onClick={() => !carregando && selecionar(u)}
          >
            <div>
              <div className="request-title">{u.nome}</div>
              <div className="request-sub">
                {ROTULO_PERFIL[u.perfil]}
                {u.unidadeNome && <> · {u.unidadeNome}</>}
              </div>
              <div className="request-desc">{u.email}</div>
            </div>
          </div>
        ))}
        {filtrados.length === 0 && <div className="empty-state">Nenhum usuário encontrado</div>}
      </div>
    </Modal>
  );
}
