import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Setor } from '../../types';

// Setores da unidade: cadastro e exclusão dentro do detalhe da unidade (o avaliador técnico escolhe o setor do chamado).
// Fica dentro do formulário da unidade, então todo botão é type="button" e o Enter não envia o formulário.
export function SetoresDaUnidade({ unidadeId, onErro }: { unidadeId: string; onErro: (mensagem: string) => void }) {
  const [setores, setSetores] = useState<Setor[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [novo, setNovo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    setFalha(null);
    api
      .get<Setor[]>(`/setores?unidadeId=${encodeURIComponent(unidadeId)}`)
      .then(setSetores)
      .catch((e) => setFalha(e instanceof Error ? e.message : 'Não foi possível carregar os setores.'));
  }, [unidadeId]);

  useEffect(carregar, [carregar]);

  async function executar(operacao: () => Promise<unknown>) {
    if (ocupado) return;
    setOcupado(true);
    try {
      await operacao();
      carregar();
    } catch (e) {
      onErro(e instanceof Error ? e.message : 'Não foi possível concluir a operação.');
    } finally {
      setOcupado(false);
    }
  }

  const adicionar = () =>
    executar(async () => {
      await api.post('/setores', { nome: novo.trim(), unidadeId });
      setNovo('');
    });

  const excluir = (s: Setor) => {
    if (!window.confirm(`Excluir o setor "${s.nome}"?`)) return;
    void executar(() => api.delete(`/setores/${s.id}`));
  };

  return (
    <section className="equipamento-secao" aria-labelledby="setores-unidade-titulo">
      <h3 id="setores-unidade-titulo">Setores</h3>
      {falha && (
        <div className="error-banner" role="alert">
          {falha}{' '}
          <button type="button" className="btn btn-outline" onClick={carregar}>
            Tentar novamente
          </button>
        </div>
      )}
      <div className="setores-novo">
        <input
          aria-label="Novo setor"
          placeholder="Nome do setor"
          maxLength={80}
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (novo.trim().length >= 2) void adicionar();
            }
          }}
        />
        <button type="button" className="btn btn-outline" disabled={ocupado || novo.trim().length < 2} onClick={() => void adicionar()}>
          Adicionar
        </button>
      </div>
      {setores && setores.length > 0 && (
        <ul className="setores-lista">
          {setores.map((s) => (
            <li key={s.id}>
              <span className="setores-nome">
                {s.nome}
                {!s.ativo && <span className="setores-inativo"> · inativo</span>}
              </span>
              <button type="button" className="avaliacao-remover" disabled={ocupado} aria-label={`Excluir o setor ${s.nome}`} onClick={() => excluir(s)}>
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
      {setores && setores.length === 0 && !falha && <p className="itens-aviso">Nenhum setor cadastrado nesta unidade.</p>}
    </section>
  );
}
