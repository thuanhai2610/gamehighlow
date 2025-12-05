import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Bet } from './bet.entity';

@Entity()
export class Round {
  @PrimaryGeneratedColumn('uuid')
  roundId: string;

  @Column()
  userId: string;

  @Column()
  currentCard: number;

  @Column()
  nextCard: number;

  @Column({ default: false })
  win: boolean;

  @Column()
  betAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Bet, (b) => b.round)
  bets: Bet[];
}
