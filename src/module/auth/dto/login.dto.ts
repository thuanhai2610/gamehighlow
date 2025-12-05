import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString({})
  @IsNotEmpty({ message: 'Account is not empty' })
  account: string;

  @IsString({})
  @IsNotEmpty({ message: 'Password is not empty' })
  password: string;
}
