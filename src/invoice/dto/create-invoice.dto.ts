import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEnum,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum InvoiceType {
  RENT = 'RENT',
  PENALTY = 'PENALTY',
  DEPOSIT = 'DEPOSIT',
  // OTHER = 'OTHER',
}

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  houseId: string;

  @IsString()
  @IsNotEmpty()
  leaseId: string;

  @IsEnum(InvoiceType)
  @IsOptional()
  type?: InvoiceType;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  penaltyAmount?: number = 0;

  @IsDateString()
  dueDate: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
