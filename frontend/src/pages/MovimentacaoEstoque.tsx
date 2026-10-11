import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import type { Categoria, Unidade } from '../types';
import { useAlertaNativo } from '../hooks/useAlertaNativo';

type Operacao = 'entrada' | 'saida';

// Entrada e saída de estoque em página própria (mesmo padrão do cadastro de equipamento).
export function MovimentacaoEstoque() {
  const [params] = useSearchParams();
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const podeMovimentar = usuario?.perfil === 'GALPAO' || usuario?.perfil === 'GESTOR_PATRIMONIO';
  const [galpoes, setGalpoes] = useState<Unidade[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true);
  const [falhaOpcoes, setFalhaOpcoes] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  useAlertaNativo(erro, () => setErro(null));
  const [form, setForm] = useState({
    galpaoId: params.get('galpao') ?? '',
    tipoEquipamentoId: params.get('tipo') ?? '',
    quantidade: 1,
    unidadeDestinoId: '',
  });
  const [operacao, setOperacao] = useState<Operacao | null>(
    params.get('operacao') === 'saida' ? 'saida' : params.get('operacao') === 'entrada' ? 'entrada' : null,
  );
  const ehSaida = operacao === 'saida';

  useEffect(() => {
    if (!podeMovimentar) return;
    let ativo = true;
    Promise.all([api.get<Unidade[]>('/unidades'), api.get<Categoria[]>('/categorias')])
      .then(([todas, listaCategorias]) => {
        if (!ativo) return;
        const soGalpoes = todas.filter((u) => u.tipo === 'GALPAO');
        setGalpoes(soGalpoes);
        setUnidades(todas);
        setCategorias(listaCategorias);
        setForm((atual) => ({ ...atual, galpaoId: atual.galpaoId || soGalpoes[0]?.id || '' }));
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
  }, [podeMovimentar]);

  if (!podeMovimentar) return <Navigate to="/estoque" replace />;

  function voltar() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/estoque');
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.post(`/estoque/${operacao}`, {
        tipoEquipamentoId: form.tipoEquipamentoId,
        quantidade: Number(form.quantidade),
        unidadeId: form.galpaoId,
        ...(ehSaida ? { unidadeDestinoId: form.unidadeDestinoId } : {}),
      });
      navigate('/estoque', { replace: true, state: { galpaoId: form.galpaoId } });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao registrar a movimentação.');
      setEnviando(false);
    }
  }

  const bloqueado = carregandoOpcoes || falhaOpcoes;

  return (
    <section className="gestao-page equipamento-pagina novo-equipamento" aria-labelledby="movimentacao-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div className="equipamento-titulo-linha">
          <h2 id="movimentacao-titulo">Movimentar estoque</h2>
        </div>
        <div className="novo-equipamento-acoes">
          <button type="button" className="btn btn-outline" onClick={voltar}>
            Cancelar
          </button>
          <button type="submit" form="form-movimentacao-estoque" className="btn btn-primary" disabled={enviando || bloqueado || !operacao}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>

      {carregandoOpcoes && <p className="novo-equipamento-estado" role="status">Carregando opções…</p>}
      {falhaOpcoes && (
        <div className="error-banner" role="alert">
          Não foi possível carregar galpões e tipos de equipamento. Recarregue a página para tentar novamente.
        </div>
      )}

      <form id="form-movimentacao-estoque" onSubmit={aoEnviar}>
        <section className="equipamento-secao">
          <h3>Tipo de movimentação</h3>
          <div className="field nova-solicitacao-campo-tipo">
            <label htmlFor="mov-operacao">Tipo</label>
            <select
              id="mov-operacao"
              value={operacao ?? ''}
              onChange={(e) => setOperacao((e.target.value || null) as Operacao | null)}
              required
            >
              <option value="">Selecione...</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
            {operacao && (
              <p className="nova-solicitacao-descricao">
                {operacao === 'entrada'
                  ? 'Registrar o recebimento de equipamentos no galpão'
                  : 'Enviar equipamentos do galpão para uma unidade'}
              </p>
            )}
          </div>
        </section>

        {operacao && (
        <section className="equipamento-secao" style={{ marginTop: 16 }}>
          <h3>{ehSaida ? 'Dados da saída' : 'Dados da entrada'}</h3>
          <div className="novo-equipamento-grade">
            <div className="field">
              <label htmlFor="mov-galpao">Galpão</label>
              <select
                id="mov-galpao"
                value={form.galpaoId}
                onChange={(e) => setForm({ ...form, galpaoId: e.target.value })}
                required
                disabled={bloqueado}
              >
                <option value="">Selecione...</option>
                {galpoes.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="mov-tipo">Tipo de item</label>
              <select
                id="mov-tipo"
                value={form.tipoEquipamentoId}
                onChange={(e) => setForm({ ...form, tipoEquipamentoId: e.target.value })}
                required
                disabled={bloqueado}
              >
                <option value="">Selecione...</option>
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
              <label htmlFor="mov-quantidade">Quantidade</label>
              <input
                id="mov-quantidade"
                type="number"
                min="1"
                value={form.quantidade}
                onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
                required
              />
            </div>
            {ehSaida && (
              <div className="field">
                <label htmlFor="mov-destino">Unidade de destino</label>
                <select
                  id="mov-destino"
                  value={form.unidadeDestinoId}
                  onChange={(e) => setForm({ ...form, unidadeDestinoId: e.target.value })}
                  required
                  disabled={bloqueado}
                >
                  <option value="">Selecione...</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>
        )}
      </form>
    </section>
  );
}
