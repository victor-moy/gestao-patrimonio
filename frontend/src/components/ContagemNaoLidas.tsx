/** Contador de mensagens não lidas: bolinha com o número (99+ acima disso) e o texto completo para leitores de tela. */
export function ContagemNaoLidas({ total }: { total: number }) {
  return (
    <span className="contagem-nao-lidas">
      <span aria-hidden>{total > 99 ? '99+' : total}</span>
      <span className="gestao-sr-only">{total === 1 ? '1 mensagem não lida' : `${total} mensagens não lidas`}</span>
    </span>
  );
}
