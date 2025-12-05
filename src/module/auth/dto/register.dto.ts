import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterDto {
  @IsString({})
  @IsNotEmpty({ message: 'Account is not empty' })
  account: string;

  @IsString({})
  @IsNotEmpty({ message: 'Password is not empty' })
  password: string;
}
