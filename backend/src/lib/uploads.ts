import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

// Diretório persistido via volume Docker (ver docker-compose.yml) para que
// as imagens sobrevivam a rebuilds do container da API.
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
export const TIPOS_DIR = path.join(UPLOADS_DIR, 'tipos');
export const FOTOS_DIR = path.join(UPLOADS_DIR, 'solicitacoes');
export const LAUDOS_DIR = path.join(UPLOADS_DIR, 'laudos');

fs.mkdirSync(TIPOS_DIR, { recursive: true });
fs.mkdirSync(FOTOS_DIR, { recursive: true });
fs.mkdirSync(LAUDOS_DIR, { recursive: true });

const EXTENSOES_IMAGEM: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

function criarUploadImagem(destino: string) {
  return multer({
    storage: multer.diskStorage({
      destination: destino,
      filename: (_req, file, cb) => {
        const ext = EXTENSOES_IMAGEM[file.mimetype] ?? '.jpg';
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!EXTENSOES_IMAGEM[file.mimetype]) {
        cb(new AppError('Formato de imagem não suportado. Use JPEG, PNG ou WebP.', 422));
        return;
      }
      cb(null, true);
    },
  });
}

export const uploadImagemTipo = criarUploadImagem(TIPOS_DIR);

// Anexo de solicitação: PDF (principal — documentos do SE) ou imagem,
// comprovante de que a ampliação foi autorizada num projeto interno.
const EXTENSOES_ANEXO: Record<string, string> = {
  ...EXTENSOES_IMAGEM,
  'application/pdf': '.pdf',
};

export const uploadAnexoSolicitacao = multer({
  storage: multer.diskStorage({
    destination: FOTOS_DIR,
    filename: (_req, file, cb) => {
      const ext = EXTENSOES_ANEXO[file.mimetype] ?? '.pdf';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!EXTENSOES_ANEXO[file.mimetype]) {
      cb(new AppError('Formato não suportado. Use PDF, JPEG, PNG ou WebP.', 422));
      return;
    }
    cb(null, true);
  },
});

export const uploadLaudoPdf = multer({
  storage: multer.diskStorage({
    destination: LAUDOS_DIR,
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new AppError('Formato de laudo não suportado. Envie um arquivo PDF.', 422));
      return;
    }
    cb(null, true);
  },
});

export function removerImagemTipo(imagemUrl: string | null | undefined) {
  if (!imagemUrl) return;
  const nomeArquivo = path.basename(imagemUrl);
  const caminho = path.join(TIPOS_DIR, nomeArquivo);
  fs.rm(caminho, { force: true }, () => {});
}

// O MIME declarado pelo cliente é só uma dica: confere os primeiros bytes do
// arquivo gravado (assinatura) e descarta o upload se não for do tipo esperado.
type Formato = 'pdf' | 'jpg' | 'png' | 'webp';

function detectarFormato(cabecalho: Buffer): Formato | null {
  if (cabecalho.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (cabecalho[0] === 0xff && cabecalho[1] === 0xd8 && cabecalho[2] === 0xff) return 'jpg';
  if (cabecalho.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (cabecalho.subarray(0, 4).toString('latin1') === 'RIFF' && cabecalho.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'webp';
  }
  return null;
}

function validarAssinatura(permitidos: Formato[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.file) return next();
    const caminho = req.file.path;
    try {
      // caminho gerado pelo multer (UUID em diretório fixo), nunca informado pelo cliente
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const arquivo = await fs.promises.open(caminho, 'r');
      const cabecalho = Buffer.alloc(12);
      await arquivo.read(cabecalho, 0, 12, 0);
      await arquivo.close();
      const formato = detectarFormato(cabecalho);
      if (!formato || !permitidos.includes(formato)) {
        await fs.promises.rm(caminho, { force: true });
        throw new AppError('O conteúdo do arquivo não corresponde a um formato permitido.', 422);
      }
      next();
    } catch (erro) {
      next(erro);
    }
  };
}

export const assinaturaImagem = validarAssinatura(['jpg', 'png', 'webp']);
export const assinaturaAnexo = validarAssinatura(['pdf', 'jpg', 'png', 'webp']);
export const assinaturaPdf = validarAssinatura(['pdf']);
