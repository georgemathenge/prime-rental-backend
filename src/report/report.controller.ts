import { Controller, UseGuards, Get, Query, Res } from '@nestjs/common';
import { ReportService } from './report.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FindAllInvoicesDto } from '../invoice/dto/find-all-invoices.dto.js';
import type { Response } from 'express';

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

  @Get('rent-collection')
  @UseGuards(JwtAuthGuard)
  async rentCollection(
    @Query('propertyId') propertyId: string,
    @Query('year') year: string,
    @Res() res: Response,
  ) {
    const buffer = await this.reportService.generateRentCollectionReport(
      propertyId,
      parseInt(year),
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="rent-collection-${year}.pdf"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
