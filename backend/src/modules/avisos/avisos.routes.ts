import { Router } from 'express';
import { autenticar } from '../../middlewares/auth';
import * as service from '../../services/avisos.service';

export const avisosRouter = Router();

avisosRouter.use(autenticar);

avisosRouter.get('/', async (req, res) => {
  const raw = String(req.query.apenasNaoLidas ?? '');
  const apenasNaoLidas = raw === '1' || raw === 'true';
  const limiteBruto = req.query.limite ? Number(req.query.limite) : 10;
  const limite = Number.isFinite(limiteBruto) ? limiteBruto : 10;
  res.json(await service.listarAvisos(req.usuario!.sub, apenasNaoLidas, limite));
});

avisosRouter.post('/ler-todas', async (req, res) => {
  res.json(await service.marcarTodosAvisosLidos(req.usuario!.sub));
});

avisosRouter.post('/:id/ler', async (req, res) => {
  res.json(await service.marcarAvisoLido(req.usuario!.sub, req.params.id));
});
