import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

// Diretório persistido via volume Docker (ver docker-compose.yml) para que
// as imagens sobrevivam a rebuilds do container da API.
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
export const TIPOS_DIR = path.join(UPLOADS_DIR, 'tipos');

fs.mkdirSync(TIPOS_DIR, { recursive: true });

const EXTENSOES_PERMITIDAS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const uploadImagemTipo = multer({
  storage: multer.diskStorage({
    destination: TIPOS_DIR,
    filename: (_req, file, cb) => {
      const ext = EXTENSOES_PERMITIDAS[file.mimetype] ?? '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!EXTENSOES_PERMITIDAS[file.mimetype]) {
      cb(new Error('Formato de imagem não suportado. Use JPEG, PNG ou WebP.'));
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
