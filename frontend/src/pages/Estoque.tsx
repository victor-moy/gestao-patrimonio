import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useMensagemTemporaria } from '../hooks/useMensagemTemporaria';
import { Modal } from '../components/Modal';
import { IconeCaixa, IconeEntrada, IconeSaida } from '../components/icons';
import type { Categoria, EstoqueItem, MovimentacaoEstoque, Unidade } from '../types';
import { formatarData } from '../utils/format';

export function Estoque() {
  const [aba, setAba] = useState<'estoque' | 'movimentacoes'>('estoque');
  const [itens, setItens] = useState<EstoqueItem[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoque[]>([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState<'entrada' | 'saida' | null>(null);
  const [mensagem, setMensagem] = useMensagemTemporaria();
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api.get<EstoqueItem[]>('/estoque').then(setItens).catch((e) => setErro(e.message));
    api.get<MovimentacaoEstoque[]>('/estoque/movimentacoes').then(setMovimentacoes).catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function toggleBranet(id: string) {
    try {
      const atualizado = await api.patch<MovimentacaoEstoque>(`/estoque/movimentacoes/${id}`, {});
      setMovimentacoes((prev) => prev.map((m) => (m.id === id ? atualizado : m)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro');
    }
  }

  const filtrados = itens.filter(
    (i) =>
      !busca ||
      i.tipoEquipamento.nome.toLowerCase().includes(busca.toLowerCase()) ||
      i.tipoEquipamento.codigo.toLowerCase().includes(busca.toLowerCase()),
  );

  const movFiltradas = movimentacoes.filter(
    (m) =>
      !busca ||
      m.estoque.tipoEquipamento.nome.toLowerCase().includes(busca.toLowerCase()) ||
      m.estoque.tipoEquipamento.codigo.toLowerCase().includes(busca.toLowerCase()),
  );

  function statusEstoque(qtd: number) {
    if (qtd === 0) return <span className="badge badge-red">Esgotado</span>;
    if (qtd <= 3) return <span className="badge badge-yellow">Estoque Baixo</span>;
    return <span className="badge badge-green">Disponível</span>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Gestão de Estoque</h2>
          <p className="subtitle">Controle do estoque físico no Galpão</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-success" onClick={() => setModal('entrada')}>
            <IconeEntrada /> Registrar Entrada
          </button>
          <button className="btn btn-primary" onClick={() => setModal('saida')}>
            <IconeSaida /> Registrar Saída
          </button>
        </div>
      </div>

      {mensagem && <div className="success-banner toast-sucesso">{mensagem}</div>}
      {erro && <div className="error-banner toast-erro">{erro}</div>}

      <div className="inner-tabs">
        <button
          className={`inner-tab${aba === 'estoque' ? ' active' : ''}`}
          onClick={() => { setAba('estoque'); setBusca(''); }}
        >
          Estoque
        </button>
        <button
          className={`inner-tab${aba === 'movimentacoes' ? ' active' : ''}`}
          onClick={() => { setAba('movimentacoes'); setBusca(''); }}
        >
          Movimentações
        </button>
      </div>

      <div className="card">
        <div className="toolbar">
          <input
            className="search"
            placeholder={aba === 'estoque' ? 'Buscar por tipo ou código...' : 'Buscar por tipo ou código...'}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {aba === 'estoque' ? (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Tipo de Item</th>
                  <th>Quantidade</th>
                  <th>Reservado</th>
                  <th>Última Entrada</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((item) => (
                  <tr key={item.id}>
                    <td>{item.tipoEquipamento.codigo}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <IconeCaixa /> {item.tipoEquipamento.nome}
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: item.quantidade > 0 ? 'var(--green)' : 'inherit' }}>
                      {item.quantidade}
                    </td>
                    <td style={{ color: item.reservado > 0 ? '#b45309' : 'inherit' }}>
                      {item.reservado}
                    </td>
                    <td>{formatarData(item.ultimaEntradaEm)}</td>
                    <td>{statusEstoque(item.quantidade)}</td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">Nenhum item no estoque</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Item</th>
                  <th>Qtd</th>
                  <th>Unidade Destino</th>
                  <th>Registrado por</th>
                  <th>Branet</th>
                </tr>
              </thead>
              <tbody>
                {movFiltradas.map((m) => (
                  <tr key={m.id}>
                    <td>{formatarData(m.criadoEm)}</td>
                    <td>
                      <span className={`badge badge-${m.tipo === 'ENTRADA' ? 'green' : 'blue'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {m.tipo === 'ENTRADA' ? <><IconeEntrada /> Entrada</> : <><IconeSaida /> Saída</>}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.estoque.tipoEquipamento.nome}</div>
                      <div className="celula-sub">{m.estoque.tipoEquipamento.codigo}</div>
                    </td>
                    <td>{m.quantidade}</td>
                    <td>{m.unidadeDestino?.nome ?? '—'}</td>
                    <td>{m.usuario?.nome ?? '—'}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={m.atualizadoNoBranet}
                        onChange={() => toggleBranet(m.id)}
                        title={m.atualizadoNoBranet ? 'Atualizado no Branet' : 'Pendente no Branet'}
                        style={{ cursor: 'pointer', width: 'auto' }}
                      />
                    </td>
                  </tr>
                ))}
                {movFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">Nenhuma movimentação registrada</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <MovimentarEstoque
          operacao={modal}
          onFechar={() => setModal(null)}
          onSucesso={(msg) => {
            setModal(null);
            setMensagem(msg);
            carregar();
          }}
        />
      )}
    </>
  );
}

function MovimentarEstoque({
  operacao,
  onFechar,
  onSucesso,
}: {
  operacao: 'entrada' | 'saida';
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [erro, setErro] = useMensagemTemporaria();
  const [form, setForm] = useState({
    tipoEquipamentoId: '',
    quantidade: 1,
    unidadeDestinoId: '',
  });

  useEffect(() => {
    api.get<Categoria[]>('/categorias').then(setCategorias).catch(() => {});
    if (operacao === 'saida') api.get<Unidade[]>('/unidades').then(setUnidades).catch(() => {});
  }, [operacao]);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      if (operacao === 'entrada') {
        await api.post('/estoque/entrada', {
          tipoEquipamentoId: form.tipoEquipamentoId,
          quantidade: Number(form.quantidade),
        });
        onSucesso('Entrada registrada no estoque.');
      } else {
        await api.post('/estoque/saida', {
          tipoEquipamentoId: form.tipoEquipamentoId,
          quantidade: Number(form.quantidade),
          ...(form.unidadeDestinoId ? { unidadeDestinoId: form.unidadeDestinoId } : {}),
        });
        onSucesso('Saída registrada no estoque.');
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    }
  }

  return (
    <Modal
      titulo={operacao === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída'}
      onFechar={onFechar}
    >
      <form onSubmit={aoEnviar}>
        {erro && <div className="error-banner toast-erro">{erro}</div>}
        <div className="info-grid">
          <div className="field">
            <label>Tipo de Item *</label>
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
            <label>Quantidade *</label>
            <input
              type="number"
              min="1"
              value={form.quantidade}
              onChange={(e) => setForm({ ...form, quantidade: Number(e.target.value) })}
              required
            />
          </div>
          {operacao === 'saida' && (
            <div className="field">
              <label>Unidade de Destino *</label>
              <select
                value={form.unidadeDestinoId}
                onChange={(e) => setForm({ ...form, unidadeDestinoId: e.target.value })}
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
          )}
        </div>
        <div className="actions-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Confirmar
          </button>
        </div>
      </form>
    </Modal>
  );
}
