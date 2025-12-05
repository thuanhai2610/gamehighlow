import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { RATE_LIMIT_CONFIG } from './common/constant/rateLimit.constant';
import { ResponseInterceptor } from './common/interceptor/response.interceptor';
import { HandleException } from './common/filter/exception.filter';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const wsAdapter = new WsAdapter(app, {
    messageParser: (message: string) => {
      const { t, d } = JSON.parse(message.toString());
      return { event: t, data: d };
    },
  });
  app.useWebSocketAdapter(wsAdapter);
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HandleException());
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  app.use(json({ limit: RATE_LIMIT_CONFIG.MAX_HTTP_BODY_SIZE }));
  app.use(
    urlencoded({ limit: RATE_LIMIT_CONFIG.MAX_HTTP_BODY_SIZE, extended: true }),
  );

  await app.listen(process.env.PORT ?? 3000);
  console.log(
    `Api server đang chạy trên: http://localhost:${process.env.PORT}`,
  );
}
bootstrap();
