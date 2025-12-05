import { BadRequestException, Injectable } from '@nestjs/common';
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

  rollCard(): number {
    return Math.floor(Math.random() * 13) + 1;
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
    if (amount <= 0) {
      throw new Error('Deposit amount must be greater than 0');
    }

    const user = await this.userRepo.findOne({ where: { userId: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    if (user.balance < amount) {
      throw new Error('Insufficient balance');
    }

    user.balance -= amount;
    await this.userRepo.save(user);

    const session = await this.ensureSession(userId);
    session.tableBalance = (session.tableBalance || 0) + amount;
    await this.sessionRepo.save(session);
    this.sessions.set(userId, session);

    return {
      tableBalance: session.tableBalance,
      userBalance: user.balance,
      depositAmount: amount,
    };
  }

  async startSession(userId: string, betAmount: number) {
    if (betAmount <= 0) {
      throw new Error('Bet amount must be greater than 0');
    }

    const session = await this.ensureSession(userId);

    if (session.tableBalance < betAmount) {
      throw new Error(
        `Insufficient table balance. You have ${session.tableBalance}, need ${betAmount}`,
      );
    }

    session.tableBalance -= betAmount;

    if (!session.isPlaying) {
      session.winStreak = 0;
      session.cardsHistory = [];
    }

    session.isPlaying = true;
    session.lastBetAmount = betAmount;

    const card = this.rollCard();
    session.cardsHistory = [...(session.cardsHistory || []), card];

    await this.sessionRepo.save(session);
    this.sessions.set(userId, session);

    return {
      currentCard: card,
      session,
      tableBalance: session.tableBalance,
    };
  }

  async handleGuess(
    userId: string,
    choice: 'over' | 'under',
    betAmount: number,
  ) {
    if (betAmount <= 0) {
      throw new Error('Bet amount must be greater than 0');
    }

    if (!['over', 'under'].includes(choice)) {
      throw new Error('Choice must be "over" or "under"');
    }

    const session = await this.ensureSession(userId);

    if (!session.isPlaying) {
      throw new BadRequestException(
        'Bạn chưa bắt đầu ván chơi! Hãy nhấn "Start Game" và đặt cược trước.',
      );
    }

    session.tableBalance -= betAmount;
    await this.sessionRepo.save(session);
    this.sessions.set(userId, session);

    return await this.processGuess(userId, choice, betAmount, session);
  }

  private async processGuess(
    userId: string,
    choice: 'over' | 'under',
    betAmount: number,
    session: PlayerSession,
  ) {
    if (!betAmount || betAmount === 0)
      throw new BadRequestException('Chưa bet');
    const currentCard =
      session.cardsHistory && session.cardsHistory.length
        ? session.cardsHistory[session.cardsHistory.length - 1]
        : this.rollCard();

    const nextCard = this.rollCard();
    if (nextCard === currentCard) {
      session.tableBalance += betAmount;
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
      return {
        result: 'draw',
        message: 'Cards are equal. Bet refunded to table.',
        refund: betAmount,
        currentCard,
        nextCard,
        session,
        tableBalance: session.tableBalance,
      };
    }

    const win =
      (choice === 'over' && nextCard > currentCard) ||
      (choice === 'under' && nextCard < currentCard);

    let multiplier = 1.9;

    const isHighRiskUnder =
      [3, 4, 5].includes(currentCard) && choice === 'under';

    const isHighRiskOver =
      [9, 10, 11, 12].includes(currentCard) && choice === 'over';

    if (isHighRiskUnder || isHighRiskOver) {
      multiplier = 5.5;
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
      session.tableBalance += winAmount;
      session.cardsHistory = [...(session.cardsHistory || []), nextCard];
      session.lastBetAmount = betAmount;
      session.winStreak = session.winStreak + 1;
      session.isPlaying = true;

      await this.sessionRepo.save(session);
      this.sessions.set(userId, session);

      const jackpot = await this.checkJackpotCondition(
        userId,
        session,
        round.roundId,
      );

      return {
        result: 'win',
        round,
        bet,
        session,
        jackpot,
        multiplier,
        tableBalance: session.tableBalance,
        winAmount,
      };
    } else {
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
        jackpot: null,
        multiplier,
        tableBalance: session.tableBalance,
        winAmount: 0,
      };
    }
  }

  async checkJackpotCondition(
    userId: string,
    session: PlayerSession,
    lastRoundId?: string,
  ) {
    const history = session.cardsHistory || [];

    if (history.length < 4) return null;

    const last4Cards = history.slice(-4);
    const isJackpot = last4Cards.every((card) => card === 13);

    if (!isJackpot) return null;

    const payoutAmount = this.calculateJackpotPayout(session);

    const j = this.jackpotRepo.create({
      userId,
      roundIds: lastRoundId ? String(lastRoundId) : '',
      payoutAmount,
    });
    await this.jackpotRepo.save(j);

    session.tableBalance += payoutAmount;
    session.winStreak = 0;
    session.cardsHistory = [];
    session.isPlaying = false;
    await this.sessionRepo.save(session);
    this.sessions.set(userId, session);

    return j;
  }

  calculateJackpotPayout(session: PlayerSession): number {
    const basePayout = 100000 + (session.lastBetAmount || 0) * 50;
    return basePayout;
  }

  async endSession(userId: string) {
    const session = await this.ensureSession(userId);
    const user = await this.userRepo.findOne({ where: { userId: userId } });

    if (!user) {
      throw new Error('User not found');
    }

    const withdrawAmount = session.tableBalance;

    if (withdrawAmount > 0) {
      user.balance += withdrawAmount;
      await this.userRepo.save(user);
    }

    session.isPlaying = false;
    session.winStreak = 0;
    session.cardsHistory = [];
    session.tableBalance = 0;
    await this.sessionRepo.save(session);
    this.sessions.set(userId, session);
    return {
      session,
      userBalance: user.balance,
      withdrawAmount,
    };
  }

  async getSessionStats(userId: string) {
    const session = await this.ensureSession(userId);
    const user = await this.userRepo.findOne({ where: { userId: userId } });

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
}
