import { Response, Router } from 'express';
import { autenticar } from '../../middlewares/auth';
import { registrarAuditoria } from '../../services/auditoria.service';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../errors/AppError';
import { limitarFrequencia } from '../../middlewares/rateLimit';
import { env } from '../../config/env';
import { permissoesValidas } from '../../lib/permissoes';
import * as authService from './auth.service';
import * as oidc from './oidc.service';

export const authRouter = Router();

// Teto por IP no login institucional: muitos servidores saem pelo mesmo IP, então o limite é alto e só barra varredura.
const limiteLoginPorIp = limitarFrequencia({
  janelaMs: 15 * 60 * 1000,
  max: 300,
  mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
});
const limiteImpersonacao = limitarFrequencia({
  janelaMs: 15 * 60 * 1000,
  max: 30,
  chave: (req) => req.usuario?.sub ?? req.ip ?? 'desconhecido',
});
const passa = (_req: unknown, _res: unknown, next: () => void) => next();

// Falha em qualquer etapa do login institucional: o motivo fica no log do servidor e o navegador volta à tela de
// login, sem detalhes na tela.
function voltarAoLogin(res: Response, erro: unknown) {
  console.warn('Falha no login institucional:', erro instanceof Error ? erro.message : erro);
  res.redirect(oidc.urlTelaDeLogin());
}

function lerCookie(cabecalho: string | undefined, nome: string) {
  const par = (cabecalho ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${nome}=`));
  return par ? decodeURIComponent(par.slice(nome.length + 1)) : undefined;
}

// Login institucional: leva o navegador ao Keycloak. O cookie guarda state/nonce/PKCE só até o retorno.
authRouter.get('/oidc/login', env.rateLimitAtivo ? limiteLoginPorIp : passa, async (_req, res) => {
  try {
    const { url, cookie, validadeS } = await oidc.iniciarLogin();
    res.cookie(oidc.COOKIE_OIDC, cookie, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'lax',
      maxAge: validadeS * 1000,
      path: '/',
    });
    res.redirect(url);
  } catch (erro) {
    voltarAoLogin(res, erro);
  }
});

// Retorno do Keycloak. O token do SGP vai no fragmento (#) da URL, que o navegador não envia a servidores nem
// aparece em logs de acesso; o frontend o guarda e limpa o endereço.
authRouter.get('/callback', env.rateLimitAtivo ? limiteLoginPorIp : passa, async (req, res) => {
  const cookie = lerCookie(req.headers.cookie, oidc.COOKIE_OIDC);
  res.clearCookie(oidc.COOKIE_OIDC, { path: '/' });
  try {
    const identidade = await oidc.concluirLogin(req.originalUrl, cookie);
    const { token } = await authService.entrarPeloKeycloak(identidade);
    res.redirect(oidc.urlRetornoFrontend(token));
  } catch (erro) {
    voltarAoLogin(res, erro);
  }
});

authRouter.get('/oidc/logout', async (_req, res) => {
  try {
    res.redirect(await oidc.urlDeLogout());
  } catch (erro) {
    voltarAoLogin(res, erro);
  }
});

authRouter.get('/me', autenticar, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario!.sub },
    select: {
      id: true,
      nome: true,
      email: true,
      matricula: true,
      perfil: true,
      unidadeId: true,
      unidade: { select: { nome: true } },
      prestadorId: true,
      prestador: { select: { nome: true } },
      permissoes: true,
    },
  });
  if (!usuario) throw new AppError('Usuário não encontrado.', 404);
  res.json({
    ...usuario,
    permissoes: usuario.perfil === 'OPERADOR' ? permissoesValidas(usuario.permissoes) : [],
    unidadeNome: usuario.unidade?.nome ?? null,
    prestadorNome: usuario.prestador?.nome ?? null,
    unidade: undefined,
    prestador: undefined,
  });
});

// "Entrar como": qualquer usuário autenticado assume outro usuário ativo (decisão temporária, enquanto o sistema
// só tem dados de teste). A sessão gerada guarda quem é o original e a auditoria grava os dois.
authRouter.get('/impersonaveis', autenticar, async (req, res) => {
  res.json(await authService.listarImpersonaveis(req.usuario!));
});

authRouter.post(
  '/impersonar/:id',
  autenticar,
  env.rateLimitAtivo ? limiteImpersonacao : passa,
  async (req, res) => {
    const resultado = await authService.impersonar(req.params.id, req.usuario!);
    await registrarAuditoria({
      usuarioId: req.usuario!.sub,
      acao: 'IMPERSONAR_USUARIO',
      entidade: 'usuario',
      entidadeId: req.params.id,
      dadosDepois: {
        impersonadoPor: {
          id: req.usuario!.sub,
          nome: req.usuario!.nome,
          perfil: req.usuario!.perfil,
        },
      },
    });
    res.json(resultado);
  },
);
