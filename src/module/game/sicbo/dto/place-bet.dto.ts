import { IsString, IsIn, IsNumber, Min } from 'class-validator';

export class GuessDto {
  @IsString()
  userId: string;

  @IsIn(['over', 'under'])
  choice: 'over' | 'under';

  @IsNumber()
  @Min(0)
  betAmount: number;
}
