import { useEffect, useState } from 'react';
import { api } from '../api/client';
import './InventarioPainel.css';

export interface FiltrosPainel {
  busca: string; unidadeId: string; categoriaId: string; tipoEquipamentoId: string; status: string;
}
export interface GrupoInventario { id: string; nome: string; quantidade: number }
export interface ResumoInventario {
  total: number; ativos: number; emManutencao: number; unidades: number; categorias: number; familias: number;
  porUnidade: GrupoInventario[]; porCategoria: GrupoInventario[]; porFamilia: GrupoInventario[]; atualizadoEm: string;
}

function Distribuicao({ titulo, grupos, selecionar }: { titulo: string; grupos: GrupoInventario[]; selecionar: (id: string) => void }) {
  const [expandido, setExpandido] = useState(false);
  const maximo = Math.max(1, ...grupos.map(g => g.quantidade));
  const linhas = expandido ? grupos : grupos.slice(0, 5);
  return <section className="inventario-distribuicao" aria-label={titulo}>
    <div className="inventario-distribuicao-titulo"><h3>{titulo}</h3><span>{grupos.length} grupo{grupos.length === 1 ? '' : 's'}</span></div>
    {grupos.length === 0 ? <p className="inventario-painel-nota">Nenhum item nesta seleção.</p> : <ul>
      {linhas.map(g => <li key={g.id}><button type="button" onClick={() => selecionar(g.id)} aria-label={`Filtrar ${g.nome}: ${g.quantidade} itens`}>
        <span className="inventario-barra-nome">{g.nome}</span><strong>{g.quantidade.toLocaleString('pt-BR')}</strong>
        <span className="inventario-barra-trilho" aria-hidden="true"><span style={{ width: `${100 * g.quantidade / maximo}%` }} /></span>
      </button></li>)}
    </ul>}
    {grupos.length > 5 && <button className="btn btn-outline" type="button" onClick={() => setExpandido(!expandido)}>{expandido ? 'Mostrar menos' : `Ver todos os ${grupos.length} grupos`}</button>}
  </section>;
}

export function InventarioPainel({ filtros, selecionar, versao = 0 }: { filtros: FiltrosPainel; selecionar: (campo: 'unidadeId' | 'categoriaId' | 'tipoEquipamentoId', id: string) => void; versao?: number }) {
  const [resumo, setResumo] = useState<ResumoInventario | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [tentativa, setTentativa] = useState(0);
  const { busca, unidadeId, categoriaId, tipoEquipamentoId, status } = filtros;
  useEffect(() => {
    let ativa = true;
    setCarregando(true); setErro(''); setResumo(null);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      Object.entries({ busca, unidadeId, categoriaId, tipoEquipamentoId, status }).forEach(([k, v]) => { if (v) params.set(k, v); });
      api.get<ResumoInventario>(`/equipamentos/painel?${params}`).then(d => {
        if (!Array.isArray(d.porUnidade) || typeof d.total !== 'number') throw new Error('Resposta do painel inválida.');
        if (ativa) setResumo(d);
      }).catch((e: Error) => { if (ativa) setErro(e.message); }).finally(() => { if (ativa) setCarregando(false); });
    }, 250);
    return () => { ativa = false; window.clearTimeout(timer); };
  }, [busca, unidadeId, categoriaId, tipoEquipamentoId, status, tentativa, versao]);
  if (erro) return <section className="inventario-painel-erro" role="alert"><span>Não foi possível carregar os indicadores. {erro}</span><button type="button" className="btn btn-outline" onClick={() => setTentativa(t => t + 1)}>Atualizar painel</button></section>;
  return <div className="inventario-painel" aria-label="Painel gerencial do inventário" aria-busy={carregando}>
    <div className="inventario-painel-linha"><span className="inventario-painel-nota">Visão gerencial · todos os resultados dos filtros</span><span role="status" className="inventario-painel-nota">{carregando ? 'Atualizando indicadores…' : `Atualizado às ${new Date(resumo!.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}</span></div>
    <div className="inventario-indicadores">
      {[['Itens cadastrados', resumo?.total, 'Tombamentos únicos na seleção'], ['Unidades', resumo?.unidades, 'Unidades proprietárias com itens'], ['Categorias', resumo?.categorias, 'Classificações na seleção'], ['Famílias / tipos', resumo?.familias, 'Tipos de item cadastrados']].map(([nome, valor, nota]) => <div className="inventario-indicador" key={String(nome)}><span>{nome}</span><strong>{carregando ? '—' : Number(valor).toLocaleString('pt-BR')}</strong><small>{nota}</small></div>)}
    </div>
    {!carregando && resumo && <>
      <div className="inventario-painel-contexto" role="status"><span><b>{resumo.total.toLocaleString('pt-BR')}</b> itens correspondem à seleção atual.</span><span>{resumo.ativos} ativos · {resumo.emManutencao} em manutenção</span></div>
      <div className="inventario-graficos">
        <Distribuicao titulo="Itens por unidade" grupos={resumo.porUnidade} selecionar={id => selecionar('unidadeId', id)} />
        <Distribuicao titulo="Itens por categoria" grupos={resumo.porCategoria} selecionar={id => selecionar('categoriaId', id)} />
        <Distribuicao titulo="Itens por família / tipo" grupos={resumo.porFamilia} selecionar={id => selecionar('tipoEquipamentoId', id)} />
      </div>
    </>}
    <p className="inventario-painel-nota">Clique em um grupo para filtrar o painel e a lista. Contagem por unidade proprietária; empréstimos mantêm a origem e não duplicam tombamentos. Família corresponde ao tipo de item do cadastro.</p>
  </div>;
}
