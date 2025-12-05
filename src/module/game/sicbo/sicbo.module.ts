import { Module } from '@nestjs/common';
import { Sicbo3Controller } from './sicbo.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/module/auth/entities/user.entity';
import { Round } from './entities/round.entity';
import { Bet } from './entities/bet.entity';
import { GameService } from './sicbo.service';
import { GameGateway } from './sicbo.gateway';
import { PlayerSession } from './entities/player-session.entity';
import { Jackpot } from './entities/jackbot.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Round, Bet, PlayerSession, Jackpot]),
  ],
  controllers: [Sicbo3Controller],
  providers: [GameService, GameGateway],
})
export class Sicbo3Module {}
