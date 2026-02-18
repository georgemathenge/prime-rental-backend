import { PartialType } from '@nestjs/mapped-types';
import { CreateHouseDto } from './create-house.dto.js';

export class UpdateHouseDto extends PartialType(CreateHouseDto) {}
