import { Logger, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import { RATE_LIMIT_CONFIG } from 'src/common/constant/rateLimit.constant';
import { IpThrottlerGuard } from 'src/common/guards/limit.guard';
import WebSocket, { Server } from 'ws';
import { UpdownService } from './updown.service';
import { DepositDto } from './dto/deposit.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { GuessDto } from './dto/place-bet.dto';
import { JwtService } from '@nestjs/jwt';
import { PayloadToken } from './interface/payloadToken.interface';

type Client = WebSocket & { ip?: string };
@UseGuards(IpThrottlerGuard)
@WebSocketGateway({
  path: 'v1/api/ws',
  maxPayload: RATE_LIMIT_CONFIG.MAX_WS_MESSAGE_BYTES,
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger(GameGateway.name);

  private readonly clients: Set<WebSocket> = new Set();
  private readonly instanceId: string;
  private readonly processingGuess: Map<string, boolean> = new Map();
  private readonly clientUser: Map<WebSocket, string> = new Map();
  private readonly userClient: Map<string, WebSocket> = new Map();
  private readonly userClients: Map<string, Set<WebSocket>> = new Map();
  private readonly userTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly userCountDown: Map<string, number> = new Map();
  constructor(
    private readonly updownService: UpdownService,
    private readonly jwtService: JwtService,
  ) {
    this.instanceId = `message-${process.pid}-${Date.now()}`;
  }
  afterInit(server: Server) {
    this.server = server;
  }

  handleConnection(client: Client, req: IncomingMessage) {
    const url = req.url || '';
    if (Buffer.byteLength(url, 'utf-8') > RATE_LIMIT_CONFIG.MAX_URL_BYTES) {
      client.close(1008, 'URL too long');
      return;
    }
    const urlParams = new URLSearchParams(url.split('?')[1] || '');
    const token = urlParams.get('token');
    if (!token) {
      client.close(1008, 'Token is missing');
      return;
    }
    let payload: PayloadToken;
    try {
      payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_TOKEN,
      });
    } catch (error) {
      const response = this.createResponse(
        0,
        null,
        error.message || 'deposit fail',
      );
      const message = JSON.stringify({ t: 'game:error', d: response });
      client.close(1008, 'Token is not accept');
      client.send(message);
      return;
    }
    const userId = payload.userId;
    client['userId'] = userId;

    const oldClients = this.userClient.get(userId);
    if (oldClients && oldClients !== client) {
      oldClients.close(4000, 'Another client connect');
      this.logger.warn(`Closed old client of user ${userId}`);
    }

    this.clientUser.set(client, userId);
    this.userClient.set(userId, client);
    const ip = req.socket.remoteAddress;
    client.ip = ip;
    this.clients.add(client);
    if (!this.userClients.has(userId)) {
      this.userClients.set(userId, new Set());
    }
    this.logger.log(
      `User ${userId} with Client ${client.ip} connected from IP: ${ip}`,
    );
  }
  handleDisconnect(client: Client) {
    const userId = this.clientUser.get(client);
    if (userId) {
      this.logger.log(`User ${userId} disconnecting`);
      const timer = this.userTimers.get(userId);
      if (timer) {
        clearInterval(timer);
        this.userTimers.delete(userId);
      }
      this.userClient.delete(userId);
      this.userCountDown.delete(userId);
      this.processingGuess.delete(userId);
      this.clientUser.delete(client);
      this.clients.delete(client);
    }
  }
  private createResponse<T>(ok: 0 | 1, d?: T, e?: string) {
    return {
      ok,
      d: d ?? null,
      e: e ?? null,
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

      const result = await this.updownService.depositToTable(userId, amount);
      const response = this.createResponse(1, {
        tableBalance: result.tableBalance,
        userBalance: result.userBalance,
        depositAmount: result.depositAmount,
      });
      const message = JSON.stringify({
        t: 'game:deposit_success',
        d: response,
      });
      client.send(message);
    } catch (error) {
      this.logger.error('[GAME] Deposit error:', error);
      const response = this.createResponse(
        0,
        null,
        error.message || 'deposit fail',
      );
      const message = JSON.stringify({ t: 'game:error', d: response });
      client.send(message);
    }
  }
  @SubscribeMessage('game:start')
  async onStart(
    @MessageBody() data: StartSessionDto,
    @ConnectedSocket() client: Client,
  ) {
    try {
      const { userId } = data;
      this.logger.log(`[GAME] User ${userId} starting session with bet`);
      this.processingGuess.set(userId, true);

      const result = await this.updownService.startSession(userId);

      this.startGuessTime(userId, client);

      const response = this.createResponse(1, {
        currentCard: result.currentCard,
        tableBalance: result.tableBalance,
        betAmount: result.betAmount,
        nextWin: result.nextWin,
        session: {
          userId: result.session.userId,
          winSteak: result.session.winStreak,
          cardsHistory: result.session.cardsHistory,
          isPlaying: result.session.isPlaying,
        },
      });
      const messsage = JSON.stringify({
        t: 'game:session_started',
        d: response,
      });
      client.send(messsage);
    } catch (error) {
      this.logger.error('[GAME] Start session error:', error);
      const response = this.createResponse(
        0,
        null,
        error.message || 'Fail to start session',
      );
      const message = JSON.stringify({ t: 'game:error', d: response });
      client.send(message);
    }
  }

  @SubscribeMessage('game:guess')
  async onGuess(
    @MessageBody() data: GuessDto,
    @ConnectedSocket() client: Client,
  ) {
    try {
      const { userId, choice } = data;
      const existingTimer = this.userTimers.get(userId);
      if (existingTimer) {
        clearInterval(existingTimer);
        this.userTimers.delete(userId);
        this.userCountDown.delete(userId);
      }
      const ackResponse = this.createResponse(1, { userId, choice });
      const message = JSON.stringify({
        t: 'game:guess_received',
        d: ackResponse,
      });
      client.send(message);

      const result = await this.updownService.handleGuess(userId, choice);
      const { round, bet, session, multiplier, tableBalance, winAmount } =
        result;
      const response = this.createResponse(1, {
        result: result.result,
        round: {
          id: round?.roundId,
          currentCard: round?.currentCard,
          nextCard: round?.nextCard,
          isWin: round?.isWin,
          betAmount: round?.betAmount,
        },
        bet: {
          id: bet?.betId,
          amount: bet?.amount,
          winAmount: bet?.winAmount,
          choice: bet?.choice,
        },
        session: {
          winSteak: session.winStreak,
          cardHistory: session.cardsHistory,
          isPlaying: session.isPlaying,
          tableBalance: session.tableBalance,
        },
        multiplier,
        tableBalance,
        winAmount,
        nextWin: result.nextWin,
      });
      const messageResponseGameResult = JSON.stringify({
        t: 'game:round_result',
        d: response,
      });
      client.send(messageResponseGameResult);
      if (session.isPlaying) {
        this.startGuessTime(userId, client);
      }
    } catch (error) {
      this.logger.error('[GAME] Guess error:', error);
      const response = this.createResponse(
        0,
        null,
        error.message || 'Fail to process guess',
      );
      const message = JSON.stringify({ t: 'game:error', d: response });
      client.send(message);
    }
  }

  @SubscribeMessage('game:end_session')
  async onEnd(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Client,
  ) {
    try {
      const { userId } = data;
      this.logger.log(`[GAME] User ${userId} ending session`);
      const timer = this.userTimers.get(userId);
      if (timer) {
        clearInterval(timer);
        this.userTimers.delete(userId);
      }

      this.userCountDown.delete(userId);
      const result = await this.updownService.endSession(userId);
      const { session, userBalance, withdrawAmount } = result;
      const response = this.createResponse(1, {
        userBalance,
        withdrawAmount,
        session: {
          userId: session.userId,
          winSteak: session.winStreak,
          cardHistory: session.cardsHistory,
          isPlaying: session.isPlaying,
          tableBalance: session.tableBalance,
        },
      });
      const message = JSON.stringify({ t: 'game:session_ended', d: response });
      client.send(message);
    } catch (error) {
      this.logger.error('[GAME] End session error:', error);
      const response = this.createResponse(
        0,
        null,
        error.message || 'Fail to end session',
      );
      const message = JSON.stringify({ t: 'game:error', d: response });
      client.send(message);
    }
  }

  @SubscribeMessage('game:get_stats')
  async onGetStats(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Client,
  ) {
    try {
      const { userId } = data;
      const stats = await this.updownService.getSessionStats(userId);
      const response = this.createResponse(1, stats);
      const message = JSON.stringify({ t: 'game:stats', d: response });
      client.send(message);
    } catch (error) {
      this.logger.error('[GAME] Get stats error:', error);

      const resposne = this.createResponse(
        0,
        null,
        error.message || 'Fail to get stats',
      );
      const message = JSON.stringify({ t: 'game:error', d: resposne });
      client.send(message);
    }
  }
  private startGuessTime(userId: string, client: Client) {
    const oldTimer = this.userTimers.get(userId);
    if (oldTimer) {
      clearInterval(oldTimer);
    }

    this.userCountDown.set(userId, 120);

    const interval = setInterval(() => {
      (() => {
        const time = this.userCountDown.get(userId) || 0;

        const newTime = time - 1;
        this.userCountDown.set(userId, newTime);

        const timeMessage = JSON.stringify({
          t: 'game:guess_timer',
          d: { userId, timeLeft: newTime },
        });
        client.send(timeMessage);

        if (newTime <= 0) {
          clearInterval(interval);
          this.userTimers.delete(userId);
          this.userCountDown.delete(userId);
          this.handleAutoGuess(userId, client);
        }
      })();
    }, 1000);

    this.userTimers.set(userId, interval);
  }

  private async handleAutoGuess(userId: string, client: Client) {
    const choices: Array<'over' | 'under'> = ['over', 'under'];
    const autoChoice = choices[Math.floor(Math.random() * choices.length)];

    this.logger.log(`[AUTO] User ${userId} auto-guessed: ${autoChoice}`);

    try {
      const result = await this.updownService.handleGuess(userId, autoChoice);

      const response = this.createResponse(1, {
        auto: true,
        choice: autoChoice,
        result: {
          round: {
            id: result.round?.roundId,
            currentCard: result.round?.currentCard,
            nextCard: result.round?.nextCard,
            isWin: result.round?.isWin,
          },
          session: {
            winStreak: result.session.winStreak,
            cardsHistory: result.session.cardsHistory,
            isPlaying: result.session.isPlaying,
          },
          winAmount: result.winAmount,
          tableBalance: result.tableBalance,
          nextWin: result.nextWin,
        },
      });

      const message = JSON.stringify({
        t: 'game:auto_guess',
        d: response,
      });
      client.send(message);

      if (result.session.isPlaying) {
        this.startGuessTime(userId, client);
      }
    } catch (error) {
      this.logger.error(`[AUTO] Auto guess failed for ${userId}:`, error);
      const errorResponse = this.createResponse(0, null, 'Auto guess failed');
      client.send(JSON.stringify({ t: 'game:error', d: errorResponse }));
    }
  }
  @SubscribeMessage('ping')
  pong(@ConnectedSocket() client: Client) {
    const response = this.createResponse(1, { message: 'Pong' });
    const message = JSON.stringify({ t: 'ping', d: response });
    console.log(message);
    client.send(message);
  }
}
