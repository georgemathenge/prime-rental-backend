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
  async create(createHouseDto: CreateHouseDto, propertyId: string) {
    // Check if houseCode already exists in this specific property
    const existingHouse = await this.prisma.house.findFirst({
      where: {
        houseCode: createHouseDto.houseCode,
        propertyId: propertyId,
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
        propertyId: propertyId,
        monthlyRent: new Prisma.Decimal(createHouseDto.monthlyRent),
        depositAmount: new Prisma.Decimal(createHouseDto.depositAmount),
        currentBalance: new Prisma.Decimal(createHouseDto.currentBalance || 0),
      },
    });
  }

  // 2. Bulk Create Method

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
          status: true,
          createdAt: true,
          property: {
            select: {
              name: true,
            },
          },
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

  async findOne(id: string) {
    const house = await this.prisma.house.findUnique({
      where: { id },
      select: {
        id: true,
        houseCode: true,
        monthlyRent: true,
        depositAmount: true,
        currentBalance: true,
        status: true,
        isActive: true,
        createdAt: true,
        property: {
          select: { id: true, name: true },
        },
        lease: {
          orderBy: { startDate: 'desc' },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            tenant: {
              select: {
                id: true,
                fullName: true,
                primaryPhone: true,
                email: true,
                isActive: true,
              },
            },
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            invoiceNumber: true,
            type: true,
            status: true,
            totalAmount: true,
            paidAmount: true,
            balanceDue: true,
            dueDate: true,
            periodStart: true,
            periodEnd: true,
            createdAt: true,
          },
        },
        payments: {
          orderBy: { datePaid: 'desc' },
          take: 10,
          select: {
            id: true,
            amount: true,
            datePaid: true,
            type: true,
            note: true,
            invoice: {
              select: {
                invoiceNumber: true,
                status: true,
                periodStart: true,
                periodEnd: true,
                totalAmount: true,
                paidAmount: true,
                balanceDue: true,
              },
            },
            bankTransaction: {
              select: {
                id: true,
                transactionDate: true,
                payerPhone: true,
                narrative: true,
                status: true,
                matchLevel: true,
                bankReference: true,
              },
            },
          },
        },
      },
    });

    if (!house) throw new NotFoundException(`House with ID ${id} not found.`);

    const activeLeases = house.lease.filter((l) => l.endDate === null);
    const previousLeases = house.lease.filter((l) => l.endDate !== null);

    return {
      data: {
        ...house,
        occupants: activeLeases.map((l) => ({
          leaseId: l.id,
          since: l.startDate,
          status: l.status,
          tenant: l.tenant,
        })),
        leaseHistory: previousLeases.map((l) => ({
          leaseId: l.id,
          from: l.startDate,
          to: l.endDate,
          status: l.status,
          tenant: l.tenant,
        })),
        financialSummary: {
          totalOutstanding: house.invoices
            .filter((inv) =>
              ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(inv.status),
            )
            .reduce((sum, inv) => sum + Number(inv.balanceDue), 0),
          totalPaid: house.invoices.reduce(
            (sum, inv) => sum + Number(inv.paidAmount),
            0,
          ),
          unpaidCount: house.invoices.filter((inv) => inv.status === 'UNPAID')
            .length,
          partialCount: house.invoices.filter((inv) => inv.status === 'PARTIAL')
            .length,
          overdueCount: house.invoices.filter((inv) => inv.status === 'OVERDUE')
            .length,
          hasArrears: house.invoices.some((inv) =>
            ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(inv.status),
          ),
        },
        lease: undefined,
      },
    };
  }

  async update(id: string, dto: UpdateHouseDto) {
    const house = await this.prisma.house.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!house) throw new NotFoundException('House not found.');

    // If houseCode is being changed check it doesn't conflict
    if (dto.houseCode) {
      const existing = await this.prisma.house.findFirst({
        where: {
          houseCode: dto.houseCode,
          property: { houses: { some: { id } } },
          NOT: { id }, // exclude current house
        },
      });
      if (existing) {
        throw new ConflictException(
          `House code "${dto.houseCode}" already exists in this property.`,
        );
      }
    }

    return this.prisma.house.update({
      where: { id },
      data: {
        ...(dto.houseCode && { houseCode: dto.houseCode }),
        ...(dto.monthlyRent && {
          monthlyRent: new Prisma.Decimal(dto.monthlyRent),
        }),
        ...(dto.depositAmount && {
          depositAmount: new Prisma.Decimal(dto.depositAmount),
        }),
        ...(dto.status && { status: dto.status }),
      },
      select: {
        id: true,
        houseCode: true,
        monthlyRent: true,
        depositAmount: true,
        status: true,
        property: { select: { name: true } },
      },
    });
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
  async getActiveLease(houseId: string) {
    const lease = await this.prisma.lease.findFirst({
      where: { houseId, endDate: null },
      select: { id: true, tenantId: true, startDate: true },
    });

    if (!lease)
      throw new NotFoundException('No active lease found for this house.');
    return {
      data: lease,
    };
  }
  async getActiveInvoice(houseId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        houseId,
        status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        invoiceNumber: true,
        type: true,
        totalAmount: true,
        balanceDue: true,
        status: true,
        periodStart: true,
        periodEnd: true,
      },
    });

    if (!invoice)
      throw new NotFoundException('No unpaid invoice found for this house.');
    return invoice;
  }
}
