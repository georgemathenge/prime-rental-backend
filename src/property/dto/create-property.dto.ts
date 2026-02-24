// create-property.dto.ts
import { IsString, IsOptional } from 'class-validator';

export class CreatePropertyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;
}
