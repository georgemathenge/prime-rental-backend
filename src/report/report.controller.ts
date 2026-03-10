import { Controller, UseGuards, Get, Query } from '@nestjs/common';
import { ReportService } from './report.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FindAllInvoicesDto } from '../invoice/dto/find-all-invoices.dto.js';

@Controller('report')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}
  @Get('dashboard')
  getDashboard(@Query('propertyId') propertyId: string) {
    return this.reportService.getDashboard(propertyId);
  }
  @Get('overdue-invoices')
  getOverDueInvoices(@Query() dto: FindAllInvoicesDto) {
    return this.reportService.getOverDueInvoices(dto);
  }
}
