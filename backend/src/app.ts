import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import client from 'prom-client';
import { authRouter } from './modules/auth/auth.routes';
import { usuariosRouter } from './modules/usuarios/usuarios.routes';
import { unidadesRouter } from './modules/unidades/unidades.routes';
import { categoriasRouter } from './modules/categorias/categorias.routes';
import { equipamentosRouter } from './modules/equipamentos/equipamentos.routes';
import { manutencoesRouter } from './modules/manutencoes/manutencoes.routes';
import { solicitacoesRouter } from './modules/solicitacoes/solicitacoes.routes';
import { atasRouter } from './modules/atas/atas.routes';
import { contratosRouter } from './modules/contratos/contratos.routes';
import { estoqueRouter } from './modules/estoque/estoque.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { importacaoRouter } from './modules/importacao/importacao.routes';
import { tratarErros } from './middlewares/error';
import { prisma } from './lib/prisma';
import { UPLOADS_DIR } from './lib/uploads';

export function criarApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Observabilidade (RFC 5.5.4)
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });
  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
  });
  app.use((req, res, next) => {
    const fim = httpDuration.startTimer();
    res.on('finish', () => {
      fim({ method: req.method, route: req.baseUrl + (req.route?.path ?? req.path), status: res.statusCode });
    });
    next();
  });

  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  app.use('/auth', authRouter);
  app.use('/usuarios', usuariosRouter);
  app.use('/unidades', unidadesRouter);
  app.use('/categorias', categoriasRouter);
  app.use('/equipamentos', equipamentosRouter);
  app.use('/manutencoes', manutencoesRouter);
  app.use('/solicitacoes', solicitacoesRouter);
  app.use('/atas', atasRouter);
  app.use('/contratos', contratosRouter);
  app.use('/estoque', estoqueRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/importacao', importacaoRouter);

  app.use(tratarErros);

  return app;
}
