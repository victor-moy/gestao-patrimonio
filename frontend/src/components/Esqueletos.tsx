// Placeholders de carregamento (skeleton): mantêm o desenho da tela enquanto os dados chegam,
// para o conteúdo "assentar" no lugar em vez de a página saltar de vazia para cheia.

const LARGURAS = [62, 78, 54, 70, 46, 66];

export function EsqueletoTabela({ colunas, linhas = 6 }: { colunas: number; linhas?: number }) {
  return (
    <>
      <tr className="esqueleto-linha">
        <td colSpan={colunas} className="gestao-sr-only">
          <span role="status">Carregando…</span>
        </td>
      </tr>
      {Array.from({ length: linhas }, (_, linha) => (
        <tr key={linha} className="esqueleto-linha" aria-hidden>
          {Array.from({ length: colunas }, (_, coluna) => (
            <td key={coluna}>
              <span
                className="esqueleto"
                style={{ width: `${coluna === 0 ? 72 : LARGURAS[(linha + coluna) % LARGURAS.length]}%` }}
              />
              {coluna === 0 && <span className="esqueleto esqueleto--sub" />}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Página de detalhe (solicitação, manutenção, equipamento): título e dois cards lado a lado.
export function EsqueletoDetalhe({ rotulo }: { rotulo: string }) {
  return (
    <section className="gestao-page equipamento-pagina esqueleto-detalhe" aria-busy="true">
      <span className="gestao-sr-only" role="status">{rotulo}</span>
      <div className="esqueleto esqueleto--titulo" aria-hidden />
      <div className="esqueleto-detalhe-grade" aria-hidden>
        <div className="equipamento-secao">
          <span className="esqueleto esqueleto--secao" />
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="esqueleto" style={{ width: `${[48, 64, 40, 58, 52, 70][i]}%` }} />
          ))}
        </div>
        <div className="equipamento-secao">
          <span className="esqueleto esqueleto--secao" />
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="esqueleto" style={{ width: `${[60, 44, 52][i]}%` }} />
          ))}
        </div>
      </div>
    </section>
  );
}
