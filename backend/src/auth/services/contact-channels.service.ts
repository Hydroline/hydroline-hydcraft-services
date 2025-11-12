import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactChannelDto } from '../dto/create-contact-channel.dto';
import { UpdateContactChannelDto } from '../dto/update-contact-channel.dto';

@Injectable()
export class ContactChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async listChannels() {
    return this.prisma.contactChannel.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async createChannel(dto: CreateContactChannelDto) {
    const exists = await this.prisma.contactChannel.findUnique({
      where: { key: dto.key },
    });
    if (exists) {
      throw new BadRequestException('Channel key already exists');
    }

    return this.prisma.contactChannel.create({
      data: {
        key: dto.key,
        displayName: dto.displayName,
        description: dto.description,
        validationRegex: dto.validationRegex,
        isRequired: dto.isRequired ?? false,
        allowMultiple: dto.allowMultiple ?? true,
        isVerifiable: dto.isVerifiable ?? false,
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async updateChannel(channelId: string, dto: UpdateContactChannelDto) {
    const channel = await this.prisma.contactChannel.findUnique({
      where: { id: channelId },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return this.prisma.contactChannel.update({
      where: { id: channelId },
      data: {
        displayName: dto.displayName ?? channel.displayName,
        description: dto.description ?? channel.description,
        validationRegex: dto.validationRegex ?? channel.validationRegex,
        isRequired: dto.isRequired ?? channel.isRequired,
        allowMultiple: dto.allowMultiple ?? channel.allowMultiple,
        isVerifiable: dto.isVerifiable ?? channel.isVerifiable,
        metadata:
          dto.metadata !== undefined
            ? this.toJson(dto.metadata)
            : channel.metadata,
      },
    });
  }

  async deleteChannel(channelId: string) {
    const channel = await this.prisma.contactChannel.findUnique({
      where: { id: channelId },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const contactCount = await this.prisma.userContact.count({
      where: { channelId },
    });
    if (contactCount > 0) {
      throw new BadRequestException('Channel is in use and cannot be deleted');
    }

    await this.prisma.contactChannel.delete({ where: { id: channelId } });
  }

  private toJson(input?: Record<string, unknown>) {
    return input as Prisma.InputJsonValue | undefined;
  }
}
