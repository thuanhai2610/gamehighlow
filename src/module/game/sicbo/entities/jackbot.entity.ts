import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class Jackpot {
  @PrimaryGeneratedColumn('uuid')
  jackbotId: number;

  @Column()
  userId: string;

  @Column()
  roundIds: string;

  @Column()
  payoutAmount: number;

  @CreateDateColumn()
  createdAt: Date;
}
