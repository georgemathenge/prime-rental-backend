import { Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsPhoneNumber,
  IsUUID,
  IsBoolean,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  /**
   * Primary phone used for Level 1 M-Pesa matching.
   * 'KE' ensures it validates Kenyan formats (07... or +254...)
   */
  @IsPhoneNumber('KE')
  @IsNotEmpty()
  primaryPhone!: string;

  @IsEmail()
  @IsOptional()
  @Transform(({ value }: { value: string }) =>
    value === '' ? undefined : value,
  )
  email?: string;

  @IsUUID()
  @IsNotEmpty()
  houseId!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @Transform(({ value }) => (value ? new Date(value).toISOString() : undefined))
  @IsOptional()
  startDate?: Date;

  @IsOptional()
  endDate?: Date;

  @IsOptional()
  notes?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsOptional()
  @IsString()
  idType?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  pdfUrl?: string;
}
