import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';

// Notificações por e-mail ao endereço base da unidade envolvida
// (feedback da reunião de 12/05/2026), com registro de cada envio.
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function notificar(destinatario: string | null | undefined, assunto: string, corpo: string) {
  if (!destinatario) return;
  if (!env.smtp.enabled) {
    await prisma.notificacao.create({
      data: { destinatario, assunto, corpo, status: 'REGISTRADA' },
    });
    return;
  }
  try {
    await getTransporter().sendMail({
      from: env.smtp.from,
      to: destinatario,
      subject: assunto,
      text: corpo,
    });
    await prisma.notificacao.create({
      data: { destinatario, assunto, corpo, status: 'ENVIADA' },
    });
  } catch (err) {
    await prisma.notificacao.create({
      data: {
        destinatario,
        assunto,
        corpo,
        status: 'FALHA',
        erro: err instanceof Error ? err.message : 'Erro desconhecido',
      },
    });
  }
}
