import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ListaCadastro } from '../../components/ListaCadastro';
import type { CategoriaCivil } from '../../types';

// Tipos de problema do chamado civil e as perguntas feitas a quem abre o chamado
export function CategoriasCivis() {
  const [categorias, setCategorias] = useState<CategoriaCivil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    setErro(null);
    api
      .get<CategoriaCivil[]>('/categorias-civis?todas=true')
      .then(setCategorias)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os tipos de chamados civis.'))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  return (
    <ListaCadastro
      id="categorias-civis"
      titulo="Tipos de chamados civis"
      nomes={{
        singular: 'tipo',
        plural: 'tipos de chamados civis',
        nenhum: 'Nenhum tipo cadastrado',
        nenhumEncontrado: 'Nenhum tipo encontrado',
      }}
      acoes={
        <Link to="/configuracoes/chamados/tipos-civis/nova" className="btn btn-primary">
          Novo tipo
        </Link>
      }
      itens={categorias}
      carregando={carregando}
      erro={erro}
      onRecarregar={carregar}
      chave={(c) => c.id}
      textoBusca={(c) => [c.nome, ...c.perguntas.map((p) => p.texto)]}
      colunas={[
        {
          titulo: 'Tipo',
          celula: (c) => (
            <Link className="inventario-equipamento-link" to={`/configuracoes/chamados/tipos-civis/${c.id}`} aria-label={`Editar tipo ${c.nome}`}>
              {c.nome}
            </Link>
          ),
        },
        { titulo: 'Perguntas', celula: (c) => c.perguntas.filter((p) => p.ativo).length },
        { titulo: 'Chamados', celula: (c) => c._count?.manutencoes ?? 0 },
      ]}
    />
  );
}
