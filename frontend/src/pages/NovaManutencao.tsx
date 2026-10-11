import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import type { Equipamento } from '../types';
import { useAlertaNativo } from '../hooks/useAlertaNativo';
import { ItemAusente } from '../components/ItemAusente';

const inicial = { equipamentoId: '', descricaoProblema: '' };

// Solicitação de manutenção em página própria (mesmo padrão das demais telas de cadastro).
export function NovaManutencao() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Vindo do detalhe do equipamento (ou do QR), o item já chega escolhido
  const [params] = useSearchParams();
  const equipamentoInicial = params.get('equipamento') ?? '';
  const podeSolicitar = usuario?.perfil === 'UNIDADE';
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(true);
  const [falhaOpcoes, setFalhaOpcoes] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useMensagemTemporaria(8000);
  useAlertaNativo(erro, () => setErro(null));
  const [form, setForm] = useState({ ...inicial, equipamentoId: equipamentoInicial });

  useEffect(() => {
    if (!podeSolicitar) return;
    let ativo = true;
    // A unidade só vê o próprio inventário; somente equipamentos ativos
    api
      .get<Equipamento[]>('/equipamentos?status=ATIVO')
      .then((lista) => {
        // Itens emprestados à unidade aparecem no inventário, mas só a unidade dona abre manutenção
        if (ativo) setEquipamentos(lista.filter((eq) => eq.unidade.id === usuario?.unidadeId));
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
  }, [podeSolicitar, usuario?.unidadeId]);

  if (!podeSolicitar) return <Navigate to="/manutencoes" replace />;

  function voltar() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/manutencoes');
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      await api.post('/manutencoes', form);
      navigate('/manutencoes', { replace: true });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao registrar a solicitação.');
      setEnviando(false);
    }
  }

  const bloqueado = carregandoOpcoes || falhaOpcoes;

  return (
    <section className="gestao-page equipamento-pagina novo-equipamento" aria-labelledby="nova-manutencao-titulo">
      <div className="equipamento-pagina-cabecalho">
        <div className="equipamento-titulo-linha">
          <h2 id="nova-manutencao-titulo">Nova manutenção</h2>
        </div>
        <div className="novo-equipamento-acoes">
          <button type="button" className="btn btn-outline" onClick={voltar}>
            Cancelar
          </button>
          <button
            type="submit"
            form="form-nova-manutencao"
            className="btn btn-primary"
            disabled={enviando || bloqueado || !form.equipamentoId || form.descricaoProblema.trim().length < 5}
          >
            {enviando ? 'Enviando…' : 'Enviar solicitação'}
          </button>
        </div>
      </div>

      {carregandoOpcoes && <p className="novo-equipamento-estado" role="status">Carregando opções…</p>}
      {falhaOpcoes && (
        <div className="error-banner" role="alert">
          Não foi possível carregar os equipamentos. Recarregue a página para tentar novamente.
        </div>
      )}

      <form id="form-nova-manutencao" onSubmit={aoEnviar}>
        <section className="equipamento-secao">
          <h3>Dados da solicitação</h3>
          <div className="novo-equipamento-grade">
            <div className="field novo-equipamento-largura-total">
              <label htmlFor="nm-equipamento">Equipamento</label>
              <select
                id="nm-equipamento"
                value={form.equipamentoId}
                onChange={(e) => setForm({ ...form, equipamentoId: e.target.value })}
                required
                disabled={bloqueado}
              >
                <option value="">Selecione...</option>
                {equipamentos.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.tipoEquipamento.nome} — {eq.tombamento}
                  </option>
                ))}
              </select>
              <ItemAusente />
            </div>
            <div className="field novo-equipamento-largura-total">
              <label htmlFor="nm-problema">Descrição do problema</label>
              <textarea
                id="nm-problema"
                rows={3}
                value={form.descricaoProblema}
                onChange={(e) => setForm({ ...form, descricaoProblema: e.target.value })}
                required
              />
            </div>
          </div>
        </section>
      </form>
    </section>
  );
}
