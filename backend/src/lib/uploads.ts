import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

// Diretório persistido via volume Docker (ver docker-compose.yml) para que
// as imagens sobrevivam a rebuilds do container da API.
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
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
        cb(new Error('Formato de imagem não suportado. Use JPEG, PNG ou WebP.'));
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
      cb(new Error('Formato não suportado. Use PDF, JPEG, PNG ou WebP.'));
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
      cb(new Error('Formato de laudo não suportado. Envie um arquivo PDF.'));
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
