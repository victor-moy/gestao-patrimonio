import { describe, expect, it } from 'vitest';
import { tituloConversa } from '../utils/conversas';

describe('Título da conversa', () => {
  it('usa o título dado ao pedido; sem título, mostra tipo e item', () => {
    expect(tituloConversa({ contexto: 'solicitacao', titulo: '  Consultório novo  ', tipoSolicitacao: 'AMPLIACAO', item: 'Autoclave' })).toBe('Consultório novo');
    expect(tituloConversa({ contexto: 'solicitacao', titulo: null, tipoSolicitacao: 'AMPLIACAO', item: 'Autoclave' })).toBe('Ampliação · Autoclave');
    expect(tituloConversa({ contexto: 'manutencao', titulo: '   ', tipoSolicitacao: null, item: 'Microscópio' })).toBe('Manutenção · Microscópio');
  });
});
