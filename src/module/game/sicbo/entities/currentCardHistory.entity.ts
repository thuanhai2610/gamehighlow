import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlayerSession } from './player-session.entity';

@Entity()
@Index(['session'])
export class CurrentCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  rank: number;

  @Column()
  card: number;

  @Column()
  cardNumber: number;

  @ManyToOne(() => PlayerSession, (session) => session.cardsHistory, {
    onDelete: 'CASCADE',
  })
  session: PlayerSession;

  @CreateDateColumn()
  createdAt: Date;
}
