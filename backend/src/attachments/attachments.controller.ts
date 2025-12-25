import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AttachmentsService } from './attachments.service';
import { QueryAttachmentsDto } from './dto/query-attachments.dto';
import { CreateAttachmentDto } from './dto/create-attachment.dto';
import { UpdateAttachmentDto } from './dto/update-attachment.dto';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { GenerateShareTokenDto } from './dto/generate-share-token.dto';
import { parseSingleFileMultipart } from '../lib/multipart/parse-single-file-multipart';

@ApiTags('附件管理')
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_VIEW_ATTACHMENTS)
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询附件列表' })
  async list(@Query() query: QueryAttachmentsDto) {
    return this.attachmentsService.listAttachments(query);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传附件' })
  async upload(@Req() req: Request) {
    const { fields, file } = await parseSingleFileMultipart(req, {
      fileFieldName: 'file',
      maxFileSizeBytes: 64 * 1024 * 1024,
    });

    const dto = plainToInstance(CreateAttachmentDto, fields, {
      enableImplicitConversion: false,
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    });
    if (errors.length > 0) {
      const first = errors[0];
      const message =
        (first.constraints && Object.values(first.constraints)[0]) ||
        'Invalid request';
      throw new BadRequestException(message);
    }

    return this.attachmentsService.uploadAttachmentStream(
      req.user!.id,
      {
        originalName: file.filename,
        mimeType: file.mimeType,
        stream: file.stream,
      },
      dto,
    );
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS)
  @Patch(':attachmentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新附件信息' })
  async update(
    @Param('attachmentId') attachmentId: string,
    @Req() req: Request,
    @Body() body: UpdateAttachmentDto,
  ) {
    return this.attachmentsService.updateAttachment(
      attachmentId,
      req.user!.id,
      body,
    );
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS)
  @Delete(':attachmentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除附件' })
  async remove(@Param('attachmentId') attachmentId: string) {
    await this.attachmentsService.deleteAttachment(attachmentId);
    return { success: true };
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_VIEW_ATTACHMENTS)
  @Get('folders/all')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取全部附件文件夹' })
  async folders() {
    return this.attachmentsService.listFolders();
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS)
  @Post('folders')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建附件文件夹' })
  async createFolder(@Req() req: Request, @Body() body: CreateFolderDto) {
    return this.attachmentsService.createFolder(req.user!.id, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS)
  @Patch('folders/:folderId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新附件文件夹' })
  async updateFolder(
    @Param('folderId') folderId: string,
    @Body() body: UpdateFolderDto,
  ) {
    return this.attachmentsService.updateFolder(folderId, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS)
  @Delete('folders/:folderId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除附件文件夹' })
  async deleteFolder(@Param('folderId') folderId: string) {
    return this.attachmentsService.deleteFolder(folderId);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_VIEW_ATTACHMENTS)
  @Get('tags/all')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取附件标签列表' })
  async tags() {
    return this.attachmentsService.listTags();
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS)
  @Post('tags')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建附件标签' })
  async createTag(@Req() req: Request, @Body() body: CreateTagDto) {
    return this.attachmentsService.createTag(req.user!.id, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS)
  @Patch('tags/:tagId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新附件标签' })
  async updateTag(@Param('tagId') tagId: string, @Body() body: UpdateTagDto) {
    return this.attachmentsService.updateTag(tagId, body);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.ASSETS_MANAGE_ATTACHMENTS)
  @Delete('tags/:tagId')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除附件标签' })
  async deleteTag(@Param('tagId') tagId: string) {
    await this.attachmentsService.deleteTag(tagId);
    return { success: true };
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @Post(':attachmentId/share')
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成附件分享链接' })
  async share(
    @Param('attachmentId') attachmentId: string,
    @Req() req: Request,
    @Body() body: GenerateShareTokenDto,
  ) {
    return this.attachmentsService.generateShareToken(
      attachmentId,
      req.user!.id,
      body,
    );
  }

  @Get('public/:attachmentId')
  @ApiOperation({ summary: '公开下载附件' })
  async publicDownload(
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const attachment =
      await this.attachmentsService.getAttachmentOrThrow(attachmentId);
    if (!attachment.isPublic) {
      throw new NotFoundException('Attachment is not public');
    }
    const stream =
      await this.attachmentsService.openAttachmentStream(attachment);
    res.setHeader(
      'Content-Type',
      attachment.mimeType ?? 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.originalName)}"`,
    );
    stream.pipe(res);
  }

  @Get('share/:token')
  @ApiOperation({ summary: '通过分享令牌下载附件' })
  async shareDownload(@Param('token') token: string, @Res() res: Response) {
    const attachment = await this.attachmentsService.resolveShareToken(token);
    const stream =
      await this.attachmentsService.openAttachmentStream(attachment);
    res.setHeader(
      'Content-Type',
      attachment.mimeType ?? 'application/octet-stream',
    );
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.originalName)}"`,
    );
    stream.pipe(res);
  }
}
