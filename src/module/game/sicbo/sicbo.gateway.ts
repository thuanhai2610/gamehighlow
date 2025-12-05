import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  WebSocketServer,
} from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import { WebSocket, Server } from 'ws';

import { UseGuards, Logger } from '@nestjs/common';
import { RATE_LIMIT_CONFIG } from 'src/common/constant/rateLimit.constant';
import { GameService } from './sicbo.service';
import { StartSessionDto } from './dto/start-session.dto';
import { GuessDto } from './dto/place-bet.dto';
import { DepositDto } from './dto/deposit.dto';
import { IpThrottlerGuard } from 'src/common/guards/limit.guard';

type Client = WebSocket & { ip?: string };

@WebSocketGateway({
  path: '/v1/api/ws',
  maxPayload: RATE_LIMIT_CONFIG.MAX_WS_MESSAGE_BYTES,
})
@UseGuards(IpThrottlerGuard)
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(GameGateway.name);
  private readonly instanceId: string;
  private readonly clients: Set<WebSocket> = new Set();
  private readonly userClients: Map<string, Set<WebSocket>> = new Map();
  private readonly clientUser: Map<WebSocket, string> = new Map();

  constructor(private readonly gameService: GameService) {
    this.instanceId = `message-${process.pid}-${Date.now()}`;
  }

  afterInit(server: Server) {
    this.server = server;
  }

  handleConnection(client: Client, req: IncomingMessage) {
    const url = req.url || '';
    if (Buffer.byteLength(url, 'utf8') > RATE_LIMIT_CONFIG.MAX_URL_BYTES) {
      client.close(1008, 'URI Too Long');
      return;
    }

    const ip = req.socket.remoteAddress;
    client.ip = ip;
    this.clients.add(client);
    this.logger.log(`Client connected from IP: ${ip}`);
  }

  handleDisconnect(client: Client) {
    this.clients.delete(client);
    const username = this.clientUser.get(client);
    if (username) {
      const set = this.userClients.get(username);
      if (set) {
        set.delete(client);
        if (set.size === 0) this.userClients.delete(username);
      }
      this.clientUser.delete(client);
      this.logger.log(`User ${username} disconnected`);
    }
  }

  private createResponse<T>(status: 0 | 1, gameData?: T, error?: string) {
    return {
      status,
      gameData: gameData ?? null,
      error: error ?? null,
    };
  }

  @SubscribeMessage('game:deposit')
  async onDeposit(
    @MessageBody() data: DepositDto,
    @ConnectedSocket() client: WebSocket,
  ) {
    try {
      const { userId, amount } = data;
      this.logger.log(`[GAME] User ${userId} depositing ${amount} to table`);

      const result = await this.gameService.depositToTable(userId, amount);

      const response = this.createResponse(1, {
        tableBalance: result.tableBalance,
        userBalance: result.userBalance,
        depositAmount: result.depositAmount,
      });

      client.send(JSON.stringify({ t: 'game:deposit_success', d: response }));
    } catch (error) {
      this.logger.error('[GAME] Deposit error:', error);

      const response = this.createResponse(
        0,
        null,
        error.message || 'Deposit failed',
      );
      client.send(JSON.stringify({ t: 'game:error', d: response }));
    }
  }

  @SubscribeMessage('game:start')
  async onStart(
    @MessageBody() data: StartSessionDto,
    @ConnectedSocket() client: WebSocket,
  ) {
    try {
      const { userId, betAmount } = data;
      this.logger.log(
        `[GAME] User ${userId} starting session with bet ${betAmount}`,
      );
      if (betAmount === undefined) {
        throw new Error('betAmount is required');
      }
      const result = await this.gameService.startSession(userId, betAmount);

      const response = this.createResponse(1, {
        currentCard: result.currentCard,
        tableBalance: result.tableBalance,
        session: {
          userId: result.session.userId,
          winStreak: result.session.winStreak,
          cardsHistory: result.session.cardsHistory,
          isPlaying: result.session.isPlaying,
        },
      });

      client.send(JSON.stringify({ t: 'game:session_started', d: response }));
    } catch (error) {
      this.logger.error('[GAME] Start session error:', error);

      const response = this.createResponse(
        0,
        null,
        error.message || 'Failed to start session',
      );
      client.send(JSON.stringify({ t: 'game:error', d: response }));
    }
  }

  @SubscribeMessage('game:guess')
  async onGuess(
    @MessageBody() data: GuessDto,
    @ConnectedSocket() client: WebSocket,
  ) {
    try {
      const { userId, choice, betAmount } = data;
      this.logger.log(
        `[GAME] User ${userId} guessing ${choice} with bet ${betAmount}`,
      );
      const ackResponse = this.createResponse(1, { userId, choice, betAmount });
      client.send(JSON.stringify({ t: 'game:guess_received', d: ackResponse }));
      const result = await this.gameService.handleGuess(
        userId,
        choice,
        betAmount,
      );

      const response = this.createResponse(1, {
        result: result.result,
        round: {
          id: result.round?.roundId,
          currentCard: result.round?.currentCard,
          nextCard: result.round?.nextCard,
          win: result.round?.win,
          betAmount: result.round?.betAmount,
        },
        bet: {
          id: result.bet?.betId,
          amount: result.bet?.amount,
          winAmount: result.bet?.winAmount,
          choice: result.bet?.choice,
        },
        session: {
          winStreak: result.session.winStreak,
          cardsHistory: result.session.cardsHistory,
          isPlaying: result.session.isPlaying,
          tableBalance: result.session.tableBalance,
        },
        multiplier: result.multiplier,
        tableBalance: result.tableBalance,
        winAmount: result.winAmount,
      });

      client.send(JSON.stringify({ t: 'game:round_result', d: response }));

      if (result.jackpot) {
        this.logger.log(`[GAME] 🎰 JACKPOT triggered by user ${userId}!`);
      }
    } catch (error) {
      this.logger.error('[GAME] Guess error:', error);

      const response = this.createResponse(
        0,
        null,
        error.message || 'Failed to process guess',
      );
      client.send(JSON.stringify({ t: 'game:error', d: response }));
    }
  }

  @SubscribeMessage('game:end_session')
  async onEnd(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: WebSocket,
  ) {
    try {
      const { userId } = data;
      this.logger.log(`[GAME] User ${userId} ending session`);

      const result = await this.gameService.endSession(userId);

      const response = this.createResponse(1, {
        userBalance: result.userBalance,
        withdrawAmount: result.withdrawAmount,
        session: {
          userId: result.session.userId,
          winStreak: result.session.winStreak,
          cardsHistory: result.session.cardsHistory,
          isPlaying: result.session.isPlaying,
          tableBalance: result.session.tableBalance,
        },
      });

      client.send(JSON.stringify({ t: 'game:session_ended', d: response }));
    } catch (error) {
      this.logger.error('[GAME] End session error:', error);

      const response = this.createResponse(
        0,
        null,
        error.message || 'Failed to end session',
      );
      client.send(JSON.stringify({ t: 'game:error', d: response }));
    }
  }

  @SubscribeMessage('game:get_stats')
  async onGetStats(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: WebSocket,
  ) {
    try {
      const { userId } = data;

      const stats = await this.gameService.getSessionStats(userId);

      const response = this.createResponse(1, stats);
      client.send(JSON.stringify({ t: 'game:stats', d: response }));
    } catch (error) {
      this.logger.error('[GAME] Get stats error:', error);

      const response = this.createResponse(
        0,
        null,
        error.message || 'Failed to get stats',
      );
      client.send(JSON.stringify({ t: 'game:error', d: response }));
    }
  }
}
