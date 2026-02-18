import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async create(createTenantDto: CreateTenantDto) {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { primaryPhone: createTenantDto.primaryPhone },
    });

    if (existingTenant) {
      throw new ConflictException(
        'This phone number is already registered to another tenant.',
      );
    }

    // Verify the house exists
    const house = await this.prisma.house.findUnique({
      where: { id: createTenantDto.houseId },
      select: { id: true },
    });

    if (!house) {
      throw new NotFoundException(`House not found.`);
    }

    // Create tenant and lease in one transaction
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          fullName: createTenantDto.fullName,
          primaryPhone: createTenantDto.primaryPhone,
          email: createTenantDto.email ?? null,
          isActive: createTenantDto.isActive ?? true,
        },
      });

      const lease = await tx.lease.create({
        data: {
          tenantId: tenant.id,
          houseId: createTenantDto.houseId,
          startDate: createTenantDto.startDate ?? new Date(),
          pdfUrl: '',
          createdById: 'system',
        },
        include: {
          house: {
            select: {
              houseCode: true,
              monthlyRent: true,
              depositAmount: true,
            },
          },
        },
      });

      return {
        ...tenant,
        currentHouse: {
          leaseId: lease.id,
          since: lease.startDate,
          houseCode: lease.house.houseCode,
          monthlyRent: lease.house.monthlyRent,
          depositAmount: lease.house.depositAmount,
        },
      };
    });
  }

  async processExcelUpload(
    buffer: Buffer,
    propertyId: string,
    createdById: string,
  ) {
    interface UploadRow {
      houseCode: string;
      monthlyRent: number;
      depositAmount: number;
      fullName: string;
      primaryPhone: string | number;
      email?: string;
      isActive?: boolean | number | string;
    }
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property)
      throw new BadRequestException(`Property "${propertyId}" not found.`);

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<UploadRow>(sheet);

    if (!rows.length)
      throw new BadRequestException('The uploaded file is empty.');

    const requiredCols = [
      'houseCode',
      'monthlyRent',
      'depositAmount',
      'fullName',
      'primaryPhone',
    ];
    const missingCols = requiredCols.filter((col) => !(col in rows[0]));
    if (missingCols.length) {
      throw new BadRequestException(
        `Missing required columns: ${missingCols.join(', ')}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // --- PHASE 1: Upsert Houses ---
      const uniqueHouses = new Map<
        string,
        { monthlyRent: number; depositAmount: number }
      >();
      for (const row of rows) {
        const code = String(row.houseCode).trim();
        if (!uniqueHouses.has(code)) {
          uniqueHouses.set(code, {
            monthlyRent: Number(row.monthlyRent),
            depositAmount: Number(row.depositAmount),
          });
        }
      }

      const houseMap = new Map<string, string>();
      for (const [houseCode, details] of uniqueHouses.entries()) {
        const house = await tx.house.upsert({
          where: { propertyId_houseCode: { propertyId, houseCode } },
          update: {
            monthlyRent: details.monthlyRent,
            depositAmount: details.depositAmount,
          },
          create: {
            houseCode,
            propertyId,
            monthlyRent: details.monthlyRent,
            depositAmount: details.depositAmount,
          },
          select: { id: true, houseCode: true },
        });
        houseMap.set(house.houseCode, house.id);
      }

      // --- PHASE 2 & 3: Upsert Tenants + Leases ---
      let tenantsCreated = 0;
      let tenantsUpdated = 0;
      let leasesCreated = 0;

      for (const row of rows) {
        const houseId = houseMap.get(String(row.houseCode).trim())!;

        const existing = await tx.tenant.findUnique({
          where: { primaryPhone: String(row.primaryPhone).trim() },
          select: { id: true },
        });

        const tenant = await tx.tenant.upsert({
          where: { primaryPhone: String(row.primaryPhone).trim() },
          update: {
            fullName: String(row.fullName).trim(),
            email: row.email ? String(row.email).trim() : null,
            isActive:
              row.isActive === 'true' ||
              row.isActive === 1 ||
              row.isActive === true,
          },
          create: {
            fullName: String(row.fullName).trim(),
            primaryPhone: String(row.primaryPhone).trim(),
            email: row.email ? String(row.email).trim() : null,
            isActive:
              row.isActive === 'true' ||
              row.isActive === 1 ||
              row.isActive === true,
          },
        });

        if (existing) tenantsUpdated++;
        else tenantsCreated++;

        const existingLease = await tx.lease.findFirst({
          where: { tenantId: tenant.id, endDate: null },
        });

        if (existingLease && existingLease.houseId !== houseId) {
          await tx.lease.update({
            where: { id: existingLease.id },
            data: { endDate: new Date() },
          });
          await tx.lease.create({
            data: {
              tenantId: tenant.id,
              houseId,
              startDate: new Date(),
              createdById: 'Qwerty',
              pdfUrl: '',
            },
          });
          leasesCreated++;
        } else if (!existingLease) {
          await tx.lease.create({
            data: {
              tenantId: tenant.id,
              houseId,
              startDate: new Date(),
              createdById: 'Qwerty',
              pdfUrl: '',
            },
          });
          leasesCreated++;
        }
      }

      return {
        message: 'Upload processed successfully.',
        housesUpserted: uniqueHouses.size,
        tenantsCreated,
        tenantsUpdated,
        leasesCreated,
      };
    });
  }

  findAll() {
    return `This action returns all tenant`;
  }

  findOne(id: number) {
    return `This action returns a #${id} tenant`;
  }

  update(id: number, updateTenantDto: UpdateTenantDto) {
    return `This action updates a #${id} tenant`;
  }

  remove(id: number) {
    return `This action removes a #${id} tenant`;
  }
}
