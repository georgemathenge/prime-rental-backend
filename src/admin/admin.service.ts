import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateAdminDto } from './dto/create-admin.dto.js';
import { UpdateAdminDto } from './dto/update-admin.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole } from '../auth/dto/register.dto.js';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  create(createAdminDto: CreateAdminDto) {
    return 'This action adds a new admin';
  }

  // async upgradeToAdmin(userId: any, adminId: string) {
  //   const user = await this.prisma.user.findUnique({
  //     where: { id: userId },
  //   });

  //   if (!user) {
  //     throw new NotFoundException('User not found');
  //   }

  //   if (user.role == UserRole.SUPER_ADMIN) {
  //     throw new BadRequestException('User is already an admin');
  //   }

  //   if (userId === adminId) {
  //     throw new ForbiddenException('Cannot modify your own role');
  //   }

  //   const updatedUser = await this.prisma.users.update({
  //     where: { id: userId },
  //     data: { role: UserRole.ADMIN },
  //   });
  //   return {
  //     status: 200,
  //     message: 'User upgraded to admin successfully',
  //     user: updatedUser,
  //   };
  // }

  findAll() {
    return `This action returns all admin`;
  }

  findOne(id: number) {
    return `This action returns a #${id} admin`;
  }

  update(id: number, updateAdminDto: UpdateAdminDto) {
    return `This action updates a #${id} admin`;
  }

  remove(id: number) {
    return `This action removes a #${id} admin`;
  }
}
