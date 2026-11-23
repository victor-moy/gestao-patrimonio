import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ListaCadastro } from '../../components/ListaCadastro';
import { StatusPill } from '../../components/StatusPill';
import type { RelatoProblema } from '../../types';
import { formatarDataHora, ROTULO_PERFIL } from '../../utils/format';
import { pode } from '../../utils/permissoes';
import { codigoSuporte, ROTULO_CATEGORIA_RELATO, ROTULO_STATUS_RELATO, telaDeOrigem } from '../../utils/relato';

const VISUALIZACOES_PESSOA = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'ANDAMENTO', rotulo: 'Em andamento' },
  { valor: 'AGUARDANDO_RETORNO', rotulo: 'Aguardando meu retorno' },
  { valor: 'RESOLVIDO', rotulo: 'Resolvidos' },
];

const VISUALIZACOES_ATENDIMENTO = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'ABERTO', rotulo: 'Abertos' },
  { valor: 'EM_ANALISE', rotulo: 'Em análise' },
  { valor: 'AGUARDANDO_RETORNO', rotulo: 'Aguardando retorno' },
  { valor: 'RESOLVIDO', rotulo: 'Resolvidos' },
  { valor: 'MEUS', rotulo: 'Abertos por mim' },
];

// Suporte: quem abre chamados vê os próprios; quem atende (SUPORTE_ATENDER) vê todos, com um filtro para os que abriu.
export function Suporte() {
  const { usuario } = useAuth();
  const atendente = usuario?.perfil === 'OPERADOR' && pode(usuario, 'SUPORTE_ATENDER');
  // A tela de onde a pessoa veio (levada pelo menu) segue para o formulário de novo chamado
  const [params] = useSearchParams();
  const origem = telaDeOrigem(params.get('de'));
  const [chamados, setChamados] = useState<RelatoProblema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    setErro(null);
    api
      .get<RelatoProblema[]>(atendente ? '/relatos' : '/relatos/meus')
      .then(setChamados)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os chamados.'))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, [atendente]);

  return (
    <ListaCadastro
      id="suporte"
      titulo={atendente ? 'Chamados de suporte' : 'Meus chamados de suporte'}
      nomes={{
        singular: 'chamado',
        plural: 'chamados',
        nenhum: atendente ? 'Nenhum chamado de suporte' : 'Você ainda não abriu nenhum chamado',
        nenhumEncontrado: 'Nenhum chamado encontrado',
      }}
      acoes={
        <Link to={`/suporte/novo?de=${encodeURIComponent(origem)}`} className="btn btn-primary">
          Novo chamado
        </Link>
      }
      itens={chamados}
      carregando={carregando}
      erro={erro}
      onRecarregar={carregar}
      chave={(c) => c.id}
      textoBusca={(c) => [codigoSuporte(c.numero), c.titulo, c.aconteceu, c.tela, ROTULO_CATEGORIA_RELATO[c.categoria], ...(atendente ? [c.usuario.nome, c.usuario.email] : [])]}
      visualizacoes={atendente ? VISUALIZACOES_ATENDIMENTO : VISUALIZACOES_PESSOA}
      correspondeVisualizacao={(c, valor) => {
        if (valor === 'ANDAMENTO') return c.status === 'ABERTO' || c.status === 'EM_ANALISE';
        if (valor === 'MEUS') return c.usuario.id === usuario?.id;
        return c.status === valor;
      }}
      colunas={[
        {
          titulo: 'Chamado',
          larga: true,
          celula: (c) => (
            <>
              <span className="rel-numero">{codigoSuporte(c.numero)}</span>
              <Link className="inventario-equipamento-link" to={`/suporte/${c.id}`}>
                {c.titulo ?? c.tela}
              </Link>
              {atendente && <div className="cadastro-sub">{c.tela}</div>}
            </>
          ),
        },
        { titulo: 'Categoria', celula: (c) => ROTULO_CATEGORIA_RELATO[c.categoria] },
        ...(atendente
          ? [
              {
                titulo: 'Quem abriu',
                celula: (c: RelatoProblema) => (
                  <>
                    <div>{c.usuario.nome}</div>
                    <div className="cadastro-sub">{ROTULO_PERFIL[c.perfil]}</div>
                  </>
                ),
              },
            ]
          : []),
        { titulo: 'Atualizado em', celula: (c) => formatarDataHora(c.atualizadoEm) },
        { titulo: 'Status', celula: (c) => <StatusPill valor={c.status}>{ROTULO_STATUS_RELATO[c.status]}</StatusPill> },
      ]}
    />
  );
}
