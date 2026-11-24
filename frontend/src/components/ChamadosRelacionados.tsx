import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { StatusPill } from './StatusPill';
import type { ChamadoRelacionado } from '../types';
import { codigoManutencao, statusManutencaoExibido } from '../utils/format';

// Chamados que a triagem ligou a este (continuam separados). Só aparece quando há algum.
export function ChamadosRelacionados({ manutencaoId, versao }: { manutencaoId: string; versao: string }) {
  const [lista, setLista] = useState<ChamadoRelacionado[]>([]);

  useEffect(() => {
    let ativo = true;
    api
      .get<ChamadoRelacionado[]>(`/manutencoes/${manutencaoId}/vinculos`, { silencioso: true })
      .then((l) => ativo && setLista(Array.isArray(l) ? l : []))
      .catch(() => ativo && setLista([])); // é só um complemento da tela: falhar não atrapalha
    return () => {
      ativo = false;
    };
  }, [manutencaoId, versao]);

  if (lista.length === 0) return null;
  return (
    <section className="equipamento-secao solicitacao-secao-texto" aria-labelledby="chamados-relacionados-titulo">
      <h3 id="chamados-relacionados-titulo">Chamados relacionados</h3>
      <ul className="chamados-relacionados">
        {lista.map((c) => {
          const status = statusManutencaoExibido(c);
          return (
            <li key={c.id}>
              <Link to={`/manutencoes/${c.id}`} aria-label={`Abrir ${codigoManutencao(c.numero)}${c.titulo ? ` · ${c.titulo}` : ''}`}>
                <span>
                  <span className="unidade-chamado-numero">{codigoManutencao(c.numero)}</span>
                  {c.titulo ? ` · ${c.titulo}` : ''}
                </span>
                <StatusPill valor={status.valor}>{status.texto}</StatusPill>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
