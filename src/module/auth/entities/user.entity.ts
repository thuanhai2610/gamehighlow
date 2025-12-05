import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  userId: string;

  @Column()
  @Index()
  account: string;

  @Column()
  password: string;

  @Column({ default: 0 })
  balance: number;

  @Column({ nullable: true })
  bankName: string;

  @Column({ nullable: true })
  bankShortName: string;

  @Column({ nullable: true })
  bankAccountName: string;

  @Column({ nullable: true })
  bankAccountNumber: number;
}
