import { IsString, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { HouseStatus } from '@prisma/client';
export class UpdateHouseDto {
  @IsString()
  @IsOptional()
  houseCode?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlyRent?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  depositAmount?: number;

  @IsEnum(HouseStatus)
  @IsOptional()
  status?: HouseStatus;
}
