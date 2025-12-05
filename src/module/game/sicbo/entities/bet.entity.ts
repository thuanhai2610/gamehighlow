import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Round } from './round.entity';

@Entity()
export class Bet {
  @PrimaryGeneratedColumn('uuid')
  betId: string;

  @Column()
  userId: string;

  @ManyToOne(() => Round, (round) => round.bets, { onDelete: 'CASCADE' })
  round: Round;

  @Column()
  choice: 'over' | 'under';

  @Column()
  amount: number;

  @Column()
  win: boolean;

  @Column()
  winAmount: number;

  @CreateDateColumn()
  createdAt: Date;
}
