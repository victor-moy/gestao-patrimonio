import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { normalizarWhatsapp } from '../src/modules/configuracoes/configuracoes.routes';
import { auth } from './helpers';

const app = criarApp();

describe('normalizarWhatsapp', () => {
  it.each([
    ['(47) 99999-9999', '5547999999999'],
    ['47 3333-4444', '554733334444'],
    ['+55 47 99999-9999', '5547999999999'],
    ['5547999999999', '5547999999999'],
  ])('aceita %s', (entrada, esperado) => {
    expect(normalizarWhatsapp(entrada)).toBe(esperado);
  });

  it.each(['abc', '123', '99999-9999', '+1 415 555 2671'])('recusa %s', (entrada) => {
    expect(() => normalizarWhatsapp(entrada)).toThrow();
  });
});

describe('Contato de atendimento (item não encontrado)', () => {
  it('qualquer usuário autenticado lê o WhatsApp configurado', async () => {
    prismaMock.configuracaoSistema.findUnique.mockResolvedValue({ chave: 'atendimento.whatsapp', valor: '5547999999999' } as never);
    const res = await request(app).get('/configuracoes/atendimento').set(auth('UNIDADE', { unidadeId: 'u1' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ whatsapp: '5547999999999' });
  });

  it('sem configuração devolve null', async () => {
    prismaMock.configuracaoSistema.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/configuracoes/atendimento').set(auth('UNIDADE', { unidadeId: 'u1' }));
    expect(res.body).toEqual({ whatsapp: null });
  });

  it('exige autenticação', async () => {
    expect((await request(app).get('/configuracoes/atendimento')).status).toBe(401);
  });

  it('só o Gestor de Patrimônio altera, normalizando o número e auditando', async () => {
    prismaMock.configuracaoSistema.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/configuracoes/atendimento')
      .set(auth('GESTOR_PATRIMONIO'))
      .send({ whatsapp: '(47) 99999-9999' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ whatsapp: '5547999999999' });
    expect(prismaMock.configuracaoSistema.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { chave: 'atendimento.whatsapp', valor: '5547999999999' } }),
    );
    expect(prismaMock.logAuditoria.create).toHaveBeenCalled();
  });

  it.each(['UNIDADE', 'GESTOR_MANUTENCAO', 'GALPAO'] as const)('%s não pode alterar', async (perfil) => {
    const res = await request(app)
      .put('/configuracoes/atendimento')
      .set(auth(perfil, { unidadeId: 'u1' }))
      .send({ whatsapp: '47999999999' });
    expect(res.status).toBe(403);
    expect(prismaMock.configuracaoSistema.upsert).not.toHaveBeenCalled();
  });

  it('número inválido é recusado', async () => {
    const res = await request(app).put('/configuracoes/atendimento').set(auth('GESTOR_PATRIMONIO')).send({ whatsapp: '123' });
    expect(res.status).toBe(422);
    expect(prismaMock.configuracaoSistema.upsert).not.toHaveBeenCalled();
  });

  it('campo vazio remove a configuração', async () => {
    prismaMock.configuracaoSistema.findUnique.mockResolvedValue({ chave: 'atendimento.whatsapp', valor: '5547999999999' } as never);
    const res = await request(app).put('/configuracoes/atendimento').set(auth('GESTOR_PATRIMONIO')).send({ whatsapp: '  ' });
    expect(res.body).toEqual({ whatsapp: null });
    expect(prismaMock.configuracaoSistema.delete).toHaveBeenCalled();
  });
});
