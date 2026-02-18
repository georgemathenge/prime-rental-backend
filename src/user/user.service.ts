import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloudinaryService } from '../services/cloudinary/cloudinary.service.js';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async fetchUserProfile(id: string) {
    const user_profile = await this.prisma.user.findUnique({
      where: { id },
      select: {
        fullName: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { user_profile };
  }

  // async updateAvatar(id: string, url: string) {
  //   try {
  //     await this.prisma.user.update({
  //       where: { id },
  //       data: { avatar_url: url },
  //     });
  //     return { status: 200, message: 'Avatar updated successfully' };
  //   } catch (error: any) {
  //     throw new InternalServerErrorException(
  //       'Failed to update user avatar: ' + error,
  //     );
  //   }
  // }
  async updateProfile(id: string, body: any) {
    try {
      await this.prisma.user.update({
        where: { id },
        data: body,
      });
      return { status: 200, message: 'Profile updated successfully' };
    } catch (error: any) {
      throw new InternalServerErrorException(
        'Failed to update user profile: ' + error,
      );
    }
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
