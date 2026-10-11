import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ListaCadastro } from '../../components/ListaCadastro';
import type { Unidade } from '../../types';
import { ROTULO_TIPO_UNIDADE } from '../../utils/format';

const VISUALIZACOES = [
  { valor: '', rotulo: 'Todas' },
  { valor: 'ativa', rotulo: 'Ativas' },
  { valor: 'inativa', rotulo: 'Inativas' },
];

export function Unidades() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setCarregando(true);
    setErro(null);
    api
      .get<Unidade[]>('/unidades?incluirInativos=true')
      .then(setUnidades)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar as unidades.'))
      .finally(() => setCarregando(false));
  }

  useEffect(carregar, []);

  return (
    <ListaCadastro
      id="unidades"
      titulo="Unidades"
      nomes={{
        singular: 'unidade',
        plural: 'unidades',
        nenhum: 'Nenhuma unidade cadastrada',
        nenhumEncontrado: 'Nenhuma unidade encontrada',
      }}
      acoes={
        <Link to="/configuracoes/unidades/nova" className="btn btn-primary">
          Nova unidade
        </Link>
      }
      itens={unidades}
      carregando={carregando}
      erro={erro}
      onRecarregar={carregar}
      chave={(u) => u.id}
      textoBusca={(u) => [u.nome, ROTULO_TIPO_UNIDADE[u.tipo], u.responsavel?.nome, u.emailBase, u.endereco]}
      visualizacoes={VISUALIZACOES}
      correspondeVisualizacao={(u, valor) => (valor === 'ativa' ? u.ativo : !u.ativo)}
      colunas={[
        {
          titulo: 'Unidade',
          celula: (u) => (
            <>
              <Link
                className="inventario-equipamento-link"
                to={`/configuracoes/unidades/${u.id}`}
                aria-label={`Editar unidade ${u.nome}`}
              >
                {u.nome}
              </Link>
              <div className="cadastro-sub">{ROTULO_TIPO_UNIDADE[u.tipo] ?? u.tipo}</div>
            </>
          ),
        },
        { titulo: 'Endereço', celula: (u) => u.endereco ?? '—' },
        { titulo: 'Responsável', celula: (u) => u.responsavel?.nome ?? '—' },
        { titulo: 'E-mail', celula: (u) => u.emailBase ?? '—' },
        {
          titulo: 'Status',
          celula: (u) => (
            <span className={`inventario-status inventario-status--tom-${u.ativo ? 'green' : 'gray'}`}>
              <span aria-hidden />
              {u.ativo ? 'Ativa' : 'Inativa'}
            </span>
          ),
        },
      ]}
    />
  );
}
