import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { account, password } = registerDto;
    const userExist = await this.userRepository.findOneBy({ account });
    if (userExist) throw new BadRequestException('Account is already');
    const hashPassword = await argon2.hash(password);
    const user = this.userRepository.create({
      account,
      password: hashPassword,
    });
    await this.userRepository.save(user);
  }

  async login(loginDto: LoginDto) {
    const { account, password } = loginDto;
    const userExist = await this.userRepository.findOneBy({ account });
    if (!userExist) throw new NotFoundException('Account is wrong');
    const isMatch = await argon2.verify(userExist.password, password);
    if (!isMatch) throw new UnauthorizedException('Password is wrong');
    return userExist;
  }

  generateToken(account: string, userId: string) {
    const token = this.jwtService.sign(
      {
        userId: userId,
        account: account,
      },
      {
        secret: process.env.JWT_ACCESS_TOKEN,
      },
    );
    return token;
  }
  generateRefreshToken(account: string, userId: string) {
    const refreshToken = this.jwtService.sign(
      {
        userId: userId,
        account: account,
      },
      {
        secret: process.env.JWT_ACCESS_TOKEN,
        expiresIn: '7d',
      },
    );
    return refreshToken;
  }
}
