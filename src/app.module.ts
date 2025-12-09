import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './common/config/database.config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RATE_LIMIT_CONFIG } from './common/constant/rateLimit.constant';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import Redis from 'ioredis';
import { AuthModule } from './module/auth/auth.module';
import { Middleware } from './common/middleware/middleware';
import { UpdownModule } from './module/game/sicbo/updown.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: RATE_LIMIT_CONFIG.TTL,
          limit: RATE_LIMIT_CONFIG.LIMIT,
          blockDuration: RATE_LIMIT_CONFIG.BLOCK_DURATION,
        },
      ],
      storage: new ThrottlerStorageRedisService(
        new ConfigService().get('REDIS_URL_CONNECT'),
      ),
    }),
    UpdownModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        return new Redis({
          host: (process.env.HOST_REDIS as string) || 'localhost',
          port: Number(process.env.PORT_REDIS) || 6379,
          password: process.env.REDIS_PASSWORD,
        });
      },
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(Middleware).forRoutes('*');
  }
}
