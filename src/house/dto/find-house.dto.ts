import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
} from 'class-validator';

export class FindAllHousesDto {
  @IsString()
  @IsOptional()
  @IsString()
  propertyId: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(['true', 'false', 'all'])
  @IsOptional()
  occupied?: 'true' | 'false' | 'all';

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  limit?: number = 20;
}
