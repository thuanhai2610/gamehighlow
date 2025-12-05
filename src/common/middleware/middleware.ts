import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RATE_LIMIT_CONFIG } from '../constant/rateLimit.constant';

@Injectable()
export class Middleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (Buffer.byteLength(req.originalUrl) > RATE_LIMIT_CONFIG.MAX_URL_BYTES) {
      return res.status(414).send('URL Too Long');
    }
    const startedAt = Date.now();
    res.on('finish', () => {
      const elapsed = Date.now() - startedAt;
      console.log(
        `${req.method} ${req.originalUrl} ${req.statusCode} ${elapsed}ms`,
      );
    });
    next();
  }
}
