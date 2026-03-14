import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ProfileService } from './profile.service.js';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { Request } from 'express';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getProfile(@CurrentUser() user: { id: string }) {
    return this.profileService.getProfile(user.id);
  }

  @Patch()
  updateProfile(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress;
    return this.profileService.updateProfile(user.id, dto, ip);
  }

  @Patch('change-password')
  changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress;
    return this.profileService.changePassword(user.id, dto, ip);
  }

  @Get('activity')
  getActivity(@CurrentUser() user: { id: string }) {
    return this.profileService.getActivity(user.id);
  }
}
