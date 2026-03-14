import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service.js';
import { TenantController } from './tenant.controller.js';
import { memoryStorage } from 'multer';
import { MulterModule } from '@nestjs/platform-express';
import { AuditService } from '../audit/audit.service.js';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
    }),
  ],
  controllers: [TenantController],
  providers: [TenantService, AuditService],
})
export class TenantModule {}
