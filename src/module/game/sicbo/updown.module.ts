import { Module } from '@nestjs/common';
import { UpdownController } from './updown.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/module/auth/entities/user.entity';
import { Round } from './entities/round.entity';
import { Bet } from './entities/bet.entity';
import { GameGateway } from './updown.gateway';
import { PlayerSession } from './entities/player-session.entity';
import { Jackpot } from './entities/jackbot.entity';
import { JwtService } from '@nestjs/jwt';
import { UpdownService } from './updown.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Round, Bet, PlayerSession, Jackpot]),
  ],
  controllers: [UpdownController],
  providers: [UpdownService, GameGateway, JwtService],
})
export class UpdownModule {}
