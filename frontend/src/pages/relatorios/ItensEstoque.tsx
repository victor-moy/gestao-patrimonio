import '../Relatorios.css';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { IconeBusca, IconeChevron } from '../../components/icons';
import type { EstoqueAguardandoItem } from '../../types';
import { diasDesde } from '../../utils/relatorios';
import { capitalizarPalavras, formatarMoeda } from '../../utils/format';

// Relatório 4 — Itens e Estoque: quantidade de equipamentos por unidade ao
// longo do tempo + o que está represado em Aguardando Disponibilidade, sem
// estoque suficiente pra reservar agora. A segunda parte vivia antes dentro
// da tela de Estoque, virou um relatório dedicado.
export function RelatorioItensEstoque() {
  const [dados, setDados] = useState<EstoqueAguardandoItem[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<{ campo: 'nome' | 'quantidade' | 'antiguidade'; direcao: 'asc' | 'desc' }>({
    campo: 'nome',
    direcao: 'asc',
  });

  useEffect(() => {
    api
      .get<EstoqueAguardandoItem[]>('/relatorios/itens-estoque')
      .then(setDados)
      .catch((e) => setErro(e.message));
  }, []);

  const verbaTotal = (dados ?? []).reduce((total, item) => {
    const preco = item.tipoEquipamento.preco;
    if (preco === null || preco === undefined) return total;
    return total + Number(preco) * item.quantidade;
  }, 0);
  const quantidadeTotal = (dados ?? []).reduce((total, item) => total + item.quantidade, 0);

  const buscaNormalizada = busca.trim().toLowerCase();
  const itensFiltrados = (dados ?? [])
    .filter(
      (item) =>
        !buscaNormalizada ||
        item.tipoEquipamento.nome.toLowerCase().includes(buscaNormalizada) ||
        item.tipoEquipamento.codigo.toLowerCase().includes(buscaNormalizada),
    )
    .sort((a, b) => {
      const sinal = ordenacao.direcao === 'asc' ? 1 : -1;
      if (ordenacao.campo === 'quantidade') return (a.quantidade - b.quantidade) * sinal;
      if (ordenacao.campo === 'antiguidade') {
        const da = a.aguardandoDesde ? new Date(a.aguardandoDesde).getTime() : 0;
        const db = b.aguardandoDesde ? new Date(b.aguardandoDesde).getTime() : 0;
        return (da - db) * sinal;
      }
      return a.tipoEquipamento.nome.localeCompare(b.tipoEquipamento.nome, 'pt-BR') * sinal;
    });

  function alternarOrdenacao(campo: 'nome' | 'quantidade' | 'antiguidade') {
    setOrdenacao((atual) =>
      atual.campo === campo
        ? { campo, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        // Quantidade e antiguidade começam do maior/mais antigo — é o que
        // interessa primeiro pra decidir prioridade de compra.
        : { campo, direcao: campo === 'nome' ? 'asc' : 'desc' },
    );
  }

  // Cabeçalho ordenável: botão com seta discreta (acessível por teclado)
  function CabecalhoOrdenavel({ campo, children }: { campo: 'nome' | 'quantidade' | 'antiguidade'; children: string }) {
    const ativo = ordenacao.campo === campo;
    return (
      <th scope="col" aria-sort={ativo ? (ordenacao.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="rel-ordenar" onClick={() => alternarOrdenacao(campo)}>
          {children}
          {ativo && (
            <span className={`rel-ordenar-seta${ordenacao.direcao === 'asc' ? ' asc' : ''}`} aria-hidden>
              <IconeChevron />
            </span>
          )}
        </button>
      </th>
    );
  }

  return (
    <>
      {erro && <div className="error-banner" role="alert">{erro}</div>}

      <div className="card card-pad rel-filtros">
        <label className="rel-busca rel-busca--sozinha">
          <IconeBusca />
          <input
            type="text"
            aria-label="Buscar item aguardando estoque"
            placeholder="Buscar item aguardando estoque por nome ou código"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </label>
      </div>

      <div className="stats-grid rel-kpis">
        <div className="card stat-card">
          <div className="stat-label">Itens aguardando estoque</div>
          <div className="stat-linha">
            <span className="stat-value">{dados?.length ?? '—'}</span>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Quantidade aguardando</div>
          <div className="stat-linha">
            <span className="stat-value">{dados ? quantidadeTotal : '—'}</span>
          </div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Previsão de verba</div>
          <div className="stat-linha">
            <span className="stat-value">{formatarMoeda(verbaTotal)}</span>
          </div>
        </div>
      </div>

      <div className="card rel-tabela">
        <div className="rel-cabecalho rel-cabecalho--tabela">
          <h3>Itens aguardando estoque</h3>
        </div>
        {!dados || dados.length === 0 ? (
          <div className="empty-state">Nada aguardando estoque no momento</div>
        ) : itensFiltrados.length === 0 ? (
          <div className="empty-state">Nenhum item aguardando estoque bate com essa busca</div>
        ) : (
          <div className="rel-tabela-scroll">
            <table>
              <thead>
                <tr>
                  <CabecalhoOrdenavel campo="nome">Equipamento</CabecalhoOrdenavel>
                  <th scope="col">Código</th>
                  <th scope="col">Categoria</th>
                  <CabecalhoOrdenavel campo="quantidade">Quantidade</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel campo="antiguidade">Aguardando há</CabecalhoOrdenavel>
                  <th scope="col">Preço ref.</th>
                  <th scope="col">Previsão de verba</th>
                </tr>
              </thead>
              <tbody>
                {itensFiltrados.map((item) => {
                  const preco = item.tipoEquipamento.preco;
                  const subtotal = preco === null || preco === undefined ? null : Number(preco) * item.quantidade;
                  const dias = diasDesde(item.aguardandoDesde);
                  const nome = capitalizarPalavras(item.tipoEquipamento.nome);
                  return (
                    <tr key={item.tipoEquipamento.id}>
                      <td className="rel-tabela-principal">{nome}</td>
                      <td>#{item.tipoEquipamento.codigo}</td>
                      <td>{item.tipoEquipamento.categoria?.nome ?? '—'}</td>
                      <td>{item.quantidade}</td>
                      <td>{dias === null ? '—' : `${dias} dia${dias === 1 ? '' : 's'}`}</td>
                      <td>{formatarMoeda(preco)}</td>
                      <td>{subtotal === null ? '—' : formatarMoeda(subtotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="rel-tabela-total-rotulo">
                    Total previsto
                  </td>
                  <td className="rel-tabela-total">
                    {formatarMoeda(
                      itensFiltrados.reduce((total, item) => {
                        const preco = item.tipoEquipamento.preco;
                        if (preco === null || preco === undefined) return total;
                        return total + Number(preco) * item.quantidade;
                      }, 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
