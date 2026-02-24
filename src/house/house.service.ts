import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateHouseDto } from './dto/create-house.dto.js';
import { UpdateHouseDto } from './dto/update-house.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { FindAllHousesDto } from './dto/find-house.dto.js';

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

  async findAll(dto: FindAllHousesDto) {
    const { propertyId, search, occupied, page = 1, limit = 20 } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.HouseWhereInput = { propertyId };

    if (search) {
      where.houseCode = { contains: search, mode: 'insensitive' };
    }

    if (occupied === 'true') {
      where.lease = { some: { endDate: null } };
    } else if (occupied === 'false') {
      where.lease = { none: { endDate: null } };
    }

    const [houses, total] = await Promise.all([
      this.prisma.house.findMany({
        where,
        skip,
        take: limit,
        orderBy: { houseCode: 'asc' },
        select: {
          id: true,
          houseCode: true,
          monthlyRent: true,
          depositAmount: true,
          currentBalance: true,
          createdAt: true,
          lease: {
            where: { endDate: null },
            select: {
              id: true,
              startDate: true,
              status: true,
              tenant: {
                select: {
                  id: true,
                  fullName: true,
                  primaryPhone: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.house.count({ where }),
    ]);

    return {
      data: houses.map((house) => ({
        ...house,
        occupants: house.lease.map((l) => ({
          leaseId: l.id,
          since: l.startDate,
          status: l.status,
          tenant: l.tenant,
        })),
        isOccupied: house.lease.length > 0,
        leases: undefined,
      })),
      meta: {
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  findOne(id: number) {
    return `This action returns a #${id} house`;
  }

  async update(id: string, updateHouseDto: UpdateHouseDto) {
    const house = await this.prisma.house.findUnique({ where: { id } });
    if (!house) {
      throw new BadRequestException(`House with ID ${id} not found.`);
    }
    const updatedHouse = this.prisma.house.update({
      where: { id },
      data: {
        ...updateHouseDto,
      },
    });
    return updatedHouse;
  }

  async deactivate(id: string) {
    const house = await this.prisma.house.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!house) {
      throw new NotFoundException('House not found.');
    }

    return this.prisma.house.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
