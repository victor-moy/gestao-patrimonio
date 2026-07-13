import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { auth } from './helpers';

const app = criarApp();

function enviarCsv(conteudo: string, perfil: 'GALPAO' | 'UNIDADE' = 'GALPAO') {
  return request(app)
    .post('/importacao/csv')
    .set(auth(perfil, { unidadeId: 'galpao-1' }))
    .attach('arquivo', Buffer.from(conteudo, 'utf-8'), 'inventario.csv');
}

const CSV_VALIDO = `tombamento,descricao,tipo_codigo,unidade,estado_conservacao,emenda_parlamentar
30001/2026,Autoclave Vertical 21L,AUT-V21,UBS Centro,BOM,nao
30002/2026,Autoclave Vertical 21L,AUT-V21,UBS Norte,OTIMO,sim`;

describe('Importação CSV (UC01, RF05, FA06)', () => {
  beforeEach(() => {
    prismaMock.unidade.findMany.mockResolvedValue([
      { id: 'u-1', nome: 'UBS Centro' },
      { id: 'u-2', nome: 'UBS Norte' },
    ] as never);
    prismaMock.tipoEquipamento.findMany.mockResolvedValue([
      { id: 't-1', codigo: 'AUT-V21' },
    ] as never);
    prismaMock.equipamento.findMany.mockResolvedValue([] as never);
    prismaMock.equipamento.create.mockResolvedValue({ id: 'novo', unidadeId: 'u-1' } as never);
  });

  it('importa arquivo válido com movimentações e auditoria', async () => {
    const res = await enviarCsv(CSV_VALIDO);
    expect(res.status).toBe(200);
    expect(res.body.importados).toBe(2);
    expect(res.body.conflitos).toEqual([]);
    expect(prismaMock.equipamento.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.movimentacao.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it('bloqueia arquivo sem as colunas obrigatórias (FA06)', async () => {
    const res = await enviarCsv('a,b,c\n1,2,3');
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('colunas ausentes');
    expect(prismaMock.equipamento.create).not.toHaveBeenCalled();
  });

  it('bloqueia integralmente arquivo com linhas inválidas (importação atômica)', async () => {
    const csv = `tombamento,descricao,tipo_codigo,unidade,estado_conservacao
30001/2026,Autoclave,AUT-V21,UBS Centro,BOM
,Sem tombamento,AUT-V21,UBS Centro,ESTADO_INVALIDO`;
    const res = await enviarCsv(csv);
    expect(res.status).toBe(422);
    expect(prismaMock.equipamento.create).not.toHaveBeenCalled();
  });

  it('ignora tombamentos já existentes e gera relatório de conflitos (FA06)', async () => {
    prismaMock.equipamento.findMany.mockResolvedValue([
      { tombamento: '30001/2026' },
    ] as never);
    const res = await enviarCsv(CSV_VALIDO);
    expect(res.status).toBe(200);
    expect(res.body.importados).toBe(1);
    expect(res.body.conflitos).toEqual(['30001/2026']);
  });

  it('bloqueia unidade/tipo não cadastrados', async () => {
    const csv = `tombamento,descricao,tipo_codigo,unidade,estado_conservacao
30001/2026,Autoclave,CODIGO-INEXISTENTE,UBS Inexistente,BOM`;
    const res = await enviarCsv(csv);
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('não cadastrad');
  });

  it('bloqueia tombamento duplicado dentro do próprio arquivo', async () => {
    const csv = `tombamento,descricao,tipo_codigo,unidade,estado_conservacao
30001/2026,Autoclave,AUT-V21,UBS Centro,BOM
30001/2026,Autoclave,AUT-V21,UBS Norte,BOM`;
    const res = await enviarCsv(csv);
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('duplicado');
  });

  it('somente Galpão e Gestor de Patrimônio importam (RBAC)', async () => {
    const res = await enviarCsv(CSV_VALIDO, 'UNIDADE');
    expect(res.status).toBe(403);
  });

  it('rejeita requisição sem arquivo', async () => {
    const res = await request(app)
      .post('/importacao/csv')
      .set(auth('GALPAO', { unidadeId: 'galpao-1' }));
    expect(res.status).toBe(422);
  });
});
