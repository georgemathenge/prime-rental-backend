import { BadRequestException, Injectable } from '@nestjs/common';
import { CloudinaryService } from '../../services/cloudinary/cloudinary.service.js';
@Injectable()
export class UploadService {
  constructor(private cloudinaryService: CloudinaryService) {}

  // async uploadImage(file: Express.Multer.File): Promise<any> {
  //   if (!file) throw new BadRequestException('File is required');
  //   if (!file.mimetype.match(/^(image\/jpeg|image\/png|image\/jpg)$/)) {
  //     throw new BadRequestException(
  //       'Only JPEG, PNG, and JPG files are allowed',
  //     );
  //   }
  //   const result = await this.cloudinaryService.uploadFile(file);
  //   return result.secure_url;
  // }

  // // async uploadFile(file: Express.Multer.File): Promise<string> {
  //   if (!file) throw new BadRequestException('File is required');

  //   // Optional: Add file size/type limits
  //   if (file.size > 10 * 1024 * 1024) {
  //     throw new BadRequestException('File too large (max 10MB)');
  //   }

  //   const result = await this.cloudinaryService.uploadFile(file);
  //   return result.secure_url;
  // }
}
