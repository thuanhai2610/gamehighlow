import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class PlayerSession {
  @PrimaryGeneratedColumn('uuid')
  playerSessionId: string;

  @Column({ unique: true })
  userId: string;

  @Column({ default: 0 })
  winStreak: number;

  @Column('simple-json', { nullable: true })
  cardsHistory: number[];

  @Column({ default: 0 })
  lastBetAmount: number;

  @Column({ default: 0 })
  tableBalance: number;

  @Column({ default: false })
  isPlaying: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
