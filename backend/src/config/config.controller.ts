import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ConfigService } from './config.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../auth/services/roles.service';
import { CreateNamespaceDto } from './dto/create-namespace.dto';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import { CreateConfigEntryDto } from './dto/create-config-entry.dto';
import { UpdateConfigEntryDto } from './dto/update-config-entry.dto';
import { QueryNamespacesDto } from './dto/query-namespaces.dto';

@ApiTags('配置管理')
@ApiBearerAuth()
@Controller('config')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_CONFIG)
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('namespaces')
  @ApiOperation({ summary: '列出配置命名空间' })
  async listNamespaces(@Query() query: QueryNamespacesDto) {
    return this.configService.listNamespaces(query);
  }

  @Post('namespaces')
  @ApiOperation({ summary: '创建配置命名空间' })
  async createNamespace(@Body() dto: CreateNamespaceDto) {
    return this.configService.createNamespace(dto);
  }

  @Patch('namespaces/:namespaceId')
  @ApiOperation({ summary: '更新配置命名空间' })
  async updateNamespace(
    @Param('namespaceId') namespaceId: string,
    @Body() dto: UpdateNamespaceDto,
  ) {
    return this.configService.updateNamespace(namespaceId, dto);
  }

  @Delete('namespaces/:namespaceId')
  @ApiOperation({ summary: '删除配置命名空间' })
  async deleteNamespace(@Param('namespaceId') namespaceId: string) {
    await this.configService.removeNamespace(namespaceId);
    return { success: true };
  }

  @Get('namespaces/:namespaceId/entries')
  @ApiOperation({ summary: '列出命名空间下的配置项' })
  async listEntries(@Param('namespaceId') namespaceId: string) {
    return this.configService.listEntries(namespaceId);
  }

  @Post('namespaces/:namespaceId/entries')
  @ApiOperation({ summary: '创建配置项' })
  async createEntry(
    @Param('namespaceId') namespaceId: string,
    @Body() dto: CreateConfigEntryDto,
    @Req() req: Request,
  ) {
    return this.configService.createEntry(namespaceId, dto, req.user!.id);
  }

  @Patch('entries/:entryId')
  @ApiOperation({ summary: '更新配置项' })
  async updateEntry(
    @Param('entryId') entryId: string,
    @Body() dto: UpdateConfigEntryDto,
    @Req() req: Request,
  ) {
    return this.configService.updateEntry(entryId, dto, req.user!.id);
  }

  @Delete('entries/:entryId')
  @ApiOperation({ summary: '删除配置项' })
  async deleteEntry(@Param('entryId') entryId: string) {
    await this.configService.removeEntry(entryId);
    return { success: true };
  }
}
