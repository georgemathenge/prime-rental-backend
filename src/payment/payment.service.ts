import { Injectable } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { UpdatePaymentDto } from './dto/update-payment.dto.js';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { FindAllPaymentsDto } from './dto/find-payment.dto.js';

@Injectable()
export class PaymentService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPaymentDto: CreatePaymentDto) {
    return 'This action adds a new payment';
  }

  // payments.service.ts
  async findAll(dto: FindAllPaymentsDto) {
    const { page = 1, limit = 20, houseId } = dto;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};
    if (houseId) where.houseId = houseId;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
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
          invoice: {
            select: {
              invoiceNumber: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments,
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
    return `This action returns a #${id} payment`;
  }

  update(id: number, updatePaymentDto: UpdatePaymentDto) {
    return `This action updates a #${id} payment`;
  }

  remove(id: number) {
    return `This action removes a #${id} payment`;
  }
}
