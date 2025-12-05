import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { JwtModuleConfig } from 'src/common/config/jwt-config.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), JwtModuleConfig],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
