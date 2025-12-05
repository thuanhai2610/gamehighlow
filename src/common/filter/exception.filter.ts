import {
  ArgumentsHost,
  ExceptionFilter,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

function isErrorResponse(obj: unknown): obj is { message: string | string[] } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'message' in obj &&
    (typeof (obj as { message?: unknown }).message === 'string' ||
      Array.isArray((obj as { message?: unknown }).message))
  );
}

export class HandleException implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      let message: string;
      if (typeof res === 'string') {
        message = res;
      } else if (isErrorResponse(res)) {
        message = Array.isArray(res.message) ? res.message[0] : res.message;
      } else {
        message = exception.message || 'Bad Request';
      }

      return response.status(status).json({
        ok: 0,
        d: null,
        e: message,
      });
    }

    console.log('exception', exception);

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      ok: 0,
      d: null,
      e: 'Internal server error',
    });
  }
}
