import { IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';

export class CreateKnownPayerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsPhoneNumber('KE')
  @IsNotEmpty()
  phone!: string;
}
