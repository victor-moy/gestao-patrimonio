import { Link } from 'react-router-dom';
import { ListaCadastro } from '../../components/ListaCadastro';
import { useListaCadastro } from '../../hooks/useCadastro';
import type { PrestadorServico } from '../../types';

export function Prestadores() {
  const { itens: prestadores, carregando, erro, recarregar: carregar } = useListaCadastro<PrestadorServico>(
    '/prestadores',
    'Não foi possível carregar os prestadores.',
  );

  return (
    <ListaCadastro
      id="prestadores"
      titulo="Prestadores de serviço"
      nomes={{
        singular: 'prestador',
        plural: 'prestadores',
        nenhum: 'Nenhum prestador cadastrado',
        nenhumEncontrado: 'Nenhum prestador encontrado',
      }}
      acoes={
        <Link to="/configuracoes/servicos/prestadores/novo" className="btn btn-primary">
          Novo prestador
        </Link>
      }
      itens={prestadores}
      carregando={carregando}
      erro={erro}
      onRecarregar={carregar}
      chave={(p) => p.id}
      textoBusca={(p) => [p.nome, p.cnpj, p.email, p.telefone]}
      colunas={[
        {
          titulo: 'Prestador',
          celula: (p) => (
            <Link
              className="inventario-equipamento-link"
              to={`/configuracoes/servicos/prestadores/${p.id}`}
              aria-label={`Editar prestador ${p.nome}`}
            >
              {p.nome}
            </Link>
          ),
        },
        { titulo: 'CNPJ', celula: (p) => p.cnpj ?? '—' },
        { titulo: 'Contato', celula: (p) => [p.telefone, p.email].filter(Boolean).join(' · ') || '—', larga: true },
        { titulo: 'Contratos', celula: (p) => p._count.contratos },
      ]}
    />
  );
}
