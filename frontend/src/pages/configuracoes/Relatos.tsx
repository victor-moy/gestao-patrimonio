import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ListaCadastro } from '../../components/ListaCadastro';
import { StatusPill } from '../../components/StatusPill';
import type { RelatoProblema } from '../../types';
import { formatarDataHora, ROTULO_PERFIL } from '../../utils/format';
import { ROTULO_STATUS_RELATO } from '../../utils/relato';

const VISUALIZACOES = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'ABERTO', rotulo: 'Abertos' },
  { valor: 'EM_ANALISE', rotulo: 'Em análise' },
  { valor: 'RESOLVIDO', rotulo: 'Resolvidos' },
];

function resumo(texto: string) {
  return texto.length > 90 ? `${texto.slice(0, 90)}…` : texto;
}

export function Relatos() {
  const [relatos, setRelatos] = useState<RelatoProblema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    setErro(null);
    api
      .get<RelatoProblema[]>('/relatos')
      .then(setRelatos)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os relatos.'))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  return (
    <ListaCadastro
      id="relatos"
      titulo="Bugs reportados"
      nomes={{
        singular: 'bug',
        plural: 'bugs',
        nenhum: 'Nenhum bug reportado',
        nenhumEncontrado: 'Nenhum bug encontrado',
      }}
      acoes={null}
      itens={relatos}
      carregando={carregando}
      erro={erro}
      onRecarregar={carregar}
      chave={(r) => r.id}
      textoBusca={(r) => [r.aconteceu, r.esperado, r.tela, r.usuario.nome, r.usuario.email]}
      visualizacoes={VISUALIZACOES}
      correspondeVisualizacao={(r, valor) => r.status === valor}
      colunas={[
        {
          titulo: 'Relato',
          larga: true,
          celula: (r) => (
            <>
              <Link className="inventario-equipamento-link" to={`/configuracoes/relatos/${r.id}`} aria-label={`Abrir bug: ${resumo(r.aconteceu)}`}>
                {resumo(r.aconteceu)}
              </Link>
              <div className="cadastro-sub">{r.tela}</div>
            </>
          ),
        },
        {
          titulo: 'Quem enviou',
          celula: (r) => (
            <>
              <div>{r.usuario.nome}</div>
              <div className="cadastro-sub">{ROTULO_PERFIL[r.perfil]}</div>
            </>
          ),
        },
        { titulo: 'Enviado em', celula: (r) => formatarDataHora(r.criadoEm) },
        {
          titulo: 'Status',
          celula: (r) => <StatusPill valor={r.status}>{ROTULO_STATUS_RELATO[r.status]}</StatusPill>,
        },
      ]}
    />
  );
}
