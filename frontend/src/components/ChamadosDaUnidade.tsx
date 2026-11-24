import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { StatusPill } from './StatusPill';
import type { ChamadoDaUnidade, EventoManutencao, Manutencao, StatusManutencao } from '../types';
import { codigoManutencao, formatarData, formatarDataHora, statusManutencaoExibido } from '../utils/format';
import { rotuloEventoManutencao } from '../utils/manutencao';

type Executar = (operacao: () => Promise<unknown>) => Promise<void>;

// Os grupos da lista: o triador quer ver o que está aberto, programado, em rota, em execução e concluído
const GRUPOS: Array<{ valor: string; rotulo: string; status: StatusManutencao[] }> = [
  { valor: '', rotulo: 'Todos', status: [] },
  {
    valor: 'ABERTOS',
    rotulo: 'Abertos',
    status: ['PENDENTE_APROVACAO', 'AGUARDANDO_AVALIACAO_TECNICA', 'AGUARDANDO_VISTORIA', 'AVALIADO', 'AGUARDANDO_ORCAMENTO', 'ORCAMENTO_REGISTRADO', 'BLOQUEADO', 'REENCAMINHAMENTO_SOLICITADO'],
  },
  { valor: 'PROGRAMADOS', rotulo: 'Programados', status: ['AGUARDANDO_EXECUCAO'] },
  { valor: 'EM_ROTA', rotulo: 'Em rota', status: ['EM_ROTA'] },
  { valor: 'EM_EXECUCAO', rotulo: 'Em execução', status: ['EM_EXECUCAO', 'EXECUTADO', 'AGUARDANDO_RETORNO', 'AGUARDANDO_MEDICAO'] },
  { valor: 'CONCLUIDOS', rotulo: 'Concluídos', status: ['CONCLUIDA'] },
  { valor: 'ENCERRADOS', rotulo: 'Negados e encerrados', status: ['NEGADA', 'ENCERRADA', 'BAIXADO'] },
];

// Com estes status o chamado já acabou: não dá para unificar outro a ele
const STATUS_FINAIS: StatusManutencao[] = ['CONCLUIDA', 'NEGADA', 'ENCERRADA', 'BAIXADO'];

function marcas(c: ChamadoDaUnidade) {
  return [
    c.relacao.categoria && 'Mesma categoria',
    c.relacao.setor && 'Mesmo setor',
    c.relacao.equipamento && 'Mesmo equipamento',
    !c.relacao.equipamento && c.relacao.tipoEquipamento && 'Mesmo tipo de equipamento',
  ].filter((m): m is string => Boolean(m));
}

