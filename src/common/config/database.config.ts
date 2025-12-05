import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: configService.get<string>('DB_HOST', 'localhost'),
  port: parseInt(configService.get<string>('DB_PORT', '3306')),
  username: configService.get<string>('DB_USER', 'root'),
  password: configService.get<string>('DB_PASS', 'password'),
  database: configService.get<string>('DB_NAME', 'Game'),
  entities: [join(__dirname, '../../**/*.entity{.ts,.js}')],
  synchronize: false,
});
