import { criarApp } from './app';
import { env } from './config/env';

const app = criarApp();

app.listen(env.port, () => {
  console.log(`SGP API disponível em http://localhost:${env.port}`);
});