// Ao lado do chamado na triagem: o que já existe na unidade, para decidir sem abrir chamado em duplicidade.
export function ChamadosDaUnidade({ m, executar, ocupado, aoMudarRelacao }: { m: Manutencao; executar: Executar; ocupado: boolean; aoMudarRelacao: () => void }) {
  const [lista, setLista] = useState<ChamadoDaUnidade[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [grupo, setGrupo] = useState('');
  const [soRelacionados, setSoRelacionados] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [historicos, setHistoricos] = useState<Record<string, EventoManutencao[] | 'falhou'>>({});
  const [unificando, setUnificando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [agindo, setAgindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const civil = m.tipo === 'CIVIL';

  const carregar = useCallback(() => {
    api
      .get<ChamadoDaUnidade[]>(`/manutencoes/${m.id}/da-unidade`)
      .then((l) => {
        setLista(Array.isArray(l) ? l : []);
        setFalha(null);
      })
      .catch((e) => setFalha(e instanceof Error ? e.message : 'Não foi possível carregar os chamados da unidade.'));
  }, [m.id]);

  useEffect(carregar, [carregar]);

  const visiveis = useMemo(() => {
    const status = GRUPOS.find((g) => g.valor === grupo)?.status ?? [];
    return (lista ?? []).filter((c) => (status.length === 0 || status.includes(c.status)) && (!soRelacionados || c.relacionado || c.vinculado));
  }, [lista, grupo, soRelacionados]);

  async function alternarHistorico(id: string) {
    if (aberto === id) {
      setAberto(null);
      return;
    }
    setAberto(id);
    if (historicos[id]) return;
    try {
      const eventos = await api.get<EventoManutencao[]>(`/manutencoes/${id}/historico`);
      setHistoricos((atuais) => ({ ...atuais, [id]: Array.isArray(eventos) ? eventos : [] }));
    } catch {
      setHistoricos((atuais) => ({ ...atuais, [id]: 'falhou' }));
    }
  }

  async function alternarVinculo(c: ChamadoDaUnidade) {
    if (agindo) return;
    setAgindo(true);
    setErro(null);
    try {
      if (c.vinculado) await api.delete(`/manutencoes/${m.id}/vinculos/${c.id}`);
      else await api.post(`/manutencoes/${m.id}/vincular`, { relacionadaId: c.id });
      carregar();
      aoMudarRelacao();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível atualizar a relação.');
    } finally {
      setAgindo(false);
    }
  }

  function cancelarUnificacao() {
    setUnificando(null);
    setMotivo('');
  }

  return (
    <aside className="equipamento-secao unidade-chamados" aria-labelledby="unidade-chamados-titulo">
      <h3 id="unidade-chamados-titulo">
        Chamados da unidade
        {lista && <span className="unidade-chamados-total">{lista.length}</span>}
      </h3>

      <div className="unidade-chamados-filtros">
        <div className="field">
          <label htmlFor="unidade-chamados-situacao">Situação</label>
          <select id="unidade-chamados-situacao" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            {GRUPOS.map((g) => (
              <option key={g.valor} value={g.valor}>
                {g.rotulo}
              </option>
            ))}
          </select>
        </div>
        <label className="checkbox-linha interruptor-linha" htmlFor="unidade-chamados-relacionados">
          <input id="unidade-chamados-relacionados" type="checkbox" role="switch" checked={soRelacionados} onChange={(e) => setSoRelacionados(e.target.checked)} />
          <span>Só parecidos</span>
        </label>
      </div>

      {erro && <p className="itens-aviso itens-aviso--acao" role="alert">{erro}</p>}
      {falha && (
        <div className="error-banner" role="alert">
          {falha}{' '}
          <button type="button" className="btn-link" onClick={carregar}>
            Tentar de novo
          </button>
        </div>
      )}
      {!lista && !falha && <p className="unidade-chamados-vazio" role="status">Carregando…</p>}
      {lista && visiveis.length === 0 && (
        <p className="unidade-chamados-vazio" role="status">
          {lista.length === 0 ? 'Não há outros chamados desta unidade.' : 'Nenhum chamado com esse filtro.'}
        </p>
      )}

      {visiveis.length > 0 && (
        <ul className="unidade-chamados-lista">
          {visiveis.map((c) => {
            const codigo = codigoManutencao(c.numero);
            const status = statusManutencaoExibido(c);
            const historico = historicos[c.id];
            const finalizado = STATUS_FINAIS.includes(c.status);
            return (
              <li key={c.id} className="unidade-chamado">
                <div className="unidade-chamado-topo">
                  <Link to={`/manutencoes/${c.id}`} target="_blank" rel="noopener noreferrer" className="unidade-chamado-link" aria-label={`Abrir ${codigo}${c.titulo ? ` · ${c.titulo}` : ''}`}>
                    <span className="unidade-chamado-numero">{codigo}</span>
                    {c.titulo && <span className="unidade-chamado-titulo">{c.titulo}</span>}
                  </Link>
                  <StatusPill valor={status.valor}>{status.texto}</StatusPill>
                </div>
                <div className="unidade-chamado-sub">
                  {[c.categoria ?? c.equipamento, c.localAfetado, `aberto em ${formatarData(c.criadoEm)}`].filter(Boolean).join(' · ')}
                </div>
                {(marcas(c).length > 0 || c.vinculado) && (
                  <ul className="unidade-chamado-marcas" aria-label="O que tem em comum">
                    {marcas(c).map((marca) => (
                      <li key={marca}>{marca}</li>
                    ))}
                    {c.vinculado && <li className="ligado">Relacionado</li>}
                  </ul>
                )}
                <div className="unidade-chamado-acoes">
                  <button type="button" className="btn-link" aria-expanded={aberto === c.id} aria-label={`Histórico de ${codigo}`} onClick={() => void alternarHistorico(c.id)}>
                    {aberto === c.id ? 'Ocultar histórico' : 'Histórico'}
                  </button>
                  <button type="button" className="btn-link" disabled={agindo || ocupado} aria-label={`${c.vinculado ? 'Desfazer relação com' : 'Relacionar com'} ${codigo}`} onClick={() => void alternarVinculo(c)}>
                    {c.vinculado ? 'Desfazer relação' : 'Relacionar'}
                  </button>
                  <button
                    type="button"
                    className="btn-link"
                    disabled={finalizado || ocupado}
                    title={finalizado ? 'Este chamado já foi concluído, negado ou encerrado' : undefined}
                    aria-label={`Unificar com ${codigo}`}
                    onClick={() => setUnificando(c.id)}
                  >
                    Unificar
                  </button>
                </div>

                {aberto === c.id &&
                  (historico === 'falhou' ? (
                    <p className="unidade-chamados-vazio" role="alert">Não foi possível carregar o histórico.</p>
                  ) : !historico ? (
                    <p className="unidade-chamados-vazio" role="status">Carregando histórico…</p>
                  ) : historico.length === 0 ? (
                    <p className="unidade-chamados-vazio">Sem eventos registrados.</p>
                  ) : (
                    <ol className="unidade-historico" aria-label={`Histórico de ${codigo}`}>
                      {historico.map((e) => (
                        <li key={e.id}>
                          {rotuloEventoManutencao(e, m.tipo)}
                          <time dateTime={e.criadoEm}>
                            {e.usuario ? `${e.usuario} · ` : ''}
                            {formatarDataHora(e.criadoEm)}
                          </time>
                        </li>
                      ))}
                    </ol>
                  ))}

                {unificando === c.id && (
                  <div className="unidade-unificar" role="group" aria-label={`Unificar com ${codigo}`}>
                    <p>
                      Este chamado será <strong>encerrado como unificado</strong> ao {codigo}.{' '}
                      {civil
                        ? `Se o ${codigo} ainda não foi ao prestador, o problema e as fotos deste chamado são acrescentados a ele.`
                        : 'O equipamento volta a ficar disponível.'}
                    </p>
                    <div className="field">
                      <label htmlFor="unidade-unificar-motivo">Motivo (opcional)</label>
                      <input id="unidade-unificar-motivo" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                    </div>
                    <div className="actions-row">
                      <button type="button" className="btn btn-outline" onClick={cancelarUnificacao}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={ocupado}
                        onClick={() => void executar(() => api.post(`/manutencoes/${m.id}/unificar`, { chamadoOriginalId: c.id, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }))}
                      >
                        Confirmar unificação
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
