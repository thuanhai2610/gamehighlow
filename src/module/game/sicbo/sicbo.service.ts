import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerSession } from './entities/player-session.entity';
import { Round } from './entities/round.entity';
import { Bet } from './entities/bet.entity';
import { Jackpot } from './entities/jackbot.entity';
import { User } from 'src/module/auth/entities/user.entity';

@Injectable()
export class GameService {
  private sessions: Map<string, PlayerSession> = new Map();

  constructor(
    @InjectRepository(PlayerSession)
    private readonly sessionRepo: Repository<PlayerSession>,
    @InjectRepository(Round)
    private readonly roundRepo: Repository<Round>,
    @InjectRepository(Bet)
    private readonly betRepo: Repository<Bet>,
    @InjectRepository(Jackpot)
    private readonly jackpotRepo: Repository<Jackpot>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  rollCard() {
    const cardNumber = Math.floor(Math.random() * 52) + 1;
    const card = ((cardNumber - 1) % 13) + 1;
    const rank = Math.ceil(card / 13);

    return {
      cardNumber,
      rank,
      card,
    };
  }

  async ensureSession(userId: string): Promise<PlayerSession> {
    const s = this.sessions.get(userId);
    if (s) return s;
    let db = await this.sessionRepo.findOne({ where: { userId } });
    if (!db) {
      db = this.sessionRepo.create({
        userId,
        winStreak: 0,
        cardsHistory: [],
        lastBetAmount: 0,
        isPlaying: false,
        tableBalance: 0,
      });
      await this.sessionRepo.save(db);
    }
    this.sessions.set(userId, db);
    return db;
  }

  async depositToTable(userId: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('Deposit > 0');
    const query = this.sessionRepo.manager.connection.createQueryRunner();
    await query.connect();
    await query.startTransaction('READ COMMITTED');
    try {
      const user = await query.manager.findOne(User, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('User not found');
      if (user.balance < amount)
        throw new BadRequestException('Insufficient balance');
      let session = await query.manager.findOne(PlayerSession, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) {
        session = query.manager.create(PlayerSession, {
          userId,
          winStreak: 0,
          cardsHistory: [],
          lastBetAmount: 0,
          isPlaying: false,
          tableBalance: 0,
        });
        await query.manager.save(session);
      }
      if (session?.isPlaying) {
        throw new BadRequestException('Khong the nap tien trong khi choi');
      }
      user.balance -= amount;

      session.tableBalance += amount;
      await query.manager.save(user);

      await query.manager.save(session);
      this.sessions.set(userId, session);
      await query.commitTransaction();
      return {
        tableBalance: session.tableBalance,
        userBalance: user.balance,
        depositAmount: amount,
      };
    } catch (error) {
      await query.rollbackTransaction();
      throw error;
    } finally {
      await query.release();
    }
  }

  async startSession(userId: string) {
    const session = await this.ensureSession(userId);
    const actualBetAmount = session.tableBalance;

    if (actualBetAmount <= 0)
      throw new BadRequestException(
        `Insufficient table balance. You have ${session.tableBalance}, need ${actualBetAmount}`,
      );

    session.lastBetAmount = actualBetAmount;

    if (!session.isPlaying) {
      session.winStreak = 0;
      session.cardsHistory = [];
    }
    session.isPlaying = true;

    const card = this.rollCard();
    session.cardsHistory = [...(session.cardsHistory || []), card];

    await this.sessionRepo.save(session);
    this.sessions.set(userId, session);

    const nextWin = this.nextAmount(card, session.tableBalance);

    return {
      currentCard: card,
      session,
      tableBalance: session.tableBalance,
      betAmount: actualBetAmount,
      nextWin,
    };
  }

  async handleGuess(userId: string, choice: 'over' | 'under') {
    if (!['over', 'under'].includes(choice))
      throw new BadRequestException('Choice over or under');
    const session = await this.ensureSession(userId);

    if (!session.isPlaying)
      throw new BadRequestException('Chua bat dau van choi');
    const actualBetAmount = session.tableBalance;
    if (actualBetAmount <= 0) throw new BadRequestException('Khong the cuoc');

    session.lastBetAmount = actualBetAmount;
    await this.sessionRepo.save(session);
    this.sessions.set(userId, session);

    return this.processGuess(userId, choice, actualBetAmount, session);
  }

  private async processGuess(
    userId: string,
    choice: 'over' | 'under',
    betAmount: number,
    session: PlayerSession,
  ) {
    const currentCard =
      session.cardsHistory && session.cardsHistory.length
        ? session.cardsHistory[session.cardsHistory.length - 1]
        : this.rollCard();
    const nextCard = this.rollCard();
    if (nextCard.card === currentCard.card) {
      if (currentCard.rank === nextCard.rank) {
        session.tableBalance = betAmount;
        await this.sessionRepo.save(session);
        this.sessions.set(userId, session);

        const round = this.roundRepo.create({
          userId,
          currentCard,
          nextCard,
          win: false,
          betAmount,
        });
        await this.roundRepo.save(round);
        const bet = this.betRepo.create({
          round,
          userId,
          choice,
          amount: betAmount,
        });
        await this.betRepo.save(bet);
        const nextWin = this.nextAmount(nextCard, session.tableBalance);
        return {
          result: 'draw',
          message: 'Hoa',
          refund: betAmount,
          currentCard,
          nextCard,
          bet,
          round,
          multiplier: 1.0,
          winAmount: 0,
          session,
          tableBalance: session.tableBalance,
          nextWin,
        };
      }
      const win =
        (choice === 'over' && nextCard.rank > currentCard.rank) ||
        (choice === 'under' && nextCard.rank < currentCard.rank);
      const multiplier = 1.1;
      const winAmount = win ? betAmount * multiplier : 0;
      const round = this.roundRepo.create({
        userId,
        currentCard,
        nextCard,
        win,
        betAmount,
      });
      await this.roundRepo.save(round);
      const bet = this.betRepo.create({
        round,
        userId,
        choice,
        amount: betAmount,
        win,
        winAmount,
      });
      await this.betRepo.save(bet);
      if (win) {
        return this.setWin(
          userId,
          session,
          winAmount,
          nextCard,
          betAmount,
          bet,
          round,
          multiplier,
        );
      } else {
        return this.setLose(userId, round, bet, session, multiplier, betAmount);
      }
    }
    const win =
      (choice === 'over' && nextCard.card > currentCard.card) ||
      (choice === 'under' && nextCard.card < currentCard.card);
    let multiplier = this.getMultiplier(currentCard, choice);
    const isFirstGuess = session.cardsHistory.length === 1;
    if (isFirstGuess && win) {
      const isEasyChoice =
        (currentCard.card <= 3 && choice === 'over') ||
        (currentCard.card >= 11 && choice === 'under');
      if (isEasyChoice) {
        multiplier = 1.0;
      }
    }
    const winAmount = win ? betAmount * multiplier : 0;

    const round = this.roundRepo.create({
      userId,
      currentCard,
      nextCard,
      win,
      betAmount,
    });
    await this.roundRepo.save(round);
    const bet = this.betRepo.create({
      round,
      userId,
      choice,
      amount: betAmount,
      win,
      winAmount,
    });
    await this.betRepo.save(bet);
    if (win) {
      return this.setWin(
        userId,
        session,
        winAmount,
        nextCard,
        betAmount,
        bet,
        round,
        multiplier,
      );
    } else {
      return this.setLose(userId, round, bet, session, multiplier, betAmount);
    }
  }
  async endSession(userId: string) {
    const query = this.sessionRepo.manager.connection.createQueryRunner();
    await query.connect();
    await query.startTransaction('READ COMMITTED');
    try {
      const session = await query.manager.findOne(PlayerSession, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) throw new NotFoundException('Session not found');

      const user = await query.manager.findOne(User, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('User not found');

      const withdrawAmount = session.tableBalance;
      if (withdrawAmount > 0) {
        user.balance += withdrawAmount;
        await query.manager.save(user);
      }
      session.isPlaying = false;
      session.winStreak = 0;
      session.cardsHistory = [];
      session.tableBalance = 0;
      await query.manager.save(session);
      await query.commitTransaction();
      this.sessions.set(userId, session);
      return {
        session,
        userBalance: user.balance,
        withdrawAmount,
      };
    } catch (error) {
      await query.rollbackTransaction();
      throw error;
    } finally {
      await query.release();
    }
  }
  async getSessionStats(userId: string) {
    const session = await this.ensureSession(userId);
    const user = await this.userRepo.findOne({ where: { userId } });
    if (!user) throw new NotFoundException('User not found');
    const totalRounds = await this.roundRepo.count({ where: { userId } });
    const totalWins = await this.roundRepo.count({
      where: { userId, win: true },
    });
    const totalJackpots = await this.jackpotRepo.count({ where: { userId } });
    const bets = await this.betRepo.find({ where: { userId, win: true } });
    const totalWinnings = bets.reduce((sum, bet) => sum + bet.winAmount, 0);

    return {
      session,
      userBalance: user?.balance || 0,
      tableBalance: session.tableBalance,
      stats: {
        totalRounds,
        totalWins,
        totalJackpots,
        totalWinnings,
        winRate:
          totalRounds > 0
            ? ((totalWins / totalRounds) * 100).toFixed(2)
            : '0.00',
      },
    };
  }
  clearSessionCache(userId: string) {
    this.sessions.delete(userId);
  }
  private getMultiplier(
    currentCard: { card: number; rank: number },
    choice: 'over' | 'under',
  ) {
    const cardsCanWin =
      choice === 'over' ? 13 - currentCard.card : currentCard.card - 1;
    if (cardsCanWin <= 0) return 1.0;
    if (cardsCanWin === 1) return 11.0;
    if (cardsCanWin === 2) return 5.0;
    if (cardsCanWin <= 4) return 3.0;
    if (cardsCanWin <= 6) return 2.0;
    if (cardsCanWin <= 8) return 1.6;
    if (cardsCanWin <= 10) return 1.4;
    return 1.2;
  }

  private async setWin(
    userId: string,
    session: PlayerSession,
    winAmount: number,
    nextCard: { card: number; rank: number },
    betAmount: number,
    bet: Bet,
    round: Round,
    multiplier: number,
  ) {
    session.tableBalance = winAmount;
    session.cardsHistory = [...(session.cardsHistory || []), nextCard];
    session.lastBetAmount = betAmount;
    session.winStreak = session.winStreak + 1;
    session.isPlaying = true;
    await this.sessionRepo.save(session);
    this.sessions.set(userId, session);
    const nextWin = this.nextAmount(nextCard, session.tableBalance);
    return {
      result: 'win',
      round,
      bet,
      session,
      multiplier,
      tableBalance: session.tableBalance,
      winAmount,
      nextWin,
    };
  }

  private async setLose(
    userId: string,
    round: Round,
    bet: Bet,
    session: PlayerSession,
    multiplier: number,
    betAmount: number,
  ) {
    session.cardsHistory = [];
    session.lastBetAmount = betAmount;
    session.winStreak = 0;
    session.tableBalance = 0;
    session.isPlaying = false;

    await this.sessionRepo.save(session);
    this.sessions.set(userId, session);
    return {
      result: 'lose',
      round,
      bet,
      session,
      multiplier,
      tableBalance: session.tableBalance,
      winAmount: 0,
      nextWin: null,
    };
  }

  nextAmount(currentCard: { card: number; rank: number }, betAmount: number) {
    const upAmount = this.getMultiplier(currentCard, 'over');
    const downAmount = this.getMultiplier(currentCard, 'under');
    return {
      up: betAmount * upAmount,
      down: betAmount * downAmount,
    };
  }
}
