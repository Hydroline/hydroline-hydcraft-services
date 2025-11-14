import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryNamespacesDto } from './dto/query-namespaces.dto';

@Injectable()
export class ConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async listNamespaces(query?: QueryNamespacesDto) {
    const page = query?.page && query.page > 0 ? query.page : 1;
    const sizeInput = query?.pageSize && query.pageSize > 0 ? query.pageSize : 10;
    const pageSize = Math.min(sizeInput, 50);
    const skip = (page - 1) * pageSize;

    const [total, namespaces] = await this.prisma.$transaction([
      this.prisma.configNamespace.count(),
      this.prisma.configNamespace.findMany({
        orderBy: { key: 'asc' },
        skip,
        take: pageSize,
        include: {
          _count: {
            select: { entries: true },
          },
        },
      }),
    ]);

    return {
      items: namespaces,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  async createNamespace(data: {
    key: string;
    name: string;
    description?: string;
  }) {
    const exists = await this.prisma.configNamespace.findUnique({
      where: { key: data.key },
    });
    if (exists) {
      throw new BadRequestException('Namespace key already exists');
    }
    return this.prisma.configNamespace.create({
      data: {
        key: data.key,
        name: data.name,
        description: data.description,
      },
    });
  }

  async updateNamespace(
    namespaceId: string,
    data: { name?: string; description?: string },
  ) {
    const namespace = await this.prisma.configNamespace.findUnique({
      where: { id: namespaceId },
    });
    if (!namespace) {
      throw new NotFoundException('Namespace not found');
    }
    return this.prisma.configNamespace.update({
      where: { id: namespaceId },
      data: {
        name: data.name ?? namespace.name,
        description: data.description ?? namespace.description,
      },
    });
  }

  async removeNamespace(namespaceId: string) {
    const namespace = await this.prisma.configNamespace.findUnique({
      where: { id: namespaceId },
      include: { _count: { select: { entries: true } } },
    });
    if (!namespace) {
      throw new NotFoundException('Namespace not found');
    }
    if (namespace._count.entries > 0) {
      throw new BadRequestException('Namespace is not empty');
    }
    await this.prisma.configNamespace.delete({ where: { id: namespaceId } });
  }

  async listEntries(namespaceId: string) {
    await this.ensureNamespaceById(namespaceId);
    return this.prisma.configEntry.findMany({
      where: { namespaceId },
      orderBy: { key: 'asc' },
    });
  }

  async createEntry(
    namespaceId: string,
    data: { key: string; value: unknown; description?: string },
    userId?: string,
  ) {
    await this.ensureNamespaceById(namespaceId);
    try {
      const normalized = this.normalizeValue(data.value);
      return await this.prisma.configEntry.create({
        data: {
          namespaceId,
          key: data.key,
          value: normalized,
          description: data.description,
          updatedById: userId ?? null,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Entry key already exists in namespace');
      }
      throw error;
    }
  }

  async updateEntry(
    entryId: string,
    data: { value?: unknown; description?: string },
    userId?: string,
  ) {
    const entry = await this.prisma.configEntry.findUnique({
      where: { id: entryId },
    });
    if (!entry) {
      throw new NotFoundException('Entry not found');
    }
    const normalized =
      data.value !== undefined
        ? this.normalizeValue(data.value)
        : this.normalizeValue(entry.value);

    return this.prisma.configEntry.update({
      where: { id: entryId },
      data: {
        value: normalized,
        description: data.description ?? entry.description,
        version: entry.version + 1,
        updatedById: userId ?? null,
      },
    });
  }

  async removeEntry(entryId: string) {
    const entry = await this.prisma.configEntry.findUnique({
      where: { id: entryId },
    });
    if (!entry) {
      throw new NotFoundException('Entry not found');
    }
    await this.prisma.configEntry.delete({ where: { id: entryId } });
  }

  async getEntry(namespaceKey: string, entryKey: string) {
    const namespace = await this.prisma.configNamespace.findUnique({
      where: { key: namespaceKey },
    });
    if (!namespace) {
      return null;
    }
    return this.prisma.configEntry.findUnique({
      where: {
        namespaceId_key: {
          namespaceId: namespace.id,
          key: entryKey,
        },
      },
    });
  }

  async getEntriesByNamespaceKey(namespaceKey: string) {
    const namespace = await this.prisma.configNamespace.findUnique({
      where: { key: namespaceKey },
    });
    if (!namespace) {
      return [];
    }
    return this.prisma.configEntry.findMany({
      where: { namespaceId: namespace.id },
      orderBy: { key: 'asc' },
    });
  }

  async ensureNamespaceByKey(
    key: string,
    data: { name: string; description?: string },
  ) {
    const namespace = await this.prisma.configNamespace.findUnique({
      where: { key },
    });
    if (namespace) {
      return namespace;
    }
    return this.prisma.configNamespace.create({
      data: {
        key,
        name: data.name,
        description: data.description,
      },
    });
  }

  private async ensureNamespaceById(namespaceId: string) {
    const namespace = await this.prisma.configNamespace.findUnique({
      where: { id: namespaceId },
    });
    if (!namespace) {
      throw new NotFoundException('Namespace not found');
    }
    return namespace;
  }

  private normalizeValue(value: unknown): Prisma.InputJsonValue {
    if (value === null || value === undefined) {
      return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
    }
    return value as Prisma.InputJsonValue;
  }
}
