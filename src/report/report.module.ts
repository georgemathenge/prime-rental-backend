import { Module } from '@nestjs/common';
import { ReportService } from './report.service.js';
import { ReportController } from './report.controller.js';

@Module({
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
