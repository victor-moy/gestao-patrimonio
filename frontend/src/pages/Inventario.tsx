import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { semAlteracoes } from '../utils/form';
import { useAuth } from '../auth/AuthContext';
import './Inventario.css';
import {
  IconeBusca,
  IconeCheck,
  IconeDetalhes,
  IconeInventario,
  IconeManutencoes,
  IconeUpload,
  IconeAtas,
} from '../components/icons';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import type { Categoria, Equipamento, Unidade } from '../types';
import {
  formatarData,
  ROTULO_ESTADO,
  ROTULO_MOVIMENTACAO,
  ROTULO_STATUS_EQUIPAMENTO,
} from '../utils/format';

export function Inventario() {
  const { usuario } = useAuth();
  const podeEditar = usuario?.perfil === 'GALPAO' || usuario?.perfil === 'GESTOR_PATRIMONIO';
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroUnidade, setFiltroUnidade] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [detalhe, setDetalhe] = useState<Equipamento | null>(null);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [mensagem, setMensagem] = useMensagemTemporaria();
  const [erro, setErro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [falhaCarregamento, setFalhaCarregamento] = useState(false);
  const requisicao = useRef(0);
  const inputCsv = useRef<HTMLInputElement>(null);

  const carregar = useCallback(() => {
    const idRequisicao = ++requisicao.current;
    setCarregando(true);
    setFalhaCarregamento(false);
    setErro(null);
    const params = new URLSearchParams();
    if (busca) params.set('busca', busca);
    if (filtroUnidade) params.set('unidadeId', filtroUnidade);
    if (filtroStatus) params.set('status', filtroStatus);
    api
      .get<Equipamento[]>(`/equipamentos?${params}`)
      .then((dados) => {
        if (idRequisicao !== requisicao.current) return;
        setEquipamentos(dados);
        setPagina(1);
      })
      .catch((e) => {
        if (idRequisicao !== requisicao.current) return;
        setFalhaCarregamento(true);
        setEquipamentos([]);
        setErro(e.message);
      })
      .finally(() => {
        if (idRequisicao === requisicao.current) setCarregando(false);
      });
  }, [busca, filtroUnidade, filtroStatus]);

  useEffect(() => {
    carregar();
    return () => {
      requisicao.current += 1;
    };
  }, [carregar]);

  useEffect(() => {
    api
      .get<Unidade[]>('/unidades')
      .then(setUnidades)
      .catch(() => {});
    api
      .get<Categoria[]>('/categorias')
      .then(setCategorias)
      .catch(() => {});
  }, []);

  async function abrirDetalhe(id: string) {
    try {
      setDetalhe(await api.get<Equipamento>(`/equipamentos/${id}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    }
  }

  async function importarCsv(arquivo: File) {
    setErro(null);
    setMensagem(null);
    const form = new FormData();
    form.append('arquivo', arquivo);
    try {
      const resultado = await api.post<{ importados: number; conflitos: string[] }>(
        '/importacao/csv',
        form,
      );
      setMensagem(
        `Importação concluída: ${resultado.importados} equipamentos importados.` +
          (resultado.conflitos.length > 0
            ? ` Tombamentos ignorados por já existirem: ${resultado.conflitos.join(', ')}.`
            : ''),
      );
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na importação');
    }
  }

  const porPagina = 10;
  const totalPaginas = Math.max(1, Math.ceil(equipamentos.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicio = (paginaAtual - 1) * porPagina;
  const equipamentosVisiveis = equipamentos.slice(inicio, inicio + porPagina);
  const resumos = [
    {
      rotulo: 'Total de bens',
      valor: equipamentos.length,
      cor: 'blue',
      icone: <IconeInventario />,
    },
    {
      rotulo: 'Ativos',
      valor: equipamentos.filter((eq) => eq.status === 'ATIVO').length,
      cor: 'green',
      icone: <IconeCheck />,
    },
    {
      rotulo: 'Em manutenção',
      valor: equipamentos.filter((eq) => eq.status === 'EM_MANUTENCAO').length,
      cor: 'yellow',
      icone: <IconeManutencoes />,
    },
    {
      rotulo: 'Baixados',
      valor: equipamentos.filter((eq) => eq.status === 'BAIXADO').length,
      cor: 'gray',
      icone: <IconeAtas />,
    },
  ];

  return (
    <section className="inventario-page" aria-labelledby="inventario-titulo">
      <div className="page-header">
        <div>
          <h2 id="inventario-titulo">Inventário de Equipamentos</h2>
          <p className="subtitle">Acompanhe e organize os bens da sua unidade.</p>
        </div>
        {podeEditar && (
          <div className="page-actions">
            <input
              ref={inputCsv}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) importarCsv(arquivo);
                e.target.value = '';
              }}
            />
            <button className="btn btn-outline" onClick={() => inputCsv.current?.click()}>
              <IconeUpload /> Importar CSV
            </button>
            <button className="btn btn-primary" onClick={() => setCadastroAberto(true)}>
              + Cadastrar Equipamento
            </button>
          </div>
        )}
      </div>

      {mensagem && <div className="success-banner toast-sucesso">{mensagem}</div>}
      {erro && <div className="error-banner">{erro}</div>}

      <div className="inventario-resumo-label">Resumo da seleção atual</div>
      <div className="inventario-resumo" aria-label="Resumo da seleção atual">
        {resumos.map((resumo) => (
          <div className="card inventario-indicador" key={resumo.rotulo}>
            <span className={`inventario-indicador-icone tom-${resumo.cor}`}>{resumo.icone}</span>
            <div>
              <span className="inventario-indicador-label">{resumo.rotulo}</span>
              <strong>
                {carregando || falhaCarregamento ? '—' : resumo.valor.toLocaleString('pt-BR')}
              </strong>
            </div>
          </div>
        ))}
      </div>

      <div className="card inventario-lista">
        <div className="inventario-status" role="group" aria-label="Atalhos de status">
          {[
            ['', 'Todos os bens'],
            ['ATIVO', 'Ativos'],
            ['EM_MANUTENCAO', 'Em manutenção'],
            ['BAIXADO', 'Baixados'],
          ].map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtroStatus === valor}
              onClick={() => setFiltroStatus(valor)}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <div className="toolbar inventario-filtros">
          <div className="inventario-busca">
            <IconeBusca />
            <input
              className="search"
              aria-label="Buscar equipamentos"
              placeholder="Buscar por tombamento, tipo ou unidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          {usuario?.perfil !== 'UNIDADE' && (
            <select
              aria-label="Filtrar por unidade"
              value={filtroUnidade}
              onChange={(e) => setFiltroUnidade(e.target.value)}
            >
              <option value="">Todas as unidades</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Filtrar por status"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            {Object.entries(ROTULO_STATUS_EQUIPAMENTO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div
          className="inventario-tabela-scroll"
          role="region"
          aria-label="Equipamentos"
          tabIndex={0}
          aria-busy={carregando}
        >
          <table>
            <caption className="inventario-sr-only">Bens patrimoniais da seleção atual</caption>
            <thead>
              <tr>
                <th scope="col">Tombamento</th>
                <th scope="col">Equipamento</th>
                <th scope="col">Unidade</th>
                <th scope="col">Status</th>
                <th scope="col">Conservação</th>
                <th scope="col">Aquisição</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {!carregando &&
                !falhaCarregamento &&
                equipamentosVisiveis.map((eq) => (
                  <tr key={eq.id} className="clickable" onClick={() => abrirDetalhe(eq.id)}>
                    <td style={{ fontWeight: 600 }}>{eq.tombamento}</td>
                    <td className="inventario-equipamento">
                      <strong>{eq.tipoEquipamento.nome}</strong>
                      {eq.descricao && eq.descricao !== eq.tipoEquipamento.nome && (
                        <div className="celula-equipamento-sub">{eq.descricao}</div>
                      )}
                      {eq.emendaParlamentar && (
                        <span className="badge badge-purple" style={{ marginLeft: 8 }}>
                          Emenda
                        </span>
                      )}
                    </td>
                    <td>
                      {eq.unidade.nome}
                      {eq.unidadeTemporaria && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          temporariamente em {eq.unidadeTemporaria.nome}
                        </div>
                      )}
                    </td>
                    <td className={`inventario-situacao status-${eq.status}`}>
                      <Badge valor={eq.status}>{ROTULO_STATUS_EQUIPAMENTO[eq.status]}</Badge>
                    </td>
                    <td>
                      <Badge valor={eq.estadoConservacao}>
                        {ROTULO_ESTADO[eq.estadoConservacao]}
                      </Badge>
                    </td>
                    <td>{formatarData(eq.dataAquisicao)}</td>
                    <td>
                      <button
                        className="inventario-detalhes"
                        aria-label={`Ver detalhes de ${eq.tombamento}`}
                        title="Ver detalhes"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirDetalhe(eq.id);
                        }}
                      >
                        <IconeDetalhes />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {(carregando || falhaCarregamento || equipamentos.length === 0) && (
          <div className="empty-state" role="status">
            {carregando
              ? 'Carregando equipamentos…'
              : falhaCarregamento
                ? 'Não foi possível carregar o inventário.'
                : 'Nenhum equipamento encontrado'}
            {!carregando &&
              (falhaCarregamento ? (
                <button className="btn btn-outline" onClick={carregar}>
                  Tentar novamente
                </button>
              ) : (
                (busca || filtroUnidade || filtroStatus) && (
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setBusca('');
                      setFiltroUnidade('');
                      setFiltroStatus('');
                    }}
                  >
                    Limpar filtros
                  </button>
                )
              ))}
          </div>
        )}
        <div className="inventario-rodape">
          <span role="status">
            {carregando ? (
              'Atualizando seleção…'
            ) : falhaCarregamento ? (
              'Inventário indisponível'
            ) : (
              <>
                <strong>
                  {equipamentos.length} equipamento{equipamentos.length === 1 ? '' : 's'}
                </strong>
                {equipamentos.length > 0 && (
                  <span>
                    {' '}
                    · Mostrando {inicio + 1}–{Math.min(inicio + porPagina, equipamentos.length)}
                  </span>
                )}
              </>
            )}
          </span>
          <div className="inventario-paginacao" role="group" aria-label="Paginação do inventário">
            <button
              type="button"
              className="btn btn-outline"
              disabled={carregando || falhaCarregamento || paginaAtual === 1}
              onClick={() => setPagina(paginaAtual - 1)}
              aria-label="Página anterior"
            >
              Anterior
            </button>
            <span>
              Página {paginaAtual} de {totalPaginas}
            </span>
            <button
              type="button"
              className="btn btn-outline"
              disabled={carregando || falhaCarregamento || paginaAtual === totalPaginas}
              onClick={() => setPagina(paginaAtual + 1)}
              aria-label="Próxima página"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {detalhe && <DetalheEquipamento equipamento={detalhe} onFechar={() => setDetalhe(null)} />}
      {cadastroAberto && (
        <CadastroEquipamento
          unidades={unidades}
          categorias={categorias}
          onFechar={() => setCadastroAberto(false)}
          onSucesso={() => {
            setCadastroAberto(false);
            setMensagem('Equipamento cadastrado com sucesso.');
            carregar();
          }}
        />
      )}
    </section>
  );
}

function DetalheEquipamento({
  equipamento,
  onFechar,
}: {
  equipamento: Equipamento;
  onFechar: () => void;
}) {
  return (
    <Modal
      titulo="Detalhes do Equipamento"
      subtitulo={`Tombamento: ${equipamento.tombamento}`}
      onFechar={onFechar}
    >
      <div className="section-title">Informações Básicas</div>
      <div className="info-grid">
        <div className="info-box">
          <div className="info-label">Tipo de Equipamento</div>
          <div className="info-value">{equipamento.tipoEquipamento.nome}</div>
        </div>
        <div className="info-box">
          <div className="info-label">📍 Unidade Atual</div>
          <div className="info-value">
            {equipamento.unidade.nome}
            {equipamento.unidadeTemporaria &&
              ` (emprestado a ${equipamento.unidadeTemporaria.nome})`}
          </div>
        </div>
        <div className="info-box">
          <div className="info-label">Status</div>
          <div className="info-value">{ROTULO_STATUS_EQUIPAMENTO[equipamento.status]}</div>
        </div>
        <div className="info-box">
          <div className="info-label">Estado de Conservação</div>
          <div className="info-value">{ROTULO_ESTADO[equipamento.estadoConservacao]}</div>
        </div>
        <div className="info-box">
          <div className="info-label">📅 Data de Aquisição</div>
          <div className="info-value">{formatarData(equipamento.dataAquisicao)}</div>
        </div>
        <div className="info-box">
          <div className="info-label">Origem do Recurso</div>
          <div className="info-value">
            {equipamento.emendaParlamentar ? 'Emenda Parlamentar' : 'Regular'}
          </div>
        </div>
      </div>
      {equipamento.observacoes && (
        <>
          <div className="section-title">Observações</div>
          <div className="info-box" style={{ marginBottom: 16 }}>
            {equipamento.observacoes}
          </div>
        </>
      )}
      <div className="section-title">🕐 Histórico de Movimentações</div>
      <div className="card card-pad" style={{ boxShadow: 'none' }}>
        {(equipamento.movimentacoes ?? []).length === 0 && (
          <div className="empty-state">Sem movimentações registradas</div>
        )}
        {(equipamento.movimentacoes ?? []).map((m) => (
          <div key={m.id} className="timeline-item">
            <div className="timeline-icon" aria-hidden>
              {m.tipo === 'BAIXA' ? '❌' : m.tipo.includes('MANUTENCAO') ? '🔧' : '📦'}
            </div>
            <div className="timeline-body">
              <div className="timeline-title">{ROTULO_MOVIMENTACAO[m.tipo] ?? m.tipo}</div>
              <div className="timeline-sub">{m.descricao}</div>
            </div>
            <div className="timeline-date">{formatarData(m.criadoEm)}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function CadastroEquipamento({
  unidades,
  categorias,
  onFechar,
  onSucesso,
}: {
  unidades: Unidade[];
  categorias: Categoria[];
  onFechar: () => void;
  onSucesso: () => void;
}) {
  const [erro, setErro] = useMensagemTemporaria();
  const inicial = {
    tombamento: '',
    descricao: '',
    tipoEquipamentoId: '',
    unidadeId: '',
    estadoConservacao: 'BOM',
    emendaParlamentar: false,
    dataAquisicao: '',
  };
  const [form, setForm] = useState(inicial);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/equipamentos', {
        ...form,
        dataAquisicao: form.dataAquisicao || null,
      });
      onSucesso();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao cadastrar');
    }
  }

  return (
    <Modal titulo="Cadastrar Equipamento" onFechar={onFechar}>
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="info-grid">
          <div className="field">
            <label>Número de Tombamento *</label>
            <input
              value={form.tombamento}
              onChange={(e) => setForm({ ...form, tombamento: e.target.value })}
              placeholder="ex.: 12360/2026"
              required
            />
          </div>
          <div className="field">
            <label>Unidade de Destino *</label>
            <select
              value={form.unidadeId}
              onChange={(e) => setForm({ ...form, unidadeId: e.target.value })}
              required
            >
              <option value="">Selecione...</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tipo de Equipamento *</label>
            <select
              value={form.tipoEquipamentoId}
              onChange={(e) => setForm({ ...form, tipoEquipamentoId: e.target.value })}
              required
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
            <label>Estado de Conservação *</label>
            <select
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
          <div className="field">
            <label>Data de Aquisição</label>
            <input
              type="date"
              value={form.dataAquisicao}
              onChange={(e) => setForm({ ...form, dataAquisicao: e.target.value })}
            />
          </div>
          <div className="field">
            <label style={{ marginBottom: 12 }}>Origem do Recurso</label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.emendaParlamentar}
                onChange={(e) => setForm({ ...form, emendaParlamentar: e.target.checked })}
              />
              Adquirido por emenda parlamentar
            </label>
          </div>
        </div>
        <div className="field">
          <label>Descrição *</label>
          <textarea
            rows={2}
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            required
          />
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={semAlteracoes(inicial, form)}>
            Cadastrar
          </button>
        </div>
      </form>
    </Modal>
  );
}
