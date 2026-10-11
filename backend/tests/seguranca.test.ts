/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules exige require para reavaliar o módulo */
import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { prismaMock } from './prisma-mock';
import { criarApp } from '../src/app';
import { tratarErros } from '../src/middlewares/error';
import { limitarFrequencia } from '../src/middlewares/rateLimit';
import { FOTOS_DIR } from '../src/lib/uploads';
import { auth } from './helpers';

const app = criarApp();
const NOME = '4fa8b6a4-6f7e-4f7e-8b6a-46f7e4f7e8b6.pdf';

describe('Limite de frequência', () => {
  it('bloqueia com 429 depois de exceder o máximo na janela', async () => {
    const mini = express();
    mini.get('/x', limitarFrequencia({ janelaMs: 60_000, max: 2 }), (_req, res) => res.json({ ok: true }));
    mini.use(tratarErros);
    expect((await request(mini).get('/x')).status).toBe(200);
    expect((await request(mini).get('/x')).status).toBe(200);
    expect((await request(mini).get('/x')).status).toBe(429);
  });
});

describe('Arquivos protegidos (/uploads)', () => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  beforeAll(() => fs.writeFileSync(path.join(FOTOS_DIR, NOME), '%PDF-1.4 teste'));
  afterAll(() => fs.rmSync(path.join(FOTOS_DIR, NOME), { force: true }));

  it('exige autenticação para anexos de solicitação', async () => {
    const res = await request(app).get(`/uploads/solicitacoes/${NOME}`);
    expect(res.status).toBe(401);
  });

  it('recusa nomes que não sejam UUID + extensão (path traversal)', async () => {
    const res = await request(app).get('/uploads/solicitacoes/..%2F..%2Fetc%2Fpasswd').set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(404);
  });

  it('Unidade não acessa anexo de solicitação de outra unidade', async () => {
    prismaMock.solicitacao.findFirst.mockResolvedValue({ unidadeOrigemId: 'u-a', unidadeDestinoId: null } as never);
    const res = await request(app)
      .get(`/uploads/solicitacoes/${NOME}`)
      .set(auth('UNIDADE', { unidadeId: 'u-b' }));
    expect(res.status).toBe(403);
  });

  it('Unidade dona e Gestor recebem o arquivo', async () => {
    prismaMock.solicitacao.findFirst.mockResolvedValue({ unidadeOrigemId: 'u-a', unidadeDestinoId: null } as never);
    const dona = await request(app).get(`/uploads/solicitacoes/${NOME}`).set(auth('UNIDADE', { unidadeId: 'u-a' }));
    expect(dona.status).toBe(200);
    expect(dona.headers['cache-control']).toContain('no-store');
    const gestor = await request(app).get(`/uploads/solicitacoes/${NOME}`).set(auth('GESTOR_PATRIMONIO'));
    expect(gestor.status).toBe(200);
  });

  it('arquivo sem registro no banco não é servido', async () => {
    prismaMock.solicitacao.findFirst.mockResolvedValue(null);
    const res = await request(app).get(`/uploads/solicitacoes/${NOME}`).set(auth('GESTOR_PATRIMONIO'));
    expect(res.status).toBe(404);
  });
});

describe('Validação de assinatura dos uploads', () => {
  it('rejeita arquivo que declara PDF mas não tem assinatura de PDF', async () => {
    prismaMock.solicitacao.findUnique.mockResolvedValue({ id: 'sol-1', unidadeOrigemId: 'u-a' } as never);
    const res = await request(app)
      .post('/solicitacoes/sol-1/anexo')
      .set(auth('GESTOR_PATRIMONIO'))
      .attach('anexo', Buffer.from('<?php echo 1; ?>'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(422);
    expect(res.body.mensagem).toContain('não corresponde');
  });

  it('recusa tipo não permitido já no filtro do upload', async () => {
    const res = await request(app)
      .post('/solicitacoes/sol-1/anexo')
      .set(auth('GESTOR_PATRIMONIO'))
      .attach('anexo', Buffer.from('MZ'), { filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(422);
  });
});

describe('Segredo JWT', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
    jest.resetModules();
  });

  it('em produção, falha no boot sem segredo ou com segredo fraco', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => jest.isolateModules(() => require('../src/config/env'))).toThrow('JWT_SECRET');
    process.env.JWT_SECRET = 'dev-secret';
    expect(() => jest.isolateModules(() => require('../src/config/env'))).toThrow('JWT_SECRET');
    process.env.JWT_SECRET = 'curto';
    expect(() => jest.isolateModules(() => require('../src/config/env'))).toThrow('JWT_SECRET');
  });

  it('em produção, aceita segredo com 32+ caracteres', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'x'.repeat(40);
    expect(() => jest.isolateModules(() => require('../src/config/env'))).not.toThrow();
  });
});
