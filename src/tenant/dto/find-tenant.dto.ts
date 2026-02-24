import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsNumber } from 'class-validator';

export class FindAllTenantsDto {
  @IsEnum(['active', 'inactive', 'all'])
  @IsOptional()
  status?: 'active' | 'inactive' | 'all';

  @IsString()
  @IsOptional()
  propertyId?: string;

  @IsString()
  @IsOptional()
  houseId?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  limit?: number = 20;
}
