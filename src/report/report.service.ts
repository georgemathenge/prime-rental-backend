// reports.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { FindAllInvoicesDto } from 'src/invoice/dto/find-all-invoices.dto.js';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(propertyId: string) {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      totalProperties,
      totalHouses,
      occupiedHouses,
      activeTenants,
      invoiceStats,
      monthlyInvoices,
      monthlyPayments,
      recentInvoices,
      recentPayments,
    ] = await Promise.all([
      // Total properties
      this.prisma.property.count(),

      // Total houses
      this.prisma.house.count({
        where: {
          propertyId: propertyId,
        },
      }),

      // Occupied houses
      this.prisma.house.count({
        where: {
          lease: { some: { endDate: null } },
          propertyId: propertyId,
        },
      }),

      // Active tenants
      this.prisma.tenant.count({
        where: {
          isActive: true,
          lease: {
            some: {
              house: {
                propertyId: propertyId,
              },
            },
          },
        },
      }),

      // Invoice status breakdown + outstanding balance
      this.prisma.invoice.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { balanceDue: true, totalAmount: true },
        where: {
          house: {
            propertyId: propertyId,
          },
        },
      }),

      // Monthly expected rent (invoices) — last 12 months
      this.prisma.invoice.findMany({
        where: {
          createdAt: { gte: twelveMonthsAgo },
          house: {
            propertyId: propertyId,
          },
        },
        select: {
          createdAt: true,
          totalAmount: true,
          paidAmount: true,
        },
      }),

      // Monthly payments received — last 12 months
      this.prisma.payment.findMany({
        where: {
          datePaid: { gte: twelveMonthsAgo },
          house: {
            propertyId: propertyId,
          },
        },
        select: {
          datePaid: true,
          amount: true,
        },
      }),

      // Recent invoices
      this.prisma.invoice.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        where: {
          house: {
            propertyId: propertyId,
          },
        },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          balanceDue: true,
          dueDate: true,
          house: {
            select: {
              houseCode: true,
              property: { select: { name: true } },
            },
          },
          lease: {
            select: {
              tenant: {
                select: { fullName: true },
              },
            },
          },
        },
      }),

      // Recent payments
      this.prisma.payment.findMany({
        take: 5,
        orderBy: { datePaid: 'desc' },
        where: {
          house: {
            propertyId: propertyId,
          },
        },
        select: {
          id: true,
          amount: true,
          datePaid: true,
          type: true,
          note: true,
          house: {
            select: {
              houseCode: true,
              property: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    // Build 12 month labels
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
      };
    });

    // Aggregate monthly expected vs collected from invoices
    const monthlyExpected: Record<string, number> = {};
    const monthlyCollected: Record<string, number> = {};

    months.forEach(({ key }) => {
      monthlyExpected[key] = 0;
      monthlyCollected[key] = 0;
    });

    monthlyInvoices.forEach((inv) => {
      const key = `${inv.createdAt.getFullYear()}-${String(inv.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyExpected[key] !== undefined) {
        monthlyExpected[key] += Number(inv.totalAmount);
        monthlyCollected[key] += Number(inv.paidAmount);
      }
    });

    // Invoice status breakdown
    const statusBreakdown = {
      PAID: 0,
      UNPAID: 0,
      PARTIAL: 0,
      OVERDUE: 0,
    };
    let totalOutstanding = 0;
    let totalExpected = 0;

    invoiceStats.forEach((s) => {
      statusBreakdown[s.status as keyof typeof statusBreakdown] = s._count.id;
      totalOutstanding += Number(s._sum.balanceDue ?? 0);
      totalExpected += Number(s._sum.totalAmount ?? 0);
    });

    return {
      stats: {
        totalProperties,
        totalHouses,
        occupiedHouses,
        vacantHouses: totalHouses - occupiedHouses,
        activeTenants,
        totalOutstanding,
        overdueCount: statusBreakdown.OVERDUE,
      },
      chart: {
        labels: months.map((m) => m.label),
        expected: months.map((m) => monthlyExpected[m.key]),
        collected: months.map((m) => monthlyCollected[m.key]),
      },
      invoiceBreakdown: statusBreakdown,
      recentInvoices,
      recentPayments,
    };
  }

  async getOverDueInvoices(dto: FindAllInvoicesDto) {
    const {
      propertyId,
      search,
      status,
      type,
      page = 1,
      limit = 20,
      overdue,
    } = dto;
    const skip = (page - 1) * limit;
    const currentDate = new Date();
    const showOverdue = dto.overdue !== undefined ? dto.overdue : true;

    const where: Prisma.InvoiceWhereInput = {};

    // Scope to property via house relation

    if (propertyId) {
      where.house = { propertyId };
    }

    if (type) where.type = type;

    // Handle overdue filter
    // Cast to string for comparison
    if (showOverdue) {
      where.dueDate = {
        lt: currentDate, // Less than current date (past due)
      };
      where.balanceDue = {
        gt: 0, // Only unpaid invoices
      };
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { house: { houseCode: { contains: search, mode: 'insensitive' } } },
        {
          lease: {
            tenant: { fullName: { contains: search, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          invoiceNumber: true,
          type: true,
          status: true,
          amount: true,
          penaltyAmount: true,
          carryOver: true,
          creditAmount: true,
          excessAmount: true,
          totalAmount: true,
          paidAmount: true,
          balanceDue: true,
          dueDate: true,
          periodStart: true,
          periodEnd: true,
          notes: true,
          createdAt: true,
          house: {
            select: {
              houseCode: true,
              property: { select: { name: true } },
            },
          },
          lease: {
            select: {
              tenant: {
                select: { fullName: true, primaryPhone: true },
              },
            },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
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

  async generateRentCollectionReport(
    propertyId: string,
    year: number,
  ): Promise<Buffer> {
    console.log(propertyId);
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, name: true },
    });

    if (!property) throw new NotFoundException('Property not found.');

    const houses = await this.prisma.house.findMany({
      where: { propertyId },
      orderBy: { houseCode: 'asc' },
      select: {
        id: true,
        houseCode: true,
        monthlyRent: true,
        lease: {
          where: { status: { not: 'TERMINATED' } },
          orderBy: { startDate: 'desc' },
          take: 1,
          select: {
            tenant: {
              select: { fullName: true, primaryPhone: true },
            },
          },
        },
        payments: {
          where: {
            datePaid: {
              gte: new Date(year, 0, 1),
              lt: new Date(year + 1, 0, 1),
            },
          },
          select: { amount: true, datePaid: true },
        },
      },
    });

    // Build monthly breakdown per house
    const houseData = houses.map((house) => {
      const tenant = house.lease[0]?.tenant;
      const monthly: Record<string, number> = {};

      house.payments.forEach((p) => {
        const month = new Date(p.datePaid).getMonth();
        monthly[String(month)] =
          (monthly[String(month)] ?? 0) + Number(p.amount);
      });

      return {
        houseCode: house.houseCode,
        monthlyRent: Number(house.monthlyRent),
        tenantName: tenant?.fullName ?? 'VACANT',
        phone: tenant?.primaryPhone ?? '',
        monthly,
      };
    });

    const payload = {
      propertyName: property.name,
      year,
      houses: houseData,
    };

    return this.runPythonReportGenerator(payload);
  }

  private runPythonReportGenerator(data: object): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.resolve(
        process.env.PYTHON_SCRIPTS_PATH ?? '../bank-python-parsers',
        'report_generator.py',
      );

      if (!fs.existsSync(scriptPath)) {
        reject(new Error(`Report script not found at ${scriptPath}`));
        return;
      }

      const python = spawn(process.env.PYTHON_PATH ?? 'python3', [scriptPath]);

      const chunks: Buffer[] = [];
      const errorChunks: Buffer[] = [];

      python.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      python.stderr.on('data', (chunk: Buffer) => errorChunks.push(chunk));

      python.on('close', (code) => {
        if (code !== 0) {
          const error = Buffer.concat(errorChunks).toString();
          reject(new Error(`Report generator failed: ${error}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });

      // Send data to Python via stdin
      python.stdin.write(JSON.stringify(data));
      python.stdin.end();
    });
  }
}
