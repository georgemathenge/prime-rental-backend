import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Put,
  BadRequestException,
} from '@nestjs/common';
import { BankType, PaymentService } from './payment.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { UpdatePaymentDto } from './dto/update-payment.dto.js';
import { FindAllPaymentsDto } from './dto/find-payment.dto.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AssignTransactionDto } from './dto/assign-transaction.dto.js';
import { FindAllBankTransactionsDto } from './dto/find-bank-transactions.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import * as XLSX from 'xlsx';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

const VALID_BANKS: BankType[] = [
  BankType.EQUITY,
  BankType.KCB,
  BankType.COOPERATIVE,
];

@Controller('payment')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  create(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentService.create(createPaymentDto);
  }

  @Get()
  findAll(@Query() dto: FindAllBankTransactionsDto) {
    return this.paymentService.findAllBankTransactions(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
    return this.paymentService.update(+id, updatePaymentDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.paymentService.remove(+id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('bankType') bankType: BankType,
    @CurrentUser() user: { id: string },
    @Query('propertyId') propertyId: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are accepted.');
    }

    if (!Object.values(BankType).includes(bankType)) {
      throw new BadRequestException(
        `Invalid bank type. Supported: ${Object.values(BankType).join(', ')}`,
      );
    }
    if (!propertyId) {
      throw new BadRequestException('propertyId is required.');
    }

    return this.paymentService.uploadPdfAndReconcile(
      file.buffer,
      bankType,
      user.id,
      propertyId,
    );
  }

  @Get('bank-transactions')
  findAllBankTransactions(@Query() dto: FindAllBankTransactionsDto) {
    return this.paymentService.findAllBankTransactions(dto);
  }

  @Put(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignTransactionDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.paymentService.assignTransaction(id, dto, user.id);
  }

  @Post('extract')
  @UseInterceptors(FileInterceptor('file'))
  uploadStatement(
    @UploadedFile() file: Express.Multer.File,
    @Body('bankType') bankType: BankType,
  ) {
    if (!file || file.mimetype !== 'application/pdf') {
      throw new BadRequestException('A valid PDF file is required');
    }

    if (!bankType || !VALID_BANKS.includes(bankType)) {
      throw new BadRequestException(
        `bankType must be one of: ${VALID_BANKS.join(', ')}`,
      );
    }

    return this.paymentService.parseStatement(file.buffer, bankType);
  }
}
