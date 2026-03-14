import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto, UserRole } from './dto/register.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import * as bcrypt from 'bcryptjs';
@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, fullName, role } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const saltRounds = 10;

    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: passwordHash,
        fullName: fullName, // Assuming fullName is stored in first_name for simplicity

        role: role || UserRole.TENANT,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });
    const token = this.generateToken(
      user.id,
      user.fullName,
      user.email,
      user.role,
    );

    // await this.mailService.sendVerificationEmail(user.email, token);

    return {
      user,
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        fullName: true,
        password: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is banned
    // if (user.isBanned) {
    //   throw new UnauthorizedException('Account has been banned');
    // }

    // Check if user is active
    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    // Verify password

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate JWT token
    const token = this.generateToken(
      user.id,
      user.fullName,
      user.email,
      user.role,
    );

    // const { password: _password, ...userWithoutPassword } = user;

    return {
      // user: userWithoutPassword,
      token,
    };
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        lastLoginAt: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid user');
    }

    return user;
  }

  private generateToken(
    userId: string,
    userName: string,
    email: string,
    role: string,
  ): string {
    const payload = {
      sub: userId,
      userName,
      email,
      role,
    };

    return this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    });
  }

  async refreshToken(userId: any) {
    const user = await this.validateUser(userId);
    return this.generateToken(user.id, user.fullName, user.email, user.role);
  }

  // async markEmailAsVerified(userId: string, token: string) {
  //   await this.prisma.users.update({
  //     where: { id: userId },
  //     data: { email_verified: true, verification_token: token },
  //   });
  // }
  async findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }
}

export interface AuthDto {
  register(registerDto: RegisterDto): Promise<{
    user: any;
    token: string;
  }>;
  login(loginDto: LoginDto): Promise<{
    user: any;
    token: string;
  }>;
  validateUser(userId: string): Promise<any>;
  refreshToken(userId: any): Promise<string>;
}
