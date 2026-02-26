import { Controller, UseGuards, Get } from '@nestjs/common';
import { ReportService } from './report.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@Controller('report')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}
  @Get('dashboard')
  getDashboard() {
    return this.reportService.getDashboard();
  }
}
