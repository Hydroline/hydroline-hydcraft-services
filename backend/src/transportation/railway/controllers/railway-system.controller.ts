import {
  BadRequestException,
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
import { AuthGuard } from '../../../auth/auth.guard';
import { OptionalAuthGuard } from '../../../auth/optional-auth.guard';
import { TransportationRailwaySystemService } from '../services/railway-system.service';
import {
  RailwaySystemCreateDto,
  RailwaySystemListQueryDto,
  RailwaySystemUpdateDto,
} from '../../dto/railway-system.dto';
import { parseSingleFileMultipart } from '../../../lib/multipart/parse-single-file-multipart';

@ApiTags('交通系统 - 铁路线路系统')
@Controller('transportation/railway/systems')
export class TransportationRailwaySystemController {
  constructor(
    private readonly railwaySystemService: TransportationRailwaySystemService,
  ) {}

  private requireUser(req: Request) {
    const user = req.user;
    if (!user) {
      throw new BadRequestException('User session has expired');
    }
    return user;
  }

  @Get()
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '线路系统列表' })
  async list(@Req() req: Request, @Query() query: RailwaySystemListQueryDto) {
    return this.railwaySystemService.listSystems(query, req.user);
  }

  @Get('servers')
  @ApiOperation({ summary: '获取启用 Beacon 的服务器列表' })
  async listServers() {
    return this.railwaySystemService.listBeaconServers();
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '线路系统详情' })
  async detail(@Param('id') id: string, @Req() req: Request) {
    return this.railwaySystemService.getSystemDetail(id, req.user);
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建线路系统' })
  async create(@Req() req: Request, @Body() body: RailwaySystemCreateDto) {
    const user = this.requireUser(req);
    return this.railwaySystemService.createSystem(user, body);
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
    const user = this.requireUser(req);
    return this.railwaySystemService.updateSystem(user, id, body);
  }

  @Patch(':id/logo')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传线路系统 Logo' })
  async uploadLogo(@Param('id') id: string, @Req() req: Request) {
    const user = this.requireUser(req);
    const { file } = await parseSingleFileMultipart(req, {
      fileFieldName: 'logo',
      maxFileSizeBytes: 10 * 1024 * 1024,
    });
    return this.railwaySystemService.updateSystemLogoStream(user, id, {
      originalName: file.filename,
      mimeType: file.mimeType,
      stream: file.stream,
    });
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除线路系统' })
  async delete(@Param('id') id: string, @Req() req: Request) {
    const user = this.requireUser(req);
    return this.railwaySystemService.deleteSystem(user, id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: '获取线路系统修改日志' })
  async getLogs(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.railwaySystemService.getSystemLogs(
      id,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 10,
    );
  }
}
