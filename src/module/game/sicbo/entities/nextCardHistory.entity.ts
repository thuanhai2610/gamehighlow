import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PlayerSession } from './player-session.entity';

@Entity()
export class NextCard {
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
}
