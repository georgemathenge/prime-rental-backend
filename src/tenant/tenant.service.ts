import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AuditAction,
  HouseStatus,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { FindAllTenantsDto } from './dto/find-tenant.dto.js';
import { CreateKnownPayerDto } from './dto/create-known-players.dto.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(createTenantDto: CreateTenantDto, userId: string, ip?: string) {
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
          createdById: userId,
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
      await tx.house.update({
        where: { id: createTenantDto.houseId },
        data: { status: 'OCCUPIED' },
      });

      // After creating tenant
      await this.auditService.log({
        userId,
        action: AuditAction.TENANT_CREATED,
        entity: 'Tenant',
        entityId: tenant.id,
        summary: `Created tenant ${createTenantDto.fullName} and assigned to house ${lease.house.houseCode}`,
        meta: {
          tenantName: createTenantDto.fullName,
          phone: createTenantDto.primaryPhone,
        },
        ip,
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
              createdById: createdById,
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
              createdById: createdById,
              pdfUrl: '',
            },
          });

          await tx.house.update({
            where: { id: houseId },
            data: { status: 'OCCUPIED' },
          });
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

  async findAll(dto: FindAllTenantsDto) {
    const { status, propertyId, houseId, search, page = 1, limit = 20 } = dto;

    const skip = (page - 1) * limit;

    // Build the where clause
    const where: Prisma.TenantWhereInput = {};

    // Active / inactive filter
    if (status === 'active') where.isActive = true;
    else if (status === 'inactive') where.isActive = false;

    // Search by name or phone
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { primaryPhone: { contains: search } },
      ];
    }

    // Filter by property or house — both go through leases
    if (houseId || propertyId) {
      where.lease = {
        some: {
          endDate: null, // only look at active leases for this filter
          ...(houseId && { houseId }),
          ...(propertyId && { house: { propertyId } }),
        },
      };
    }

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          primaryPhone: true,
          email: true,
          isActive: true,
          createdAt: true,
          lease: {
            where: { endDate: null },
            select: {
              id: true,
              startDate: true,
              status: true,
              house: {
                select: {
                  houseCode: true,
                  monthlyRent: true,
                  depositAmount: true,
                  property: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data: tenants.map((tenant) => ({
        ...tenant,
        currentHouse: tenant.lease ?? null, // null if no active lease
        lease: undefined, // clean up the raw lease object from response
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
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        primaryPhone: true,
        email: true,
        isActive: true,
        createdAt: true,
        knownPayers: {
          select: {
            id: true,
            name: true,
            phone: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        lease: {
          orderBy: { startDate: 'desc' },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            status: true,
            house: {
              select: {
                id: true,
                houseCode: true,
                monthlyRent: true,
                depositAmount: true,
                property: {
                  select: { id: true, name: true },
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
              },
            },
          },
        },
      },
    });

    if (!tenant) throw new NotFoundException(`Tenant with ID ${id} not found.`);

    const activeLease = tenant.lease.find((l) => l.endDate === null);
    const leaseHistory = tenant.lease.filter((l) => l.endDate !== null);

    return {
      id: tenant.id,
      fullName: tenant.fullName,
      primaryPhone: tenant.primaryPhone,
      email: tenant.email,
      isActive: tenant.isActive,
      createdAt: tenant.createdAt,
      knownPayers: tenant.knownPayers,
      currentHouse: activeLease
        ? {
            leaseId: activeLease.id,
            since: activeLease.startDate,
            status: activeLease.status,
            house: activeLease.house,
            invoices: activeLease.invoices,
          }
        : null,
      leaseHistory: leaseHistory.map((l) => ({
        leaseId: l.id,
        from: l.startDate,
        to: l.endDate,
        status: l.status,
        house: l.house,
      })),
    };
  }

  async update(
    id: string,
    updateTenantDto: UpdateTenantDto,
    ip?: string,
    userId?: string,
  ) {
    const updatedTenant = await this.prisma.tenant.update({
      where: { id },
      data: updateTenantDto,
      select:{
        fullName:true
      }
    });

    // await this.auditService.log({
    //   userId,
    //   action: AuditAction.TENANT_CREATED,
    //   entity: 'Tenant',
    //   entityId: id,
    //   summary: `Updated tenant ${updatedTenant.fullName} with these details  ${...updateTenantDto}`,
    //   meta: {
    //     tenantName: createTenantDto.fullName,
    //     phone: createTenantDto.primaryPhone,
    //   },
    //   ip,
    // });

    if (!updatedTenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found.`);
    }
    return updatedTenant;
  }

  async deactivate(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async addKnownPayer(
    tenantId: string,
    dto: CreateKnownPayerDto,
    propertyId: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, primaryPhone: true },
    });

    if (!tenant) throw new NotFoundException('Tenant not found.');

    // Prevent adding their own number as a known payer
    if (dto.phone === tenant.primaryPhone) {
      throw new BadRequestException(
        'Tenant primary phone is already their default payer.',
      );
    }

    return this.prisma.knownPayer.create({
      data: {
        phone: dto.phone,
        name: dto.name ?? null,
        tenantId,
        propertyId: propertyId,
      },
    });
  }
  async getKnownPayers(tenantId: string) {
    const knownPayers = await this.prisma.knownPayer.findMany({
      where: { tenantId },
      select: { id: true, name: true, phone: true },
    });

    if (!knownPayers.length) {
      throw new NotFoundException('No known payers found for this tenant.');
    }

    return knownPayers;
  }
  async removeKnownPayer(id: string) {
    const knownPayer = await this.prisma.knownPayer.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!knownPayer) {
      throw new NotFoundException('Known payer not found.');
    }

    return this.prisma.knownPayer.delete({ where: { id } });
  }

  async terminate(leaseId: string) {
    return this.prisma.$transaction(async (tx) => {
      const lease = await tx.lease.findUnique({
        where: { id: leaseId },
        select: {
          id: true,
          houseId: true,
          tenantId: true,
          endDate: true,
          tenant: { select: { id: true, fullName: true } },
          house: { select: { id: true, houseCode: true } },
        },
      });

      if (!lease) throw new NotFoundException('Lease not found.');
      if (lease.endDate)
        throw new BadRequestException('Lease already terminated.');

      // ── Block if outstanding invoices exist ──────────────────────────
      const outstandingInvoices = await tx.invoice.findMany({
        where: {
          leaseId: lease.id,
          status: {
            in: [
              InvoiceStatus.UNPAID,
              InvoiceStatus.PARTIAL,
              InvoiceStatus.OVERDUE,
            ],
          },
        },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          balanceDue: true,
          dueDate: true,
        },
      });

      if (outstandingInvoices.length > 0) {
        const total = outstandingInvoices.reduce(
          (sum, inv) => sum + Number(inv.balanceDue),
          0,
        );
        throw new BadRequestException(
          `Cannot move out tenant. ${outstandingInvoices.length} unpaid invoice(s) totalling KES ${total.toLocaleString()} must be cleared first.`,
        );
      }

      // ── All clear — terminate ────────────────────────────────────────
      await tx.lease.update({
        where: { id: leaseId },
        data: { endDate: new Date(), status: 'TERMINATED' },
      });

      await tx.house.update({
        where: { id: lease.houseId },
        data: { status: HouseStatus.AVAILABLE },
      });

      await tx.tenant.update({
        where: { id: lease.tenantId },
        data: { isActive: false },
      });

      return {
        message: `${lease.tenant.fullName} has been successfully moved out of ${lease.house.houseCode}.`,
      };
    });
  }
}
