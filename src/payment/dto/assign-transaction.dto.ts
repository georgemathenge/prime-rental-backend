import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

// assign-transaction.dto.ts
export class AssignTransactionDto {
  @IsString()
  @IsNotEmpty()
  houseId: string;

  @IsString()
  @IsOptional()
  invoiceId?: string;

  @IsString()
  @IsOptional()
  note?: string;
}
