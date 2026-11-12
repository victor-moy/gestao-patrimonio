import cron from 'node-cron';
import { criarApp } from './app';
import { env } from './config/env';
import { expirarSolicitacoesPendentes } from './jobs/expirarSolicitacoes.job';
import { resolverRetornosSemResposta } from './jobs/resolverRetornosSemResposta.job';

const app = criarApp();

app.listen(env.port, () => {
  console.log(`SGP API disponível em http://localhost:${env.port}`);
});

// SLA de 7 dias: fecha automaticamente solicitações sem retorno do Administrador.
// Não roda em testes (que sobem `criarApp()` diretamente, sem passar por este arquivo).
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 6 * * *', () => {
    expirarSolicitacoesPendentes().catch((erro) => {
      console.error('Falha ao expirar solicitações por SLA:', erro);
    });
  });
  // Chamado civil sem resposta da Unidade em 7 dias corridos é dado como resolvido
  cron.schedule('10 6 * * *', () => {
    resolverRetornosSemResposta().catch((erro) => {
      console.error('Falha ao resolver chamados sem resposta da unidade:', erro);
    });
  });
}
