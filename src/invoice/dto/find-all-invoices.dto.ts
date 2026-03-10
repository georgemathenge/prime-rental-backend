// find-all-invoices.dto.ts
import { IsOptional, IsEnum, IsString, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { InvoiceStatus, InvoiceType } from '@prisma/client';

export class FindAllInvoicesDto {
  @IsString()
  @IsOptional()
  propertyId?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @IsEnum(InvoiceType)
  @IsOptional()
  type?: InvoiceType;

  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  overdue?: boolean;
}
