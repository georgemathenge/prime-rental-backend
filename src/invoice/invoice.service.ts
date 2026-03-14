import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateInvoiceDto, InvoiceType } from './dto/create-invoice.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Decimal } from '@prisma/client/runtime/index-browser';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { InvoiceStatus, MatchStatus, Prisma } from '@prisma/client';
import { FindAllInvoicesDto } from './dto/find-all-invoices.dto.js';

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}
  async create(createInvoiceDto: CreateInvoiceDto, createdById: string) {
    const house = await this.prisma.house.findUnique({
      where: { id: createInvoiceDto.houseId },
      select: { id: true },
    });
    if (!house) throw new NotFoundException('House not found.');

    const lease = await this.prisma.lease.findUnique({
      where: { id: createInvoiceDto.leaseId },
      select: { id: true },
    });
    if (!lease) throw new NotFoundException('Lease not found.');

    // Check for previous PAID invoice with excess credit
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        houseId: createInvoiceDto.houseId,
        status: InvoiceStatus.PAID,
      },
      orderBy: { periodStart: 'desc' },
      select: { id: true, excessAmount: true },
    });

    // Check for unreconciled OVERPAYMENT transactions for this house
    const overpaymentTxs = await this.prisma.bankTransaction.findMany({
      where: {
        status: MatchStatus.OVER_PAYMENT,
        payments: { some: { houseId: createInvoiceDto.houseId } },
      },
      select: { id: true, amount: true },
    });

    const overpaymentTotal = overpaymentTxs.reduce(
      (sum, tx) => sum.plus(new Decimal(tx.amount)),
      new Decimal(0),
    );

    console.log(createInvoiceDto.houseId);

    const baseAmount = new Decimal(createInvoiceDto.amount);
    const penaltyAmount = new Decimal(createInvoiceDto.penaltyAmount ?? 0);
    const grossAmount = baseAmount.plus(penaltyAmount);

    // Credit from previous invoice excess
    const invoiceCredit =
      lastInvoice?.excessAmount &&
      new Decimal(lastInvoice.excessAmount).greaterThan(0)
        ? new Decimal(lastInvoice.excessAmount)
        : new Decimal(0);

    // Total credit = invoice excess + unreconciled overpayments
    const creditAmount = invoiceCredit.plus(overpaymentTotal);

    const totalAmount = grossAmount.minus(creditAmount);
    const remainingCredit = creditAmount.greaterThan(grossAmount)
      ? creditAmount.minus(grossAmount)
      : new Decimal(0);
    const balanceDue = totalAmount.lessThan(0) ? new Decimal(0) : totalAmount;
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
        houseId: createInvoiceDto.houseId,
        leaseId: createInvoiceDto.leaseId,
        type: createInvoiceDto.type ?? InvoiceType.RENT,
        status,
        amount: baseAmount,
        penaltyAmount,
        carryOver: new Decimal(0),
        creditAmount,
        excessAmount: remainingCredit,
        totalAmount: balanceDue.equals(0) ? grossAmount : totalAmount,
        paidAmount,
        balanceDue,
        dueDate: new Date(createInvoiceDto.dueDate),
        periodStart: new Date(createInvoiceDto.periodStart),
        periodEnd: new Date(createInvoiceDto.periodEnd),
        notes: createInvoiceDto.notes ?? null,
        createdById,
      },
    });

    // Link overpayment transactions to this invoice and mark as MATCHED
    for (const tx of overpaymentTxs) {
      await this.prisma.payment.updateMany({
        where: {
          bankTransactionId: tx.id,
          houseId: createInvoiceDto.houseId,
        },
        data: { invoiceId: invoice.id },
      });

      await this.prisma.bankTransaction.update({
        where: { id: tx.id },
        data: {
          status: MatchStatus.MATCHED,
          matchNote: `Matched to invoice ${invoice.invoiceNumber} on creation`,
        },
      });
    }

    return invoice;
  }

  async autoGenerateInvoices(dto: CreateInvoiceDto, createdById: string) {
    const house = await this.prisma.house.findUnique({
      where: { id: dto.houseId },
      select: { id: true, monthlyRent: true },
    });
    if (!house) throw new NotFoundException('House not found.');

    const lease = await this.prisma.lease.findUnique({
      where: { id: dto.leaseId },
      select: { id: true },
    });
    if (!lease) throw new NotFoundException('Lease not found.');

    // Check for previous PAID invoice with excess credit
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        houseId: dto.houseId,
        status: InvoiceStatus.PAID,
      },
      orderBy: { periodStart: 'desc' },
      select: { id: true, excessAmount: true },
    });

    // Check for unreconciled OVERPAYMENT transactions for this house
    const overpaymentTxs = await this.prisma.bankTransaction.findMany({
      where: {
        status: MatchStatus.OVER_PAYMENT,
        payments: { some: { houseId: dto.houseId } },
      },
      select: { id: true, amount: true },
    });

    const overpaymentTotal = overpaymentTxs.reduce(
      (sum, tx) => sum.plus(new Decimal(tx.amount)),
      new Decimal(0),
    );

    const baseAmount = new Decimal(dto.amount);
    const penaltyAmount = new Decimal(dto.penaltyAmount ?? 0);
    const grossAmount = baseAmount.plus(penaltyAmount);

    // Credit from previous invoice excess
    const invoiceCredit =
      lastInvoice?.excessAmount &&
      new Decimal(lastInvoice.excessAmount).greaterThan(0)
        ? new Decimal(lastInvoice.excessAmount)
        : new Decimal(0);

    // Total credit = invoice excess + unreconciled overpayments
    const creditAmount = invoiceCredit.plus(overpaymentTotal);

    const totalAmount = grossAmount.minus(creditAmount);
    const remainingCredit = creditAmount.greaterThan(grossAmount)
      ? creditAmount.minus(grossAmount)
      : new Decimal(0);
    const balanceDue = totalAmount.lessThan(0) ? new Decimal(0) : totalAmount;
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
        houseId: dto.houseId,
        leaseId: dto.leaseId,
        type: dto.type ?? InvoiceType.RENT,
        status,
        amount: baseAmount,
        penaltyAmount,
        carryOver: new Decimal(0),
        creditAmount,
        excessAmount: remainingCredit,
        totalAmount: balanceDue.equals(0) ? grossAmount : totalAmount,
        paidAmount,
        balanceDue,
        dueDate: new Date(dto.dueDate),
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        notes: dto.notes ?? null,
        createdById,
      },
    });

    // Link overpayment transactions to this invoice and mark as MATCHED
    for (const tx of overpaymentTxs) {
      await this.prisma.payment.updateMany({
        where: {
          bankTransactionId: tx.id,
          houseId: dto.houseId,
        },
        data: { invoiceId: invoice.id },
      });

      await this.prisma.bankTransaction.update({
        where: { id: tx.id },
        data: {
          status: MatchStatus.MATCHED,
          matchNote: `Matched to invoice ${invoice.invoiceNumber} on creation`,
        },
      });
    }

    return invoice;
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

  async findAll(dto: FindAllInvoicesDto) {
    const { propertyId, search, status, type, page = 1, limit = 20 } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    // Scope to property via house relation
    if (propertyId) {
      where.house = { propertyId };
    }

    if (status) where.status = status;
    if (type) where.type = type;

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

  findOne(id: number) {
    return `This action returns a #${id} invoice`;
  }
  async update(id: string, updateInvoiceDto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        amount: true,
        dueDate: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found.`);
    }

    if (invoice.status === 'PAID') {
      throw new BadRequestException('Cannot update a paid invoice.');
    }

    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('Cannot update a cancelled invoice.');
    }

    // If due date is being extended to future, revert OVERDUE back to UNPAID
    let status = invoice.status;
    if (updateInvoiceDto.dueDate) {
      const newDueDate = new Date(updateInvoiceDto.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (invoice.status === InvoiceStatus.OVERDUE && newDueDate > today) {
        status = InvoiceStatus.UNPAID;
      }
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        ...(updateInvoiceDto.amount && { amount: updateInvoiceDto.amount }),
        ...(updateInvoiceDto.dueDate && {
          dueDate: new Date(updateInvoiceDto.dueDate),
        }),
        status,
      },
    });
  }

  remove(id: string) {
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
    });
  }
}
