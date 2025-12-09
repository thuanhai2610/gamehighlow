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
  lastBetAmount: number;

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
  tableBalance: number;

  @Column({ default: 0 })
  isPlaying: 0 | 1;

  @CreateDateColumn()
  createdAt: Date;
}
