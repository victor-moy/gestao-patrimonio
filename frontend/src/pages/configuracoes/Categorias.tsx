import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ListaCadastro } from '../../components/ListaCadastro';
import type { Categoria } from '../../types';

export function Categorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    setErro(null);
    api
      .get<Categoria[]>('/categorias')
      .then(setCategorias)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar as categorias.'))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  return (
    <ListaCadastro
      id="categorias"
      titulo="Categorias de itens"
      nomes={{
        singular: 'categoria',
        plural: 'categorias',
        nenhum: 'Nenhuma categoria cadastrada',
        nenhumEncontrado: 'Nenhuma categoria encontrada',
      }}
      acoes={
        <Link to="/configuracoes/categorias/nova" className="btn btn-primary">
          Nova categoria
        </Link>
      }
      itens={categorias}
      carregando={carregando}
      erro={erro}
      onRecarregar={carregar}
      chave={(c) => c.id}
      textoBusca={(c) => [c.nome, c.descricao]}
      colunas={[
        {
          titulo: 'Categoria',
          celula: (c) => (
            <>
              <Link
                className="inventario-equipamento-link"
                to={`/configuracoes/categorias/${c.id}`}
                aria-label={`Editar categoria ${c.nome}`}
              >
                {c.nome}
              </Link>
            </>
          ),
        },
        { titulo: 'Descrição', celula: (c) => c.descricao ?? '—' },
        { titulo: 'Tipos', celula: (c) => c.tipos.length },
      ]}
    />
  );
}
