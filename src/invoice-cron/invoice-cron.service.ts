import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

@Injectable()
export class InvoiceCronService {
  private readonly logger = new Logger(InvoiceCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Runs every day at midnight ───────────────────────────────────────────
  @Cron('*/2 * * * *')
  async markOverdueInvoices() {
    this.logger.log('Running overdue invoice check...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.prisma.invoice.updateMany({
      where: {
        status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL] },
        dueDate: { lt: today },
      },
      data: {
        status: InvoiceStatus.OVERDUE,
      },
    });

    this.logger.log(`Marked ${result.count} invoices as OVERDUE.`);
  }

  // ─── Runs at midnight on 1st of every month ───────────────────────────────
  @Cron('* * * * *')
  async generateMonthlyInvoices() {
    this.logger.log('Running monthly invoice generation...');

    // Find all active leases across all properties
    const activeLeases = await this.prisma.lease.findMany({
      where: {
        endDate: null,
        // status: 'ACTIVE',
      },
      select: {
        id: true,
        tenantId: true,
        houseId: true,
        house: {
          select: {
            id: true,
            monthlyRent: true,
            propertyId: true,
          },
        },
        createdById: true,
      },
    });

    this.logger.log(`Found ${activeLeases.length} active leases.`);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 5); // due on 5th

    let generated = 0;
    let skipped = 0;

    for (const lease of activeLeases) {
      try {
        // Check if invoice already exists for this period
        const existing = await this.prisma.invoice.findFirst({
          where: {
            leaseId: lease.id,
            periodStart: { gte: periodStart },
            periodEnd: { lte: periodEnd },
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Check for previous PAID invoice excess credit
        const lastInvoice = await this.prisma.invoice.findFirst({
          where: {
            houseId: lease.houseId,
            status: InvoiceStatus.PAID,
          },
          orderBy: { periodStart: 'desc' },
          select: { id: true, excessAmount: true },
        });

        // Check for unreconciled OVERPAYMENT transactions
        const overpaymentTxs = await this.prisma.bankTransaction.findMany({
          where: {
            status: 'OVER_PAYMENT',
            payments: { some: { houseId: lease.houseId } },
          },
          select: { id: true, amount: true },
        });

        const overpaymentTotal = overpaymentTxs.reduce(
          (sum, tx) => sum.plus(new Decimal(tx.amount)),
          new Decimal(0),
        );

        const baseAmount = new Decimal(lease.house.monthlyRent);
        const penaltyAmount = new Decimal(0);
        const grossAmount = baseAmount.plus(penaltyAmount);

        const invoiceCredit =
          lastInvoice?.excessAmount &&
          new Decimal(lastInvoice.excessAmount).greaterThan(0)
            ? new Decimal(lastInvoice.excessAmount)
            : new Decimal(0);

        const creditAmount = invoiceCredit.plus(overpaymentTotal);
        const totalAmount = grossAmount.minus(creditAmount);
        const remainingCredit = creditAmount.greaterThan(grossAmount)
          ? creditAmount.minus(grossAmount)
          : new Decimal(0);
        const balanceDue = totalAmount.lessThan(0)
          ? new Decimal(0)
          : totalAmount;
        const paidAmount = balanceDue.equals(0) ? grossAmount : new Decimal(0);
        const status = balanceDue.equals(0)
          ? InvoiceStatus.PAID
          : InvoiceStatus.UNPAID;

        // Clear excess on previous invoice
        if (invoiceCredit.greaterThan(0) && lastInvoice) {
          await this.prisma.invoice.update({
            where: { id: lastInvoice.id },
            data: { excessAmount: new Decimal(0) },
          });
        }

        // Create invoice
        const invoice = await this.prisma.invoice.create({
          data: {
            invoiceNumber: await this.generateInvoiceNumber(),
            houseId: lease.houseId,
            leaseId: lease.id,
            type: 'RENT',
            status,
            amount: baseAmount,
            penaltyAmount,
            carryOver: new Decimal(0),
            creditAmount,
            excessAmount: remainingCredit,
            totalAmount: balanceDue.equals(0) ? grossAmount : totalAmount,
            paidAmount,
            balanceDue,
            dueDate,
            periodStart,
            periodEnd,
            createdById: lease.createdById,
          },
        });

        // Link overpayment transactions to this invoice
        for (const tx of overpaymentTxs) {
          await this.prisma.payment.updateMany({
            where: {
              bankTransactionId: tx.id,
              houseId: lease.houseId,
            },
            data: { invoiceId: invoice.id },
          });

          await this.prisma.bankTransaction.update({
            where: { id: tx.id },
            data: {
              status: 'MATCHED',
              matchNote: `Auto-matched to invoice ${invoice.invoiceNumber} on generation`,
            },
          });
        }

        generated++;
        this.logger.log(
          `Generated invoice ${invoice.invoiceNumber} for lease ${lease.id}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to generate invoice for lease ${lease.id}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Monthly invoice generation complete. Generated: ${generated}, Skipped: ${skipped}`,
    );
  }

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const latest = await this.prisma.invoice.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });
    if (!latest) return `INV-${year}-0001`;
    const lastNumber = parseInt(latest.invoiceNumber.split('-')[2], 10);
    return `INV-${year}-${String(lastNumber + 1).padStart(4, '0')}`;
  }
}
