import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateInvoiceDto, InvoiceType } from './dto/create-invoice.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Decimal } from '@prisma/client/runtime/index-browser';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { InvoiceStatus } from '@prisma/client';

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

    const amount = new Decimal(createInvoiceDto.amount);
    const penaltyAmount = new Decimal(createInvoiceDto.penaltyAmount ?? 0);
    const totalAmount = amount.plus(penaltyAmount);

    return this.prisma.invoice.create({
      data: {
        houseId: createInvoiceDto.houseId,
        leaseId: createInvoiceDto.leaseId,
        type: createInvoiceDto.type ?? InvoiceType.RENT,
        amount,
        penaltyAmount,
        totalAmount,
        balanceDue: totalAmount,
        carryOver: new Decimal(0),
        creditAmount: new Decimal(0),
        dueDate: new Date(createInvoiceDto.dueDate),
        periodStart: new Date(createInvoiceDto.periodStart),
        periodEnd: new Date(createInvoiceDto.periodEnd),
        notes: createInvoiceDto.notes ?? null,
        invoiceNumber: await this.generateInvoiceNumber(),
        createdById,
      },
    });
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

    // Check for excess/arrears from last invoice
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { houseId: dto.houseId },
      orderBy: { periodStart: 'desc' },
    });

    const carryOver = lastInvoice?.balanceDue ?? new Decimal(0);
    const creditAmount = lastInvoice?.excessAmount ?? new Decimal(0);
    const penaltyAmount = new Decimal(dto.penaltyAmount ?? 0);
    const amount = new Decimal(dto.amount);
    const totalAmount = amount
      .plus(penaltyAmount)
      .plus(carryOver)
      .minus(creditAmount);

    return this.prisma.invoice.create({
      data: {
        houseId: dto.houseId,
        leaseId: dto.leaseId,
        type: dto.type,
        amount,
        penaltyAmount,
        carryOver,
        creditAmount,
        totalAmount,
        balanceDue: totalAmount,
        dueDate: new Date(dto.dueDate),
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        invoiceNumber: await this.generateInvoiceNumber(),
        createdById,
      },
    });
  }

  private async generateInvoiceNumber(): Promise<string> {
    const count = await this.prisma.invoice.count();
    const year = new Date().getFullYear();
    return `INV-${year}-${String(count + 1).padStart(4, '0')}`; // INV-2026-0001
  }

  async findAll() {
    const invoices = await this.prisma.invoice.findMany({
      select: {
        id: true,
        invoiceNumber: true,
        type: true,
        status: true,
        amount: true,
        penaltyAmount: true,
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
      orderBy: { createdAt: 'desc' },
    });
    if (!invoices || invoices.length === 0)
      throw new NotFoundException('No invoices found.');
    return {
      data: invoices.map((inv) => ({
        ...inv,
        // house: `${inv.house.property.name} - ${inv.house.houseCode}`,
        // tenant: inv.lease.tenant.fullName,
      })),
    };
  }

  findOne(id: number) {
    return `This action returns a #${id} invoice`;
  }

  update(id: number, updateInvoiceDto: UpdateInvoiceDto) {
    return `This action updates a #${id} invoice`;
  }

  remove(id: string) {
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.CANCELLED },
    });
  }
}
