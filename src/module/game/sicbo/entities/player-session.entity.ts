import { Min } from 'class-validator';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class PlayerSession {
  @PrimaryGeneratedColumn('uuid')
  playerSessionId: string;

  @Column({ unique: true })
  @Index('idx_session_user')
  userId: string;

  @Column({ default: 0 })
  winStreak: number;

  @Column('simple-json', { nullable: true })
  cardsHistory: { rank: number; card: number }[];

  @Column({ default: 0 })
  @Min(0)
  lastBetAmount: number;

  @Column({ default: 0 })
  @Min(0)
  tableBalance: number;

  @Column({ default: false })
  isPlaying: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
