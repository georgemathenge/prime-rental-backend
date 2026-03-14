import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditAction } from '@prisma/client';

interface LogParams {
  userId: string;
  action: AuditAction;
  entity: string;
  entityId?: string;
  summary: string;
  meta?: object;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogParams) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId ?? null,
          summary: params.summary,
          meta: params.meta ?? [],
          ip: params.ip ?? null,
        },
      });
    } catch (err) {
      // Never let audit logging break the main flow
      console.error('Audit log failed:', err);
    }
  }

  async findAll(params: {
    propertyId?: string;
    userId?: string;
    action?: AuditAction;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to);
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          summary: true,
          meta: true,
          ip: true,
          createdAt: true,
          user: {
            select: { id: true, email: true, role: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
