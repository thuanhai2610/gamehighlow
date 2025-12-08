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
import { GameService } from './sicbo.service';
import { DepositDto } from './dto/deposit.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { GuessDto } from './dto/place-bet.dto';

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
  private readonly userClients: Map<string, Set<WebSocket>> = new Map();
  private readonly userTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly userCountDown: Map<string, number> = new Map();
  constructor(private readonly gameService: GameService) {
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

    const ip = req.socket.remoteAddress;
    client.ip = ip;
    this.clients.add(client);
    this.logger.log(`Client connected from IP: ${ip}`);
  }
  handleDisconnect(client: Client) {
    this.clients.delete(client);
    const username = this.clientUser.get(client);
    if (username) {
      const timer = this.userTimers.get(username);
      if (timer) {
        clearInterval(timer);
        this.userTimers.delete(username);
        this.userCountDown.delete(username);
      }
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

      const result = await this.gameService.startSession(userId);

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

      const result = await this.gameService.handleGuess(userId, choice);
      const { round, bet, session, multiplier, tableBalance, winAmount } =
        result;
      const response = this.createResponse(1, {
        result: result.result,
        round: {
          id: round?.roundId,
          currentCard: round?.currentCard,
          nextCard: round?.nextCard,
          win: round?.win,
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
      const result = await this.gameService.endSession(userId);
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
      const stats = await this.gameService.getSessionStats(userId);
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
      const result = await this.gameService.handleGuess(userId, autoChoice);

      const response = this.createResponse(1, {
        auto: true,
        choice: autoChoice,
        result: {
          round: {
            id: result.round?.roundId,
            currentCard: result.round?.currentCard,
            nextCard: result.round?.nextCard,
            win: result.round?.win,
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
