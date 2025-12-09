import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Round } from './round.entity';

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

  @Column({
    type: 'decimal',
    precision: 65,
    scale: 2,
    nullable: false,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseInt(value) || 0,
    },
    default: 0,
  })
  amount: number;

  @Column({
    type: 'decimal',
    precision: 65,
    scale: 2,
    nullable: false,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseInt(value) || 0,
    },
    default: 0,
  })
  isWin: 0 | 1;

  @Column({
    type: 'decimal',
    precision: 65,
    scale: 2,
    nullable: false,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseInt(value) || 0,
    },
    default: 0,
  })
  winAmount: number;

  @CreateDateColumn()
  createdAt: Date;
}
