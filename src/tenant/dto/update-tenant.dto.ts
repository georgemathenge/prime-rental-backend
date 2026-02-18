import { PartialType } from '@nestjs/swagger';
import { CreateTenantDto } from './create-tenant.dto.js';

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
