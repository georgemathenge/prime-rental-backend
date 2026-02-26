import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { HouseService } from './house.service.js';
import { CreateHouseDto } from './dto/create-house.dto.js';
import { UpdateHouseDto } from './dto/update-house.dto.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { FindAllHousesDto } from './dto/find-house.dto.js';

@Controller('house')
export class HouseController {
  constructor(private readonly houseService: HouseService) {}

  @Post()
  create(@Body() createHouseDto: CreateHouseDto) {
    return this.houseService.create(createHouseDto);
  }
  @Post('upload/:propertyId')
  @UseInterceptors(FileInterceptor('file'))
  uploadHouses(
    @UploadedFile() file: Express.Multer.File,
    @Param('propertyId') propertyId: string,
  ) {
    if (!file) {
      throw new BadRequestException('Please upload an Excel or CSV file.');
    }
    return this.houseService.processExcelUpload(file.buffer, propertyId);
  }

  @Get()
  findAll(@Query() dto: FindAllHousesDto) {
    return this.houseService.findAll(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.houseService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateHouseDto: UpdateHouseDto) {
    return this.houseService.update(id, updateHouseDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.houseService.deactivate(id);
  }
  @Get(':id/active-lease')
  getActiveLease(@Param('id') id: string) {
    return this.houseService.getActiveLease(id);
  }
}
