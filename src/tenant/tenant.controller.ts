import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  UploadedFile,
  BadRequestException,
  Query,
  UseGuards,
  Put,
  Req,
} from '@nestjs/common';
import { TenantService } from './tenant.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { FindAllTenantsDto } from './dto/find-tenant.dto.js';
import { CreateKnownPayerDto } from './dto/create-known-players.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { Request } from 'express';

@Controller('tenant')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createTenantDto: CreateTenantDto,
    @CurrentUser() user: { id: string },
    @Req() req: Request,
  ) {
    const ip = req.ip ?? (req.headers['x-forwarded-for'] as string);

    return this.tenantService.create(createTenantDto, user.id, ip);
  }

  @Post(':propertyId/upload')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard)
  async uploadTenants(
    @Param('propertyId') propertyId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: { id: string },
  ) {
    const allowedExtensions = /\.(xlsx|xls|csv)$/i;
    if (!allowedExtensions.test(file.originalname)) {
      throw new BadRequestException(
        'Only .xlsx, .xls, and .csv files are allowed.',
      );
    }

    return this.tenantService.processExcelUpload(
      file.buffer,
      propertyId,
      user.id,
    );
  }
  @Get()
  findAll(@Query() dto: FindAllTenantsDto) {
    return this.tenantService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTenantDto: UpdateTenantDto,
    @Req() req: Request,
    @CurrentUser() user: { id: string },
  ) {
    const ip = req.ip ?? (req.headers['x-forwarded-for'] as string);

    return this.tenantService.update(id, updateTenantDto, ip, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tenantService.deactivate(id);
  }

  @Post('/:tenantId/known-payers')
  addKnownPayer(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreateKnownPayerDto,
    @Query('propertyId') propertyId: string,
  ) {
    return this.tenantService.addKnownPayer(tenantId, dto, propertyId);
  }

  @Get('/:tenantId/known-payers')
  getKnownPayers(@Param('tenantId') tenantId: string) {
    return this.tenantService.getKnownPayers(tenantId);
  }

  @Delete('known-payers/:id')
  removeKnownPayer(@Param('id') id: string) {
    return this.tenantService.removeKnownPayer(id);
  }
  @Put(':id/terminate')
  @UseGuards(JwtAuthGuard)
  terminate(@Param('id') id: string) {
    return this.tenantService.terminate(id);
  }
}
