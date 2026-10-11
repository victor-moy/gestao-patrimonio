import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evitarZoomAoFocarCampos } from '../utils/zoomCampos';

const PADRAO = 'width=device-width, initial-scale=1.0';

describe('Zoom ao focar campos (iOS)', () => {
  let meta: HTMLMetaElement;
  let desfazer: () => void;

  beforeEach(() => {
    document.head.innerHTML = `<meta name="viewport" content="${PADRAO}" />`;
    document.body.innerHTML = '<input id="texto" /><select id="lista"></select><textarea id="area"></textarea><input id="marca" type="checkbox" /><button id="botao">ok</button>';
    meta = document.querySelector('meta[name="viewport"]')!;
    desfazer = evitarZoomAoFocarCampos();
  });
  afterEach(() => desfazer());

  it('trava o zoom enquanto um campo está em foco e libera ao sair, sem mexer no zoom por pinça fora disso', () => {
    expect(meta.content).toBe(PADRAO);
    fireEvent.focusIn(document.getElementById('texto')!);
    expect(meta.content).toBe(`${PADRAO}, maximum-scale=1`);
    fireEvent.focusOut(document.getElementById('texto')!);
    expect(meta.content).toBe(PADRAO);
  });

  it('já trava no toque (que vem antes do foco), para valer antes de o navegador decidir o zoom', () => {
    fireEvent.touchStart(document.getElementById('area')!);
    expect(meta.content).toContain('maximum-scale=1');
  });

  it('vale para seletores e áreas de texto, mas não para botões nem caixas de marcação', () => {
    fireEvent.focusIn(document.getElementById('lista')!);
    expect(meta.content).toContain('maximum-scale=1');
    fireEvent.focusOut(document.getElementById('lista')!);
    fireEvent.focusIn(document.getElementById('botao')!);
    expect(meta.content).toBe(PADRAO);
    fireEvent.focusIn(document.getElementById('marca')!);
    expect(meta.content).toBe(PADRAO);
  });

  it('ao desfazer, devolve o viewport original', () => {
    fireEvent.focusIn(document.getElementById('texto')!);
    desfazer();
    expect(meta.content).toBe(PADRAO);
    desfazer = evitarZoomAoFocarCampos();
  });
});
