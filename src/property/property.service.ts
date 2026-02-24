import { Injectable, NotFoundException, Search } from '@nestjs/common';
import { CreatePropertyDto } from './dto/create-property.dto.js';
import { UpdatePropertyDto } from './dto/update-property.dto.js';
import { PrismaService } from 'src/prisma/prisma.service.js';
import { FindPropertyDto } from './dto/find-property.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class PropertyService {
  constructor(private prisma: PrismaService) {}
  async create(createPropertyDto: CreatePropertyDto, userId: string) {
    const existingProperty = await this.prisma.property.findUnique({
      where: { name: createPropertyDto.name },
    });
    if (!existingProperty) {
      throw new NotFoundException('Property with this name already exists.');
    }
    const property = this.prisma.property.create({
      data: {
        ...createPropertyDto,
        createdById: userId,
      },
    });
    return property;
  }

  async findAll(dto: FindPropertyDto) {
    const { search, page = 1, limit = 20 } = dto;

    const skip = (page - 1) * limit;

    // Build the where clause
    const where: Prisma.PropertyWhereInput = {};

    // Search by name or phone
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          bankAccount: true,
          createdAt: true,
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      data: properties.map((property) => ({
        ...property,
        housesCount: this.prisma.house.count({
          where: { propertyId: property.id },
        }),
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
    const property = await this.prisma.property.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        bankAccount: true,
        createdAt: true,
      },
    });
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found.`);
    }
    return property;
  }

  async update(id: string, updatePropertyDto: UpdatePropertyDto) {
    const updatedProperty = await this.prisma.property.update({
      where: { id },
      data: updatePropertyDto,
    });

    if (!updatedProperty) {
      throw new NotFoundException(`Property with ID ${id} not found.`);
    }
    return updatedProperty;
  }

  remove(id: number) {
    return `This action removes a #${id} property`;
  }
}
