import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AuthGuard } from '../../../auth/auth.guard';
import type { StoredUploadedFile } from '../../../attachments/uploaded-file.interface';
import { TransportationRailwaySystemService } from '../services/railway-system.service';
import {
  RailwaySystemCreateDto,
  RailwaySystemListQueryDto,
  RailwaySystemUpdateDto,
} from '../../dto/railway-system.dto';

const multer = require('multer');

@ApiTags('交通系统 - 铁路线路系统')
@Controller('transportation/railway/systems')
export class TransportationRailwaySystemController {
  constructor(
    private readonly railwaySystemService: TransportationRailwaySystemService,
  ) {}

  private requireUserId(req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('User session has expired');
    }
    return userId;
  }

  @Get()
  @ApiOperation({ summary: '线路系统列表' })
  async list(@Query() query: RailwaySystemListQueryDto) {
    return this.railwaySystemService.listSystems(query);
  }

  @Get('servers')
  @ApiOperation({ summary: '获取启用 Beacon 的服务器列表' })
  async listServers() {
    return this.railwaySystemService.listBeaconServers();
  }

  @Get(':id')
  @ApiOperation({ summary: '线路系统详情' })
  async detail(@Param('id') id: string) {
    return this.railwaySystemService.getSystemDetail(id);
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建线路系统' })
  async create(@Req() req: Request, @Body() body: RailwaySystemCreateDto) {
    const userId = this.requireUserId(req);
    return this.railwaySystemService.createSystem(userId, body);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新线路系统' })
  async update(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: RailwaySystemUpdateDto,
  ) {
    const userId = this.requireUserId(req);
    return this.railwaySystemService.updateSystem(userId, id, body);
  }

  @Patch(':id/logo')
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传线路系统 Logo' })
  async uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: StoredUploadedFile,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.railwaySystemService.updateSystemLogo(userId, id, file);
  }
}
