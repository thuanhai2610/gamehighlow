import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class DepositDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1, { message: 'Deposit amount must be at least 1' })
  amount: number;
}
