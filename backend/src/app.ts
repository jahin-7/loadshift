import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { MulterError } from 'multer';
import { config } from './config.js';
import router from './api/router.js';
import { ApiError } from './api/errors.js';
import { UnsupportedFileTypeError } from './upload.js';
import { apiLimiter } from './rateLimit.js';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.FRONTEND_ORIGIN }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/v1', apiLimiter, router);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof MulterError || err instanceof UnsupportedFileTypeError) {
      res.status(422).json({ error: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
