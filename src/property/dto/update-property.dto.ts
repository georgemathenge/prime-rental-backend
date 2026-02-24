// update-property.dto.ts
import { IsString, IsOptional } from 'class-validator';

export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;
}
