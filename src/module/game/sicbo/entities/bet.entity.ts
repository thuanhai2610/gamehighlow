import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Round } from './round.entity';
import { Min } from 'class-validator';

@Entity()
export class Bet {
  @PrimaryGeneratedColumn('uuid')
  betId: string;

  @Column()
  @Index('idx_bet_user')
  userId: string;

  @ManyToOne(() => Round, (round) => round.bets, { onDelete: 'CASCADE' })
  round: Round;

  @Column()
  choice: 'over' | 'under';

  @Column({ default: 0 })
  @Min(0)
  amount: number;

  @Column({ default: 0 })
  win: boolean;

  @Column({ default: 0 })
  @Min(0)
  winAmount: number;

  @CreateDateColumn()
  createdAt: Date;
}
