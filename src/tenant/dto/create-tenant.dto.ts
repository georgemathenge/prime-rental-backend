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
  email?: string;

  @IsUUID()
  @IsNotEmpty()
  houseId!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

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
