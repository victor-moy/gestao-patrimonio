import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { semAlteracoes } from '../utils/form';
import { ROTULO_ESTADO } from '../utils/format';
import type { Categoria, Equipamento, Unidade } from '../types';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

const inicial = {
  tombamento: '',
  descricao: '',
  tipoEquipamentoId: '',
  unidadeId: '',
  estadoConservacao: 'BOM',
  dataAquisicao: '',
};

export function NovoEquipamento() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const podeCadastrar = usuario?.perfil === 'GALPAO' || usuario?.perfil === 'GESTOR_PATRIMONIO';
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true);
  const [falhaOpcoes, setFalhaOpcoes] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  useAlertaNativo(erro, () => setErro(null));
  const [form, setForm] = useState(inicial);

  useEffect(() => {
    if (!podeCadastrar) return;
    let ativo = true;
    setCarregandoOpcoes(true);
    setFalhaOpcoes(false);
    Promise.all([api.get<Unidade[]>('/unidades'), api.get<Categoria[]>('/categorias')])
      .then(([listaUnidades, listaCategorias]) => {
        if (!ativo) return;
        setUnidades(listaUnidades);
        setCategorias(listaCategorias);
      })
      .catch(() => {
        if (ativo) setFalhaOpcoes(true);
      })
      .finally(() => {
        if (ativo) setCarregandoOpcoes(false);
      });
    return () => {
      ativo = false;
    };
  }, [podeCadastrar]);

  if (!podeCadastrar) return <Navigate to="/inventario" replace />;

  // Volta para a página de origem; em acesso direto pela URL cai no inventário.
  function voltar() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/inventario');
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.post<Equipamento>('/equipamentos', {
        ...form,
        dataAquisicao: form.dataAquisicao || null,
      });
      navigate('/inventario', { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao cadastrar o equipamento.');
      setEnviando(false);
    }
  }

  const bloqueado = carregandoOpcoes || falhaOpcoes;

  return (
    <section className="gestao-page equipamento-pagina novo-equipamento" aria-labelledby="novo-equipamento-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div className="equipamento-titulo-linha">
          <h2 id="novo-equipamento-titulo">Novo equipamento</h2>
        </div>
        <div className="novo-equipamento-acoes">
          <button type="button" className="btn btn-outline" onClick={voltar}>
            Cancelar
          </button>
          <button
            type="submit"
            form="form-novo-equipamento"
            className="btn btn-primary"
            disabled={enviando || bloqueado || semAlteracoes(inicial, form)}
          >
            {enviando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {carregandoOpcoes && <p className="novo-equipamento-estado" role="status">Carregando opções…</p>}
      {falhaOpcoes && (
        <div className="error-banner" role="alert">
          Não foi possível carregar unidades e tipos de equipamento. Recarregue a página para tentar novamente.
        </div>
      )}

      <form id="form-novo-equipamento" onSubmit={aoEnviar} className="novo-equipamento-form">
        <div className="equipamento-detalhe-layout">
          <div className="equipamento-detalhe-principal">
            <section className="equipamento-secao">
              <h3>Informações do equipamento</h3>
              <div className="novo-equipamento-grade">
                <div className="field">
                  <label htmlFor="ne-tipo">Tipo de equipamento *</label>
                  <select
                    id="ne-tipo"
                    value={form.tipoEquipamentoId}
                    onChange={(e) => setForm({ ...form, tipoEquipamentoId: e.target.value })}
                    required
                    disabled={bloqueado}
                  >
                    <option value="">Selecione…</option>
                    {categorias.map((c) => (
                      <optgroup key={c.id} label={c.nome}>
                        {c.tipos.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ne-tombamento">Número de tombamento *</label>
                  <input
                    id="ne-tombamento"
                    value={form.tombamento}
                    onChange={(e) => setForm({ ...form, tombamento: e.target.value })}
                    required
                  />
                </div>
                <div className="field novo-equipamento-largura-total">
                  <label htmlFor="ne-descricao">Descrição *</label>
                  <textarea
                    id="ne-descricao"
                    rows={3}
                    value={form.descricao}
                    onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="ne-data">Data de aquisição</label>
                  <input
                    id="ne-data"
                    type="date"
                    value={form.dataAquisicao}
                    onChange={(e) => setForm({ ...form, dataAquisicao: e.target.value })}
                  />
                </div>
              </div>
            </section>
          </div>

          <aside className="equipamento-detalhe-lateral" aria-label="Situação e localização">
            <section className="equipamento-secao">
              <h3>Situação</h3>
              <div className="field">
                <label htmlFor="ne-estado">Estado de conservação *</label>
                <select
                  id="ne-estado"
                  value={form.estadoConservacao}
                  onChange={(e) => setForm({ ...form, estadoConservacao: e.target.value })}
                >
                  {Object.entries(ROTULO_ESTADO).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className="equipamento-secao">
              <h3>Localização</h3>
              <div className="field">
                <label htmlFor="ne-unidade">Unidade de destino *</label>
                <select
                  id="ne-unidade"
                  value={form.unidadeId}
                  onChange={(e) => setForm({ ...form, unidadeId: e.target.value })}
                  required
                  disabled={bloqueado}
                >
                  <option value="">Selecione…</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          </aside>
        </div>
      </form>
    </section>
  );
}
