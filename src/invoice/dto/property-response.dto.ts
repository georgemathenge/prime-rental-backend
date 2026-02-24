// property-response.dto.ts
import { Exclude, Expose, Type } from 'class-transformer';

class CreatedByDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  email: string;
}

@Exclude()
export class PropertyResponseDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  bankAccount?: string;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  @Expose()
  @Type(() => CreatedByDto)
  createdBy: CreatedByDto;
}
