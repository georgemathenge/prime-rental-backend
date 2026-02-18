import { Module } from '@nestjs/common';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { CloudinaryService } from '../services/cloudinary/cloudinary.service.js';
import { UploadService } from '../shared/upload/upload.service.js';
import { ConfigService } from '@nestjs/config';

@Module({
  controllers: [UserController],
  providers: [UserService, CloudinaryService, ConfigService, UploadService],
})
export class UserModule {}
