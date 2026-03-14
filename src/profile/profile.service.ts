import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditAction } from '@prisma/client';

import * as bcrypt from 'bcrypt';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found.');
    return { data: user };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true },
    });

    if (!user) throw new NotFoundException('User not found.');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
    });

    await this.auditService.log({
      userId,
      action: AuditAction.USER_UPDATED,
      entity: 'User',
      entityId: userId,
      summary: `Updated profile`,
      meta: { changes: dto },
      ip,
    });

    return { data: updated };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, password: true },
    });

    if (!user) throw new NotFoundException('User not found.');

    const isMatch = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect.');
    }

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }

    if (dto.newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters.');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    await this.auditService.log({
      userId,
      action: AuditAction.USER_UPDATED,
      entity: 'User',
      entityId: userId,
      summary: `Changed password`,
      ip,
    });

    return { message: 'Password changed successfully.' };
  }

  async getActivity(userId: string) {
    return this.auditService.findAll({ userId, limit: 10 });
  }
}
