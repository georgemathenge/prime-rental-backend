import { Module } from '@nestjs/common';
import { InvoiceCronService } from './invoice-cron.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [InvoiceCronService],
})
export class InvoiceCronModule {}
