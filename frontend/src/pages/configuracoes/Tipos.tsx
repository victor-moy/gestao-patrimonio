import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ListaCadastro } from '../../components/ListaCadastro';
import type { TipoEquipamento } from '../../types';
import { formatarMoeda } from '../../utils/format';

export function Tipos() {
  const [tipos, setTipos] = useState<TipoEquipamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    setErro(null);
    api
      .get<TipoEquipamento[]>('/categorias/tipos')
      .then(setTipos)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os tipos.'))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  return (
    <ListaCadastro
      id="tipos"
      titulo="Tipos de itens"
      nomes={{
        singular: 'tipo',
        plural: 'tipos',
        nenhum: 'Nenhum tipo cadastrado',
        nenhumEncontrado: 'Nenhum tipo encontrado',
      }}
      acoes={
        <Link to="/configuracoes/tipos/novo" className="btn btn-primary">
          Novo tipo
        </Link>
      }
      itens={tipos}
      carregando={carregando}
      erro={erro}
      onRecarregar={carregar}
      chave={(t) => t.id}
      textoBusca={(t) => [t.codigo, t.nome, t.categoria?.nome, t.descricao]}
      colunas={[
        {
          titulo: 'Tipo',
          celula: (t) => (
            <>
              <Link
                className="inventario-equipamento-link"
                to={`/configuracoes/tipos/${t.id}`}
                aria-label={`Editar tipo ${t.nome}`}
              >
                {t.nome}
              </Link>
              <div className="cadastro-sub">{t.codigo}</div>
            </>
          ),
        },
        { titulo: 'Categoria', celula: (t) => t.categoria?.nome ?? '—' },
        { titulo: 'Preço de referência', celula: (t) => (t.preco ? formatarMoeda(t.preco) : '—') },
        { titulo: 'Equipamentos', celula: (t) => t.quantidadeEquipamentos ?? 0 },
      ]}
    />
  );
}
