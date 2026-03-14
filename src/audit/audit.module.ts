import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditController } from './audit.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
