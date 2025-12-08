import { IsString, IsNumber, IsOptional } from 'class-validator';

export class StartSessionDto {
  @IsString()
  userId: string;

  @IsNumber()
  @IsOptional()
  betAmount?: number;
}
