import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FindAllInvoicesDto } from './dto/find-all-invoices.dto.js';

@Controller('invoice')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createInvoiceDto: CreateInvoiceDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.invoiceService.create(createInvoiceDto, user.id);
  }

  @Post('auto-generate')
  autoGenerateInvoices(@Body() createInvoiceDto: CreateInvoiceDto) {
    return this.invoiceService.autoGenerateInvoices(createInvoiceDto, 'system');
  }

  @Get()
  findAll(@Query() dto: FindAllInvoicesDto) {
    return this.invoiceService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoiceService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateInvoiceDto: UpdateInvoiceDto) {
    return this.invoiceService.update(+id, updateInvoiceDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.invoiceService.remove(id);
  }
}
