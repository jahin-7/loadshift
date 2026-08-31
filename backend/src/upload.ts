import { randomUUID } from 'node:crypto';
import path from 'node:path';
import multer from 'multer';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export class UnsupportedFileTypeError extends Error {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 10);
    cb(null, `${randomUUID()}${ext}`);
  },
});

export const uploadAttachment = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new UnsupportedFileTypeError('Only PDF, PNG, JPEG, WEBP, and GIF files are accepted.'));
      return;
    }
    cb(null, true);
  },
});
