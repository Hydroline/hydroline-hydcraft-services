import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './permissions.decorator';
import { DEFAULT_PERMISSIONS } from './roles.service';
import { ContactChannelsService } from './contact-channels.service';
import { CreateContactChannelDto } from './dto/create-contact-channel.dto';
import { UpdateContactChannelDto } from './dto/update-contact-channel.dto';

@Controller('auth/contact-channels')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_CONTACT_CHANNELS)
export class ContactChannelsController {
  constructor(private readonly contactChannelsService: ContactChannelsService) {}

  @Get()
  async list() {
    return this.contactChannelsService.listChannels();
  }

  @Post()
  async create(@Body() dto: CreateContactChannelDto) {
    return this.contactChannelsService.createChannel(dto);
  }

  @Patch(':channelId')
  async update(
    @Param('channelId') channelId: string,
    @Body() dto: UpdateContactChannelDto,
  ) {
    return this.contactChannelsService.updateChannel(channelId, dto);
  }

  @Delete(':channelId')
  async remove(@Param('channelId') channelId: string) {
    await this.contactChannelsService.deleteChannel(channelId);
    return { success: true };
  }
}
