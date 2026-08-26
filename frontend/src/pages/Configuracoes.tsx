import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, urlArquivo } from '../api/client';
import { Modal } from '../components/Modal';
import { TextoTruncado } from '../components/TextoTruncado';
import {
  IconeAlerta,
  IconeAtas,
  IconeBusca,
  IconeCaixa,
  IconeCalendario,
  IconeContratos,
  IconeDinheiro,
  IconeEmail,
  IconeInventario,
  IconeLapis,
  IconeLixeira,
  IconePin,
  IconeUnidades,
  IconeUsuario,
  IconeUsuarios,
} from '../components/icons';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { semAlteracoes } from '../utils/form';
import type { Ata, Categoria, Contrato, TipoEquipamento, Unidade, Usuario } from '../types';
import { formatarData, formatarMoeda, ROTULO_PERFIL, ROTULO_TIPO_UNIDADE } from '../utils/format';

type Secao = 'usuarios' | 'unidades' | 'equipamentos' | 'atas' | 'contratos';

const SECOES: Array<{ id: Secao; titulo: string; sub: string; icone: JSX.Element }> = [
  { id: 'usuarios', titulo: 'Usuários', sub: 'Gerenciar acessos', icone: <IconeUsuarios /> },
  { id: 'unidades', titulo: 'Unidades', sub: 'Gerenciar unidades', icone: <IconeUnidades /> },
  { id: 'equipamentos', titulo: 'Equipamentos', sub: 'Categorias e Tipos', icone: <IconeInventario /> },
  { id: 'atas', titulo: 'Atas de Registro', sub: 'Controle de atas', icone: <IconeAtas /> },
  { id: 'contratos', titulo: 'Contratos', sub: 'Manutenção e Serviços', icone: <IconeContratos /> },
];

// Frame "Configurações do Sistema" do Figma — modal sobre a aplicação
export function Configuracoes() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const secao = (params.get('secao') as Secao) ?? 'usuarios';
  const background = (location.state as { background?: unknown } | null)?.background;

  function trocarSecao(nova: Secao) {
    // preserva o state para a página de origem continuar renderizada atrás
    setParams({ secao: nova }, { replace: true, state: location.state });
  }

  function fechar() {
    // volta para a página que estava aberta atrás do modal
    if (background) navigate(-1);
    else navigate('/');
  }

  return (
    <div className="config-overlay" onClick={fechar} role="presentation">
      <div className="config-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Configurações do Sistema">
        <div className="config-header">
          <div>
            <h2>Configurações do Sistema</h2>
            <p>Gerenciar dados mestres e usuários</p>
          </div>
          <button className="modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="config-corpo">
          <aside className="config-sidebar">
            {SECOES.map((s) => (
              <button
                key={s.id}
                className={`config-sidebar-item${secao === s.id ? ' active' : ''}`}
                onClick={() => trocarSecao(s.id)}
              >
                {s.icone}
                <span>
                  <span className="csi-titulo">{s.titulo}</span>
                  <br />
                  <span className="csi-sub">{s.sub}</span>
                </span>
              </button>
            ))}
          </aside>
          <div className="config-conteudo">
            {secao === 'usuarios' && <SecaoUsuarios />}
            {secao === 'unidades' && <SecaoUnidades />}
            {secao === 'equipamentos' && <SecaoEquipamentos />}
            {secao === 'atas' && <SecaoAtas />}
            {secao === 'contratos' && <SecaoContratos />}
          </div>
        </div>
      </div>
    </div>
  );
}

function useFeedback() {
  const [mensagem, setMensagem] = useMensagemTemporaria();
  const [erro, setErro] = useMensagemTemporaria();
  return {
    mensagem,
    erro,
    sucesso: (m: string) => {
      setMensagem(m);
      setErro(null);
    },
    falha: (e: unknown) => setErro(e instanceof Error ? e.message : 'Erro'),
    banners: (
      <>
        {mensagem && <div className="success-banner toast-sucesso">{mensagem}</div>}
        {erro && <div className="error-banner toast-erro">{erro}</div>}
      </>
    ),
  };
}

/* ================= Usuários ================= */

interface UsuarioLista extends Usuario {
  unidade?: { nome: string } | null;
  ativo: boolean;
}

function SecaoUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<UsuarioLista | 'novo' | null>(null);
  const fb = useFeedback();

  const carregar = useCallback(() => {
    api.get<UsuarioLista[]>('/usuarios').then(setUsuarios).catch(fb.falha);
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtrados = usuarios.filter(
    (u) =>
      !busca ||
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      u.email.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <>
      <div className="config-secao-header">
        <div>
          <h3>Gerenciar Usuários</h3>
          <p>Cadastre usuários e atribua perfis de acesso</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditando('novo')}>
          + Novo Usuário
        </button>
      </div>
      {fb.banners}
      <div className="config-busca">
        <IconeBusca />
        <input
          placeholder="Buscar por nome ou e-mail..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      <div className="card tabela-scroll" style={{ boxShadow: "none" }}>
        <table>
          <colgroup>
            <col style={{ width: '40%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '29%' }} />
            <col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Matrícula</th>
              <th>Perfil</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((u) => (
              <tr key={u.id} className="clickable" onClick={() => setEditando(u)}>
                <td>
                  <div style={{ fontWeight: 600 }}>{u.nome}</div>
                  <div className="celula-sub">{u.email}</div>
                </td>
                <td>{u.matricula}</td>
                <td>
                  <div>{ROTULO_PERFIL[u.perfil]}</div>
                  <div className="celula-sub">{u.unidade?.nome ?? 'Secretaria'}</div>
                </td>
                <td>
                  <span className={`badge badge-${u.ativo ? 'green' : 'gray'}`}>
                    {u.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">Nenhum usuário encontrado</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <FormUsuario
          usuario={editando === 'novo' ? null : editando}
          unidades={unidades}
          onFechar={() => setEditando(null)}
          onSucesso={(msg) => {
            setEditando(null);
            fb.sucesso(msg);
            carregar();
          }}
        />
      )}
    </>
  );
}

function FormUsuario({
  usuario,
  unidades,
  onFechar,
  onSucesso,
}: {
  usuario: UsuarioLista | null;
  unidades: Unidade[];
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [erro, setErro] = useMensagemTemporaria();
  const inicial = {
    nome: usuario?.nome ?? '',
    email: usuario?.email ?? '',
    matricula: usuario?.matricula ?? '',
    senha: '',
    perfil: usuario?.perfil ?? 'UNIDADE',
    unidadeId: usuario?.unidadeId ?? '',
    ativo: usuario?.ativo ?? true,
  };
  const [form, setForm] = useState(inicial);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (usuario && semAlteracoes(inicial, form)) {
      onFechar();
      return;
    }
    try {
      if (usuario) {
        await api.patch(`/usuarios/${usuario.id}`, {
          nome: form.nome,
          perfil: form.perfil,
          unidadeId: form.unidadeId || null,
          ativo: form.ativo,
          ...(form.senha ? { senha: form.senha } : {}),
        });
        onSucesso('Usuário atualizado.');
      } else {
        await api.post('/usuarios', { ...form, unidadeId: form.unidadeId || null });
        onSucesso('Usuário cadastrado.');
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <Modal titulo={usuario ? 'Editar Usuário' : 'Novo Usuário'} onFechar={onFechar}>
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="field">
          <label>Nome Completo *</label>
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        </div>
        <div className="field">
          <label>E-mail *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            disabled={!!usuario}
            required
          />
        </div>
        <div className="field">
          <label>Matrícula *</label>
          <input
            value={form.matricula}
            onChange={(e) => setForm({ ...form, matricula: e.target.value })}
            disabled={!!usuario}
            required
          />
        </div>
        <div className="field">
          <label>Perfil de Acesso *</label>
          <select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as never })}>
            {Object.entries(ROTULO_PERFIL).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Unidade {form.perfil === 'UNIDADE' || form.perfil === 'GALPAO' ? '*' : ''}</label>
          <select value={form.unidadeId ?? ''} onChange={(e) => setForm({ ...form, unidadeId: e.target.value })}>
            <option value="">Secretaria (sem unidade)</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        {!usuario && (
          <div className="field">
            <label>Senha *</label>
            <input
              type="password"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              minLength={6}
              required
            />
          </div>
        )}
        <div className="field">
          <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Usuário ativo
          </label>
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={semAlteracoes(inicial, form)}
          >
            {usuario ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================= Unidades ================= */

function SecaoUnidades() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Unidade | 'nova' | null>(null);
  const fb = useFeedback();

  const carregar = useCallback(() => {
    api.get<Unidade[]>('/unidades?incluirInativos=true').then(setUnidades).catch(fb.falha);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function excluir(unidade: Unidade) {
    if (!window.confirm(`Excluir a unidade "${unidade.nome}"?`)) return;
    try {
      await api.delete(`/unidades/${unidade.id}`);
      fb.sucesso('Unidade excluída.');
      carregar();
    } catch (e) {
      fb.falha(e);
    }
  }

  return (
    <>
      <div className="config-secao-header">
        <div>
          <h3>Gerenciar Unidades</h3>
          <p>Cadastre e organize as unidades da rede de saúde</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditando('nova')}>
          + Nova Unidade
        </button>
      </div>
      {fb.banners}
      <div className="config-busca">
        <IconeBusca />
        <input
          placeholder="Buscar por nome, tipo ou responsável..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      <div className="config-cards">
        {unidades
          .filter(
            (u) =>
              !busca ||
              [u.nome, u.tipo, u.responsavel?.nome, u.emailBase].some((v) =>
                v?.toLowerCase().includes(busca.toLowerCase()),
              ),
          )
          .map((u) => (
            <div key={u.id} className="config-card">
              <div className="cc-topo">
                <div className="cc-nome-area">
                  <div className="cc-nome">
                    <TextoTruncado texto={u.nome} />
                  </div>
                  <div className="cc-sub">{ROTULO_TIPO_UNIDADE[u.tipo] ?? u.tipo}</div>
                </div>
              </div>
              <div className="cc-divisor" />
              {u.endereco && (
                <div className="cc-info-linha">
                  <IconePin />
                  <TextoTruncado texto={u.endereco} />
                </div>
              )}
              {u.emailBase && (
                <div className="cc-info-linha">
                  <IconeEmail />
                  <TextoTruncado texto={u.emailBase} />
                </div>
              )}
              {u.responsavel && (
                <div className="cc-info-linha">
                  <IconeUsuario />
                  <TextoTruncado texto={u.responsavel.nome} />
                </div>
              )}
              <div className="cc-rodape">
                <span className={`badge badge-${u.ativo ? 'green' : 'gray'}`}>
                  {u.ativo ? 'Ativa' : 'Inativa'}
                </span>
                <button className="btn-icone" onClick={() => setEditando(u)} aria-label={`Editar ${u.nome}`}>
                  <IconeLapis />
                </button>
                <button className="btn-icone perigo" onClick={() => excluir(u)} aria-label={`Excluir ${u.nome}`}>
                  <IconeLixeira />
                </button>
              </div>
            </div>
          ))}
        {unidades.length === 0 && <div className="empty-state">Nenhuma unidade cadastrada</div>}
      </div>
      {editando && (
        <FormUnidade
          unidade={editando === 'nova' ? null : editando}
          onFechar={() => setEditando(null)}
          onSucesso={(msg) => {
            setEditando(null);
            fb.sucesso(msg);
            carregar();
          }}
        />
      )}
    </>
  );
}

function FormUnidade({
  unidade,
  onFechar,
  onSucesso,
}: {
  unidade: Unidade | null;
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [erro, setErro] = useMensagemTemporaria();
  const [usuarios, setUsuarios] = useState<UsuarioLista[]>([]);
  const inicial = {
    nome: unidade?.nome ?? '',
    tipo: unidade?.tipo ?? 'UBSF',
    endereco: unidade?.endereco ?? '',
    emailBase: unidade?.emailBase ?? '',
    responsavelId: unidade?.responsavel?.id ?? unidade?.responsavelId ?? '',
    ativo: unidade?.ativo ?? true,
  };
  const [form, setForm] = useState(inicial);

  useEffect(() => {
    api.get<UsuarioLista[]>('/usuarios').then(setUsuarios).catch(() => {});
  }, []);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (unidade && semAlteracoes(inicial, form)) {
      onFechar();
      return;
    }
    const payload = {
      nome: form.nome,
      tipo: form.tipo,
      endereco: form.endereco || null,
      emailBase: form.emailBase || null,
      responsavelId: form.responsavelId || null,
    };
    try {
      if (unidade) {
        await api.patch(`/unidades/${unidade.id}`, { ...payload, ativo: form.ativo });
        onSucesso('Unidade atualizada.');
      } else {
        await api.post('/unidades', payload);
        onSucesso('Unidade cadastrada.');
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <Modal titulo={unidade ? 'Editar Unidade' : 'Nova Unidade'} onFechar={onFechar}>
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="field">
          <label>Nome da Unidade *</label>
          <input
            placeholder="Ex: UBS Aventureiro"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Tipo *</label>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as never })}>
            {Object.entries(ROTULO_TIPO_UNIDADE).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Endereço *</label>
          <input
            value={form.endereco}
            onChange={(e) => setForm({ ...form, endereco: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>E-mail *</label>
          <input
            type="email"
            placeholder="Ex: unidade@joinville.sc.gov.br"
            value={form.emailBase}
            onChange={(e) => setForm({ ...form, emailBase: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Responsável *</label>
          <select
            value={form.responsavelId}
            onChange={(e) => setForm({ ...form, responsavelId: e.target.value })}
            required
          >
            <option value="">Selecione um usuário...</option>
            {usuarios
              .filter((u) => u.ativo)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} — {u.email}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Unidade ativa
          </label>
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={semAlteracoes(inicial, form)}
          >
            {unidade ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================= Equipamentos (Categorias e Tipos) ================= */

function SecaoEquipamentos() {
  const [aba, setAba] = useState<'categorias' | 'tipos'>('categorias');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tipos, setTipos] = useState<TipoEquipamento[]>([]);
  const [buscaCategoria, setBuscaCategoria] = useState('');
  const [buscaTipo, setBuscaTipo] = useState('');
  const [editandoCategoria, setEditandoCategoria] = useState<Categoria | 'nova' | null>(null);
  const [editandoTipo, setEditandoTipo] = useState<TipoEquipamento | 'novo' | null>(null);
  const fb = useFeedback();

  const carregar = useCallback(() => {
    api.get<Categoria[]>('/categorias').then(setCategorias).catch(fb.falha);
    api.get<TipoEquipamento[]>('/categorias/tipos').then(setTipos).catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function excluirCategoria(c: Categoria) {
    if (!window.confirm(`Excluir a categoria "${c.nome}"?`)) return;
    try {
      await api.delete(`/categorias/${c.id}`);
      fb.sucesso('Categoria excluída.');
      carregar();
    } catch (e) {
      fb.falha(e);
    }
  }

  async function excluirTipo(t: TipoEquipamento) {
    if (!window.confirm(`Excluir o tipo "${t.nome}"?`)) return;
    try {
      await api.delete(`/categorias/tipos/${t.id}`);
      fb.sucesso('Tipo excluído.');
      carregar();
    } catch (e) {
      fb.falha(e);
    }
  }

  return (
    <>
      <div className="config-secao-header">
        <div>
          <h3>Gerenciar Equipamentos</h3>
          <p>Organize categorias e tipos de equipamentos</p>
        </div>
        {aba === 'categorias' ? (
          <button className="btn btn-primary" onClick={() => setEditandoCategoria('nova')}>
            + Nova Categoria
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => setEditandoTipo('novo')}>
            + Novo Tipo
          </button>
        )}
      </div>
      <div className="inner-tabs">
        <button
          className={`inner-tab${aba === 'categorias' ? ' active' : ''}`}
          onClick={() => setAba('categorias')}
        >
          Categorias
        </button>
        <button
          className={`inner-tab${aba === 'tipos' ? ' active' : ''}`}
          onClick={() => setAba('tipos')}
        >
          Tipos de Equipamentos
        </button>
      </div>
      {fb.banners}
      {aba === 'categorias' ? (
        <>
          <div className="config-busca">
            <IconeBusca />
            <input
              placeholder="Buscar por nome ou descrição..."
              value={buscaCategoria}
              onChange={(e) => setBuscaCategoria(e.target.value)}
            />
          </div>
          <div className="config-cards">
            {categorias
              .filter(
                (c) =>
                  !buscaCategoria ||
                  [c.nome, c.descricao].some((v) =>
                    v?.toLowerCase().includes(buscaCategoria.toLowerCase()),
                  ),
              )
              .map((c) => (
                <div key={c.id} className="config-card">
                  <div className="cc-topo">
                    <div
                      className="cc-icone"
                      style={c.cor ? { background: `${c.cor}1f`, color: c.cor } : undefined}
                    >
                      <IconeInventario />
                    </div>
                    <div>
                      <div className="cc-nome">{c.nome}</div>
                      <div className="cc-sub">{c.tipos.length} tipo(s)</div>
                    </div>
                  </div>
                  {c.descricao && <div className="cc-linha">{c.descricao}</div>}
                  <div className="cc-acoes">
                    <button className="btn btn-outline btn-sm" onClick={() => setEditandoCategoria(c)}>
                      <IconeLapis /> Editar
                    </button>
                    <button className="btn btn-excluir btn-sm" onClick={() => excluirCategoria(c)}>
                      <IconeLixeira /> Excluir
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </>
      ) : (
        <>
          <div className="config-busca">
            <IconeBusca />
            <input
              placeholder="Buscar por código, tipo, categoria ou descrição..."
              value={buscaTipo}
              onChange={(e) => setBuscaTipo(e.target.value)}
            />
          </div>
          <div className="card tabela-scroll" style={{ boxShadow: "none" }}>
            <table>
              <colgroup>
                <col style={{ width: '12%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo / Categoria</th>
                  <th>Descrição</th>
                  <th>Preço</th>
                  <th>QTD</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {tipos
                  .filter(
                    (t) =>
                      !buscaTipo ||
                      [t.codigo, t.nome, t.categoria?.nome, t.descricao].some((v) =>
                        v?.toLowerCase().includes(buscaTipo.toLowerCase()),
                      ),
                  )
                  .map((t) => (
                  <tr key={t.id}>
                    <td>{t.codigo}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.nome}</div>
                      {t.categoria?.nome && <div className="celula-sub">{t.categoria.nome}</div>}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{t.descricao ?? '—'}</td>
                    <td>{formatarMoeda(t.preco)}</td>
                    <td>{t.quantidadeEquipamentos ?? 0}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icone" onClick={() => setEditandoTipo(t)} aria-label="Editar">
                          <IconeLapis />
                        </button>
                        <button className="btn-icone perigo" onClick={() => excluirTipo(t)} aria-label="Excluir">
                          <IconeLixeira />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editandoCategoria && (
        <FormCategoria
          categoria={editandoCategoria === 'nova' ? null : editandoCategoria}
          onFechar={() => setEditandoCategoria(null)}
          onSucesso={(msg) => {
            setEditandoCategoria(null);
            fb.sucesso(msg);
            carregar();
          }}
        />
      )}
      {editandoTipo && (
        <FormTipo
          tipo={editandoTipo === 'novo' ? null : editandoTipo}
          categorias={categorias}
          onFechar={() => setEditandoTipo(null)}
          onSucesso={(msg) => {
            setEditandoTipo(null);
            fb.sucesso(msg);
            carregar();
          }}
        />
      )}
    </>
  );
}

function FormCategoria({
  categoria,
  onFechar,
  onSucesso,
}: {
  categoria: Categoria | null;
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [erro, setErro] = useMensagemTemporaria();
  const inicial = {
    nome: categoria?.nome ?? '',
    descricao: categoria?.descricao ?? '',
    cor: categoria?.cor ?? '#0d4f7e',
  };
  const [form, setForm] = useState(inicial);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (categoria && semAlteracoes(inicial, form)) {
      onFechar();
      return;
    }
    const payload = { nome: form.nome, descricao: form.descricao || null, cor: form.cor };
    try {
      if (categoria) {
        await api.patch(`/categorias/${categoria.id}`, payload);
        onSucesso('Categoria atualizada.');
      } else {
        await api.post('/categorias', payload);
        onSucesso('Categoria cadastrada.');
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <Modal titulo={categoria ? 'Editar Categoria' : 'Nova Categoria'} onFechar={onFechar}>
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="field">
          <label>Nome da Categoria *</label>
          <input
            placeholder="Ex: Esterilização"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Descrição</label>
          <textarea
            rows={3}
            placeholder="Descreva a categoria..."
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Cor de Identificação</label>
          <div className="campo-cor">
            <input
              type="color"
              value={form.cor}
              onChange={(e) => setForm({ ...form, cor: e.target.value })}
            />
            <span className="cor-hex">{form.cor}</span>
          </div>
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={semAlteracoes(inicial, form)}
          >
            {categoria ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FormTipo({
  tipo,
  categorias,
  onFechar,
  onSucesso,
}: {
  tipo: TipoEquipamento | null;
  categorias: Categoria[];
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [erro, setErro] = useMensagemTemporaria();
  const inicial = {
    codigo: tipo?.codigo ?? '',
    nome: tipo?.nome ?? '',
    categoriaId: tipo?.categoriaId ?? '',
    descricao: tipo?.descricao ?? '',
    preco: tipo?.preco ?? '',
  };
  const [form, setForm] = useState(inicial);
  const [imagemAtual, setImagemAtual] = useState(tipo?.imagemUrl ?? null);
  const [arquivoImagem, setArquivoImagem] = useState<File | null>(null);
  const [previewImagem, setPreviewImagem] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputImagem = useRef<HTMLInputElement>(null);

  function selecionarImagem(arquivo: File) {
    setArquivoImagem(arquivo);
    setPreviewImagem(URL.createObjectURL(arquivo));
  }

  async function removerImagemAtual() {
    if (!tipo || !window.confirm('Remover a imagem deste tipo de equipamento?')) return;
    try {
      await api.delete(`/categorias/tipos/${tipo.id}/imagem`);
      setImagemAtual(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao remover imagem');
    }
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (tipo && semAlteracoes(inicial, form) && !arquivoImagem) {
      onFechar();
      return;
    }
    const payload = {
      ...form,
      descricao: form.descricao || null,
      preco: form.preco === '' ? null : Number(form.preco),
    };
    setEnviando(true);
    try {
      const salvo = tipo
        ? await api.patch<TipoEquipamento>(`/categorias/tipos/${tipo.id}`, payload)
        : await api.post<TipoEquipamento>('/categorias/tipos', payload);
      if (arquivoImagem) {
        const dadosImagem = new FormData();
        dadosImagem.append('imagem', arquivoImagem);
        await api.post(`/categorias/tipos/${salvo.id}/imagem`, dadosImagem);
      }
      onSucesso(tipo ? 'Tipo atualizado.' : 'Tipo cadastrado.');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={tipo ? 'Editar Tipo de Equipamento' : 'Novo Tipo de Equipamento'} onFechar={onFechar}>
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="field">
          <label>Imagem do Equipamento</label>
          <div className="imagem-upload">
            <div className="imagem-upload-preview">
              {previewImagem || imagemAtual ? (
                <img src={previewImagem ?? urlArquivo(imagemAtual!)} alt="" />
              ) : (
                <IconeCaixa />
              )}
            </div>
            <div className="imagem-upload-acoes">
              <input
                ref={inputImagem}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) selecionarImagem(arquivo);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => inputImagem.current?.click()}
              >
                {imagemAtual || previewImagem ? 'Trocar imagem' : 'Selecionar imagem'}
              </button>
              {tipo && imagemAtual && !previewImagem && (
                <button type="button" className="btn btn-excluir btn-sm" onClick={removerImagemAtual}>
                  Remover
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="field">
          <label>Código *</label>
          <input
            placeholder="Ex: AUT-V50"
            value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Nome do Equipamento *</label>
          <input
            placeholder="Ex: Autoclave Vertical 50L"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Categoria *</label>
          <select
            value={form.categoriaId}
            onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}
            required
          >
            <option value="">Selecione...</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Descrição</label>
          <textarea
            rows={3}
            placeholder="Descreva o tipo de equipamento..."
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Preço de Referência (R$)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Opcional"
            value={form.preco}
            onChange={(e) => setForm({ ...form, preco: e.target.value })}
          />
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={enviando || (semAlteracoes(inicial, form) && !arquivoImagem)}
          >
            {enviando ? 'Salvando...' : tipo ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================= Atas de Registro ================= */

function SecaoAtas() {
  const [atas, setAtas] = useState<Ata[]>([]);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Ata | 'nova' | null>(null);
  const fb = useFeedback();

  const carregar = useCallback(() => {
    api.get<Ata[]>('/atas').then(setAtas).catch(fb.falha);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <>
      <div className="config-secao-header">
        <div>
          <h3>Gerenciar Atas de Registro</h3>
          <p>Controle saldo e vencimento das atas</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditando('nova')}>
          + Nova Ata
        </button>
      </div>
      {fb.banners}
      <div className="config-busca">
        <IconeBusca />
        <input
          placeholder="Buscar por número ou fornecedor..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      {atas
        .filter(
          (a) =>
            !busca ||
            [a.numero, a.fornecedor].some((v) =>
              v?.toLowerCase().includes(busca.toLowerCase()),
            ),
        )
        .map((ata) => (
          <CardAta key={ata.id} ata={ata} onEditar={() => setEditando(ata)} />
        ))}
      {atas.length === 0 && <div className="empty-state">Nenhuma ata cadastrada</div>}
      {editando && (
        <FormAta
          ata={editando === 'nova' ? null : editando}
          onFechar={() => setEditando(null)}
          onSucesso={(msg) => {
            setEditando(null);
            fb.sucesso(msg);
            carregar();
          }}
        />
      )}
    </>
  );
}

function CardAta({ ata, onEditar }: { ata: Ata; onEditar: () => void }) {
  const valorTotal = Number(ata.valorTotal);
  const saldo = Number(ata.saldo);
  const utilizado = valorTotal > 0 ? ((valorTotal - saldo) / valorTotal) * 100 : 0;
  const agora = new Date();
  const vencimento = new Date(ata.vencimento);
  const diasParaVencer = Math.ceil((vencimento.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000));
  const vencida = vencimento < agora;
  const vencendo = !vencida && diasParaVencer <= 30;
  const saldoBaixo = valorTotal > 0 && saldo / valorTotal < 0.1;

  const situacao = !ata.ativo
    ? { rotulo: 'Inativa', cor: 'gray' }
    : vencida
      ? { rotulo: 'Vencida', cor: 'red' }
      : vencendo
        ? { rotulo: 'Vencendo', cor: 'yellow' }
        : { rotulo: 'Ativa', cor: 'green' };

  const corBarra = utilizado >= 90 ? '#dc2626' : utilizado >= 70 ? '#d97706' : '#16a34a';
  const corIcone = vencida ? { bg: 'var(--red-bg)', fg: '#dc2626' } : vencendo ? { bg: 'var(--yellow-bg)', fg: '#d97706' } : { bg: 'var(--green-bg)', fg: '#16a34a' };

  const alertas: string[] = [];
  if (vencendo) alertas.push(`Esta ata vence em ${diasParaVencer} dia(s)`);
  if (saldoBaixo) alertas.push('Saldo abaixo de 10% do valor total');

  return (
    <div className="ata-card">
      <div className="ata-topo">
        <div className="ata-icone" style={{ background: corIcone.bg, color: corIcone.fg }}>
          <IconeAtas />
        </div>
        <div>
          <div className="ata-nome">Ata {ata.numero}</div>
          <div className="ata-fornecedor">{ata.fornecedor || ata.descricao}</div>
        </div>
        <div className="ata-topo-acoes">
          <span className={`badge badge-${situacao.cor}`}>{situacao.rotulo}</span>
          <button className="btn-icone" onClick={onEditar} aria-label="Editar ata">
            <IconeLapis />
          </button>
        </div>
      </div>
      <div className="ata-info-grid">
        <div className="ata-info">
          <IconeDinheiro />
          <div>
            <div className="ai-label">Valor Total</div>
            <div className="ai-valor">{formatarMoeda(valorTotal)}</div>
          </div>
        </div>
        <div className="ata-info">
          <IconeDinheiro />
          <div>
            <div className="ai-label">Saldo Disponível</div>
            <div className="ai-valor">{formatarMoeda(saldo)}</div>
          </div>
        </div>
        <div className="ata-info">
          <IconeCalendario />
          <div>
            <div className="ai-label">Vencimento</div>
            <div className="ai-valor">{formatarData(ata.vencimento)}</div>
          </div>
        </div>
      </div>
      <div className="ata-progresso-rotulo">
        <span>Saldo utilizado</span>
        <span style={{ fontWeight: 600 }}>{utilizado.toFixed(1)}%</span>
      </div>
      <div className="ata-progresso">
        <div className="ata-progresso-fill" style={{ width: `${Math.min(100, utilizado)}%`, background: corBarra }} />
      </div>
      {ata.unidadeEspecifica && (
        <div className="cc-linha" style={{ marginBottom: 10 }}>
          <strong>Unidade específica:</strong> {ata.unidadeEspecifica.nome}
        </div>
      )}
      {alertas.length > 0 && (
        <div className="ata-alerta">
          <IconeAlerta />
          <div>
            {alertas.map((a) => (
              <div key={a}>{a}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FormAta({
  ata,
  onFechar,
  onSucesso,
}: {
  ata: Ata | null;
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [erro, setErro] = useMensagemTemporaria();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const inicial = {
    numero: ata?.numero ?? '',
    fornecedor: ata?.fornecedor ?? '',
    valorTotal: ata ? String(ata.valorTotal) : '',
    vencimento: ata ? ata.vencimento.slice(0, 10) : '',
    unidadeEspecificaId: ata?.unidadeEspecifica?.id ?? '',
  };
  const [form, setForm] = useState(inicial);

  useEffect(() => {
    api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
  }, []);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (ata && semAlteracoes(inicial, form)) {
      onFechar();
      return;
    }
    try {
      if (ata) {
        await api.patch(`/atas/${ata.id}`, {
          fornecedor: form.fornecedor,
          valorTotal: Number(form.valorTotal),
          vencimento: form.vencimento,
          unidadeEspecificaId: form.unidadeEspecificaId || null,
        });
        onSucesso('Ata atualizada.');
      } else {
        await api.post('/atas', {
          numero: form.numero,
          fornecedor: form.fornecedor,
          descricao: `Ata de registro de preços — ${form.fornecedor}`,
          valorTotal: Number(form.valorTotal),
          vencimento: form.vencimento,
          unidadeEspecificaId: form.unidadeEspecificaId || null,
        });
        onSucesso('Ata cadastrada.');
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <Modal
      titulo={ata ? 'Editar Ata de Registro de Preços' : 'Nova Ata de Registro de Preços'}
      onFechar={onFechar}
    >
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="field">
          <label>Número da Ata *</label>
          <input
            placeholder="Ex: 045/2026"
            value={form.numero}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}
            disabled={!!ata}
            required
          />
        </div>
        <div className="field">
          <label>Fornecedor *</label>
          <input
            placeholder="Nome da empresa fornecedora"
            value={form.fornecedor}
            onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Valor Total *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={form.valorTotal}
            onChange={(e) => setForm({ ...form, valorTotal: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Data de Vencimento *</label>
          <input
            type="date"
            value={form.vencimento}
            onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
            required
          />
        </div>
        <div className="field">
          <label>Unidade Específica (opcional)</label>
          <select
            value={form.unidadeEspecificaId}
            onChange={(e) => setForm({ ...form, unidadeEspecificaId: e.target.value })}
          >
            <option value="">—</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6 }}>
            Se selecionado, esta ata só poderá ser utilizada pela unidade especificada
          </div>
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={semAlteracoes(inicial, form)}
          >
            {ata ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================= Contratos ================= */

const ROTULO_STATUS_CONTRATO: Record<string, string> = {
  ATIVO: 'Ativo',
  RENOVACAO_PENDENTE: 'Pendente',
  EXPIRADO: 'Expirado',
};

const COR_STATUS_CONTRATO: Record<string, string> = {
  ATIVO: 'green',
  RENOVACAO_PENDENTE: 'yellow',
  EXPIRADO: 'red',
};

function SecaoContratos() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Contrato | 'novo' | null>(null);
  const fb = useFeedback();

  const carregar = useCallback(() => {
    api.get<Contrato[]>('/contratos').then(setContratos).catch(fb.falha);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function excluir(c: Contrato) {
    if (!window.confirm(`Excluir o contrato ${c.numero}?`)) return;
    try {
      await api.delete(`/contratos/${c.id}`);
      fb.sucesso('Contrato excluído.');
      carregar();
    } catch (e) {
      fb.falha(e);
    }
  }

  const filtrados = contratos.filter(
    (c) =>
      !busca ||
      c.numero.toLowerCase().includes(busca.toLowerCase()) ||
      c.empresa.toLowerCase().includes(busca.toLowerCase()) ||
      c.tipo.toLowerCase().includes(busca.toLowerCase()),
  );

  return (
    <>
      <div className="config-secao-header">
        <div>
          <h3>Gerenciar Contratos</h3>
          <p>Gerencie contratos de manutenção, garantia e serviços</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditando('novo')}>
          + Novo Contrato
        </button>
      </div>
      {fb.banners}
      <div className="config-busca">
        <IconeBusca />
        <input
          placeholder="Buscar por número, fornecedor ou tipo..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      <div className="card tabela-scroll" style={{ boxShadow: "none" }}>
        <table>
          <colgroup>
            <col style={{ width: '22%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Número / Tipo</th>
              <th>Fornecedor</th>
              <th>Vigência / Valor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.numero}</div>
                  <div className="celula-sub">{c.tipo}</div>
                </td>
                <td>{c.empresa}</td>
                <td>
                  <div>{formatarData(c.vigenciaInicio)} — {formatarData(c.vigenciaFim)}</div>
                  {c.valorTotal && (
                    <div className="celula-sub">
                      {Number(c.valorTotal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </div>
                  )}
                </td>
                <td>
                  <span className={`badge badge-${COR_STATUS_CONTRATO[c.status]}`}>
                    {ROTULO_STATUS_CONTRATO[c.status]}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-icone" onClick={() => setEditando(c)} aria-label="Editar">
                      <IconeLapis />
                    </button>
                    <button className="btn-icone perigo" onClick={() => excluir(c)} aria-label="Excluir">
                      <IconeLixeira />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">Nenhum contrato encontrado</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <FormContrato
          contrato={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onSucesso={(msg) => {
            setEditando(null);
            fb.sucesso(msg);
            carregar();
          }}
        />
      )}
    </>
  );
}

function FormContrato({
  contrato,
  onFechar,
  onSucesso,
}: {
  contrato: Contrato | null;
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [erro, setErro] = useMensagemTemporaria();
  const inicial = {
    numero: contrato?.numero ?? '',
    empresa: contrato?.empresa ?? '',
    tipo: contrato?.tipo ?? '',
    objeto: contrato?.objeto ?? '',
    valorTotal: contrato?.valorTotal ? String(contrato.valorTotal) : '0',
    condicoesPagamento: contrato?.condicoesPagamento ?? '',
    vigenciaInicio: contrato ? contrato.vigenciaInicio.slice(0, 10) : '',
    vigenciaFim: contrato ? contrato.vigenciaFim.slice(0, 10) : '',
    status: contrato?.status ?? 'ATIVO',
    observacoes: contrato?.observacoes ?? '',
  };
  const [form, setForm] = useState(inicial);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (contrato && semAlteracoes(inicial, form)) {
      onFechar();
      return;
    }
    const payload = {
      numero: form.numero,
      empresa: form.empresa,
      tipo: form.tipo,
      objeto: form.objeto,
      valorTotal: Number(form.valorTotal),
      condicoesPagamento: form.condicoesPagamento || null,
      vigenciaInicio: form.vigenciaInicio,
      vigenciaFim: form.vigenciaFim,
      status: form.status,
      observacoes: form.observacoes || null,
    };
    try {
      if (contrato) {
        await api.patch(`/contratos/${contrato.id}`, payload);
        onSucesso('Contrato atualizado.');
      } else {
        await api.post('/contratos', payload);
        onSucesso('Contrato cadastrado.');
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <Modal titulo={contrato ? 'Editar Contrato' : 'Novo Contrato'} onFechar={onFechar}>
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="form-2col">
          <div className="field">
            <label>Número do Contrato *</label>
            <input
              placeholder="Ex: CONT-2026-001"
              value={form.numero}
              onChange={(e) => setForm({ ...form, numero: e.target.value })}
              disabled={!!contrato}
              required
            />
          </div>
          <div className="field">
            <label>Fornecedor *</label>
            <input
              value={form.empresa}
              onChange={(e) => setForm({ ...form, empresa: e.target.value })}
              required
            />
          </div>
          <div className="field span-2">
            <label>Tipo de Contrato *</label>
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} required>
              <option value="">Selecione...</option>
              <option value="Manutenção Preventiva">Manutenção Preventiva</option>
              <option value="Manutenção Corretiva">Manutenção Corretiva</option>
              <option value="Calibração">Calibração</option>
              <option value="Garantia Estendida">Garantia Estendida</option>
              <option value="Serviços Gerais">Serviços Gerais</option>
            </select>
          </div>
          <div className="field span-2">
            <label>Descrição *</label>
            <textarea
              rows={3}
              placeholder="Descreva o objeto do contrato..."
              value={form.objeto}
              onChange={(e) => setForm({ ...form, objeto: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Valor Total (R$) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.valorTotal}
              onChange={(e) => setForm({ ...form, valorTotal: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Condições de Pagamento *</label>
            <input
              value={form.condicoesPagamento}
              onChange={(e) => setForm({ ...form, condicoesPagamento: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Data de Início *</label>
            <input
              type="date"
              value={form.vigenciaInicio}
              onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Data de Término *</label>
            <input
              type="date"
              value={form.vigenciaFim}
              onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })}
              required
            />
          </div>
          <div className="field span-2">
            <label>Status *</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as never })}
            >
              {Object.entries(ROTULO_STATUS_CONTRATO).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field span-2">
            <label>Observações</label>
            <textarea
              rows={2}
              placeholder="Informações adicionais..."
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={semAlteracoes(inicial, form)}
          >
            {contrato ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
