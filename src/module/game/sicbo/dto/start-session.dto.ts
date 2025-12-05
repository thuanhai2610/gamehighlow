import { IsString, IsNumber, IsIn, IsOptional } from 'class-validator';

export class StartSessionDto {
  @IsString()
  userId: string;

  @IsNumber()
  @IsOptional()
  betAmount?: number;
}
