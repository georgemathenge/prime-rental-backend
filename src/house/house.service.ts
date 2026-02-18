import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { CreateHouseDto } from './dto/create-house.dto.js';
import { UpdateHouseDto } from './dto/update-house.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';

@Injectable()
export class HouseService {
  // 1. Single Create with Duplicate Check

  constructor(private prisma: PrismaService) {}
  async create(createHouseDto: CreateHouseDto) {
    // Check if houseCode already exists in this specific property
    const existingHouse = await this.prisma.house.findFirst({
      where: {
        houseCode: createHouseDto.houseCode,
        propertyId: createHouseDto.propertyId,
      },
    });

    if (existingHouse) {
      throw new ConflictException(
        `House code "${createHouseDto.houseCode}" already exists in this property.`,
      );
    }

    return this.prisma.house.create({
      data: {
        houseCode: createHouseDto.houseCode,
        propertyId: createHouseDto.propertyId,
        monthlyRent: new Prisma.Decimal(createHouseDto.monthlyRent),
        depositAmount: new Prisma.Decimal(createHouseDto.depositAmount),
        currentBalance: new Prisma.Decimal(createHouseDto.currentBalance || 0),
      },
    });
  }

  // 2. Bulk Create Method
  createBulk(createHouseDtos: CreateHouseDto[]) {
    if (!createHouseDtos || createHouseDtos.length === 0) {
      throw new BadRequestException(
        'No house data provided for bulk creation.',
      );
    }

    // Convert numbers to Prisma.Decimal for each house in the array
    const data = createHouseDtos.map((dto) => ({
      houseCode: dto.houseCode,
      propertyId: dto.propertyId,
      monthlyRent: new Prisma.Decimal(dto.monthlyRent),
      depositAmount: new Prisma.Decimal(dto.depositAmount),
      currentBalance: new Prisma.Decimal(dto.currentBalance || 0),
    }));

    // Note: createMany returns { count: number }
    // skipDuplicates: true ensures it won't crash if one house already exists
    return this.prisma.house.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async processExcelUpload(buffer: Buffer, propertyId: string) {
    // 1. Read the Excel/CSV from buffer
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // 2. Convert to JSON
    // Expected Excel Columns: houseCode, monthlyRent, depositAmount
    const rows = XLSX.utils.sheet_to_json(sheet);

    // 3. Transform rows to Prisma format
    const housesToCreate = rows.map((row: any) => ({
      houseCode: String(row.houseCode),
      monthlyRent: new Prisma.Decimal(row.monthlyRent || 0),
      depositAmount: new Prisma.Decimal(row.depositAmount || 0),
      propertyId: propertyId,
      currentBalance: new Prisma.Decimal(0),
    }));

    // 4. Bulk insert into Database
    // skipDuplicates: true ensures it doesn't crash if a house code already exists
    const result = await this.prisma.house.createMany({
      data: housesToCreate,
      skipDuplicates: true,
    });

    return {
      message: `Successfully processed ${housesToCreate.length} rows.`,
      count: result.count,
    };
  }

  findAll() {
    return `This action returns all house`;
  }

  findOne(id: number) {
    return `This action returns a #${id} house`;
  }

  update(id: number, updateHouseDto: UpdateHouseDto) {
    return `This action updates a #${id} house`;
  }

  remove(id: number) {
    return `This action removes a #${id} house`;
  }
}
