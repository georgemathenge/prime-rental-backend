// reports.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  async getDashboard() {
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
      this.prisma.house.count(),

      // Occupied houses
      this.prisma.house.count({
        where: {
          lease: { some: { endDate: null } },
        },
      }),

      // Active tenants
      this.prisma.tenant.count({
        where: { isActive: true },
      }),

      // Invoice status breakdown + outstanding balance
      this.prisma.invoice.groupBy({
        by: ['status'],
        _count: { id: true },
        _sum: { balanceDue: true, totalAmount: true },
      }),

      // Monthly expected rent (invoices) — last 12 months
      this.prisma.invoice.findMany({
        where: {
          createdAt: { gte: twelveMonthsAgo },
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
}
