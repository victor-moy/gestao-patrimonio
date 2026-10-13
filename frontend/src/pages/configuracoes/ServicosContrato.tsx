import { Link } from 'react-router-dom';
import { ListaCadastro } from '../../components/ListaCadastro';
import { useListaCadastro } from '../../hooks/useCadastro';
import type { ServicoContrato } from '../../types';

export function ServicosContrato() {
  const { itens: servicos, carregando, erro, recarregar: carregar } = useListaCadastro<ServicoContrato>(
    '/servicos-contrato',
    'Não foi possível carregar os tipos de serviço.',
  );

  return (
    <ListaCadastro
      id="servicos-contrato"
      titulo="Tipos de serviço"
      nomes={{
        singular: 'tipo de serviço',
        plural: 'tipos de serviço',
        nenhum: 'Nenhum tipo de serviço cadastrado',
        nenhumEncontrado: 'Nenhum tipo de serviço encontrado',
      }}
      acoes={
        <Link to="/configuracoes/servicos/tipos/novo" className="btn btn-primary">
          Novo tipo de serviço
        </Link>
      }
      itens={servicos}
      carregando={carregando}
      erro={erro}
      onRecarregar={carregar}
      chave={(s) => s.id}
      textoBusca={(s) => [s.nome, s.descricao]}
      colunas={[
        {
          titulo: 'Tipo de serviço',
          celula: (s) => (
            <Link
              className="inventario-equipamento-link"
              to={`/configuracoes/servicos/tipos/${s.id}`}
              aria-label={`Editar tipo de serviço ${s.nome}`}
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
