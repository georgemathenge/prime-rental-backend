import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  UseGuards,
  Request,
  UploadedFile,
  UseInterceptors,
  InternalServerErrorException,
  BadRequestException,
  Query,
} from '@nestjs/common';

import { UserService } from './user.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from '../shared/upload/upload.service.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/role.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly uploadService: UploadService,
  ) {}

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getMyProfile(@Request() req: any) {
    return this.userService.fetchUserProfile(req.user.id);
  }

  @Patch('profile')
  @Roles('admin', 'creator', 'player  ')
  @UseGuards(JwtAuthGuard)
  updateProfile(@Body() body: any, @Request() req: any) {
    return this.userService.updateProfile(req.user.id, body);
  }

  @Patch('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.match(/^(image\/jpeg|image\/png|image\/jpg)$/)) {
          return callback(
            new InternalServerErrorException(
              'Only JPEG, PNG, and JPG files are allowed!',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  // async uploadAvatar(
  //   @UploadedFile() file: Express.Multer.File,
  //   @Request() req: any,
  // ) {
  //   const { url } = await this.uploadService.uploadImage(file);
  //   return this.userService.updateAvatar(req.user.id, url);
  // }

  // @Patch('user/role')
  // @Roles('admin')
  // @UseGuards(JwtAuthGuard)
  // upgradeToCreator(@CurrentUser() user: any) {
  //   if (user.role === 'creator') {
  //     throw new BadRequestException('Already a creator');
  //   }

  //   if (user.role === 'admin') {
  //     throw new BadRequestException('Admins cannot downgrade to creator');
  //   }

  //   // Instant upgrade!
  //   return this.userService.upgradeToCreator(user.id);
  // }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }

  // Endpoints for Creators
  // @Get('users/creator/search')
  // @Roles('creator,admin,player')
  // @UseGuards(JwtAuthGuard)
  // async getCreators(
  //   @Query('query') search: string,
  //   @Query('page') page: number = 1,
  //   @Query('limit') limit: number = 10,
  //   @Query('sort') sort: string = 'created_at:desc',
  //   @CurrentUser() user: any,
  // ) {
  //   const [sortField, sortOrder] = sort.split(':');
  //   return this.userService.getCreators({
  //     search,
  //     page: +page,
  //     limit: +limit,
  //     sortBy: sortField,
  //     sortOrder: sortOrder as 'asc' | 'desc',
  //     userId: user.id,
  //   });
  // }
}
