import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_TOKEN,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  exports: [JwtModule],
})
export class JwtModuleConfig {}
