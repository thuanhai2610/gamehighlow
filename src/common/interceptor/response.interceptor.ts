import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { map, Observable } from 'rxjs';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  { ok: number; t: number; d: T }
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<{ ok: number; t: number; d: T }> {
    const ctx = context.switchToHttp();
    const response: Response = ctx.getResponse();
    return next.handle().pipe(
      map((d: T) => {
        return {
          ok: 1,
          t: response.statusCode,
          d,
        };
      }),
    );
  }
}
