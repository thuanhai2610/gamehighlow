import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Bet } from './bet.entity';

@Entity()
export class Round {
  @PrimaryGeneratedColumn('uuid')
  roundId: string;

  @Column()
  @Index('idx_round_user')
  userId: string;

  @Column('simple-json')
  currentCard: { rank: number; card: number };

  @Column('simple-json')
  nextCard: { rank: number; card: number };

  @Column({ default: 0 })
  isWin: 0 | 1;

  @Column()
  betAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Bet, (b) => b.round)
  bets: Bet[];
}
