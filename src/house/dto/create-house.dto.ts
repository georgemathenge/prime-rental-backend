import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsUUID,
  IsOptional,
} from 'class-validator';

export class CreateHouseDto {
  @IsString()
  @IsNotEmpty()
  houseCode!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monthlyRent!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  depositAmount!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  currentBalance?: number;
}
