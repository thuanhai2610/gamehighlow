import { IsString, IsIn, IsNumber } from 'class-validator';

export class GuessDto {
  @IsString()
  userId: string;

  @IsIn(['over', 'under'])
  choice: 'over' | 'under';

  @IsNumber()
  betAmount: number;
}
