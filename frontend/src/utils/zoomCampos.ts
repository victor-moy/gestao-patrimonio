const CAMPOS = "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='color']), select, textarea";

/**
 * O Safari do iOS dá zoom na tela ao focar um campo com fonte menor que 16 px. Em vez de aumentar a fonte
 * dos campos, o zoom fica travado (`maximum-scale=1`) só enquanto um campo está em foco e é liberado ao
 * sair dele: o zoom por pinça continua disponível no resto do tempo (acessibilidade).
 * Devolve a função que desfaz os ouvintes.
 */
export function evitarZoomAoFocarCampos(documento: Document = document) {
  const meta = documento.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return () => undefined;
  const padrao = meta.content;
  const travado = `${padrao}, maximum-scale=1`;

  const ehCampo = (alvo: EventTarget | null) => alvo instanceof Element && alvo.matches(CAMPOS);
  const travar = (e: Event) => {
    if (ehCampo(e.target)) meta.content = travado;
  };
  const liberar = (e: Event) => {
    if (ehCampo(e.target)) meta.content = padrao;
  };

  // `touchstart` vem antes do foco: o limite precisa valer antes de o navegador decidir dar o zoom
  documento.addEventListener('touchstart', travar, { capture: true, passive: true });
  documento.addEventListener('focusin', travar);
  documento.addEventListener('focusout', liberar);
  return () => {
    documento.removeEventListener('touchstart', travar, { capture: true });
    documento.removeEventListener('focusin', travar);
    documento.removeEventListener('focusout', liberar);
    meta.content = padrao;
  };
}
