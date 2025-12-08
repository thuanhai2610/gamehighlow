import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
export class Jackpot {
  @PrimaryGeneratedColumn('uuid')
  jackbotId: number;

  @Column()
  @Index()
  userId: string;

  @Column()
  roundIds: string;

  @Column({ default: 0 })
  payoutAmount: number;

  @CreateDateColumn()
  createdAt: Date;
}
