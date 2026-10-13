import { Link } from 'react-router-dom';
import { ListaCadastro } from '../../components/ListaCadastro';
import { useListaCadastro } from '../../hooks/useCadastro';
import type { EscopoServico } from '../../types';

export function EscoposServico() {
  const { itens: escopos, carregando, erro, recarregar: carregar } = useListaCadastro<EscopoServico>(
    '/escopos-servico',
    'Não foi possível carregar os escopos.',
  );

  return (
    <ListaCadastro
      id="escopos-servico"
      titulo="Escopos de serviço"
      nomes={{
        singular: 'escopo',
        plural: 'escopos',
        nenhum: 'Nenhum escopo cadastrado',
        nenhumEncontrado: 'Nenhum escopo encontrado',
      }}
      acoes={
        <Link to="/configuracoes/servicos/escopos/novo" className="btn btn-primary">
          Novo escopo
        </Link>
      }
      itens={escopos}
      carregando={carregando}
      erro={erro}
      onRecarregar={carregar}
      chave={(s) => s.id}
      textoBusca={(s) => [s.nome, s.descricao]}
      colunas={[
        {
          titulo: 'Escopo',
          celula: (s) => (
            <Link
              className="inventario-equipamento-link"
              to={`/configuracoes/servicos/escopos/${s.id}`}
              aria-label={`Editar escopo ${s.nome}`}
            >
              {s.nome}
            </Link>
          ),
        },
        { titulo: 'Descrição', celula: (s) => s.descricao ?? '—', larga: true },
        { titulo: 'Em contratos', celula: (s) => s._count.itens },
      ]}
    />
  );
}
