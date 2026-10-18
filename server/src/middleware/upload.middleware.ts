import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../errors/app.error.js';
export const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/\.pdf$/i.test(file.originalname)) return cb(new AppError(415, 'INVALID_PDF', 'Select a PDF file.'));
    cb(null, true);
  },
}).single('file');
