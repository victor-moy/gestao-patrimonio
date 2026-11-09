import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { CategoriaCivil } from '../types';

// Categorias do chamado civil (ativas, com as perguntas ativas) para escolher na abertura e na avaliação
export function useCategoriasCivis(ativo = true) {
  const [categorias, setCategorias] = useState<CategoriaCivil[]>([]);
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo) return;
    setFalha(null);
    api
      .get<CategoriaCivil[]>('/categorias-civis')
      .then((l) => setCategorias(Array.isArray(l) ? l : []))
      .catch((e) => setFalha(e instanceof Error ? e.message : 'Não foi possível carregar os tipos de problema.'));
  }, [ativo]);

  return { categorias, falha };
}
