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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from '../services/users/users.service';
import { AuthGuard } from '../auth.guard';
import { PermissionsGuard } from '../permissions.guard';
import { RequirePermissions } from '../permissions.decorator';
import { PERMISSIONS } from '../services/roles.service';
import { UpdateUserProfileDto } from '../dto/update-user-profile.dto';
import { CreateMinecraftProfileDto } from '../dto/create-minecraft-profile.dto';
import { UpdateMinecraftProfileDto } from '../dto/update-minecraft-profile.dto';
import { CreateStatusEventDto } from '../dto/create-status-event.dto';
import { CreateLifecycleEventDto } from '../dto/create-lifecycle-event.dto';
import { CreateUserContactDto } from '../dto/create-user-contact.dto';
import { UpdateUserContactDto } from '../dto/update-user-contact.dto';
import { RegeneratePiicDto } from '../dto/regenerate-piic.dto';
import { AssignRolesDto } from '../dto/assign-roles.dto';
import { UpdateJoinDateDto } from '../dto/update-join-date.dto';
import { ResetUserPasswordDto } from '../dto/reset-user-password.dto';
import { UpdateAuthmeBindingAdminDto } from '../dto/update-authme-binding-admin.dto';
import { AssignPermissionLabelsDto } from '../dto/assign-permission-labels.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { AttachmentsService } from '../../attachments/attachments.service';
import { enrichUserAvatar } from '../helpers/user-avatar.helper';
import { parseSingleFileMultipart } from '../../lib/multipart/parse-single-file-multipart';
import {
  AddPhoneContactDto,
  UpdatePhoneContactDto,
} from '../dto/phone-contact.dto';

// 为避免类型信息获取不全导致的 ESLint 误报，这里定义一个局部结构类型（结构兼容 DTO）
type CreateBindingBody = { identifier: string; setPrimary?: boolean };

@ApiTags('用户管理')
@ApiBearerAuth()
@Controller('auth/users')
@UseGuards(AuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly attachmentsService: AttachmentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: '分页查询用户' })
  @RequirePermissions(PERMISSIONS.AUTH_VIEW_USERS)
  async list(
    @Query('keyword') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortField') sortField?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const result = await this.usersService.listUsers({
      keyword,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      sortField,
      sortOrder,
    });
    const items = await Promise.all(
      result.items.map((item) =>
        enrichUserAvatar(this.attachmentsService, item as any),
      ),
    );
    return { ...result, items };
  }

  @Get(':userId')
  @ApiOperation({ summary: '获取用户详情' })
  @RequirePermissions(PERMISSIONS.AUTH_VIEW_USERS)
  async detail(@Param('userId') userId: string) {
    const detail = await this.usersService.getUserDetail(userId);
    return enrichUserAvatar(this.attachmentsService, detail as any);
  }

  @Delete(':userId')
  @ApiOperation({ summary: '删除用户' })
  @RequirePermissions(PERMISSIONS.AUTH_ADMIN_USER_SECURITY)
  async remove(@Param('userId') userId: string) {
    return this.usersService.deleteUser(userId);
  }

  @Get(':userId/oauth/accounts')
  @ApiOperation({ summary: '查看用户的 OAuth 绑定' })
  @RequirePermissions(PERMISSIONS.AUTH_VIEW_USERS)
  async listOauthAccounts(@Param('userId') userId: string) {
    return this.usersService.listUserOauthAccounts(userId);
  }

  @Get(':userId/likes')
  @ApiOperation({ summary: '查看用户被点赞记录' })
  @RequirePermissions(PERMISSIONS.AUTH_VIEW_USERS)
  async listLikes(@Param('userId') userId: string) {
    return this.usersService.listUserLikes(userId);
  }

  @Delete(':userId/oauth/accounts/:accountId')
  @ApiOperation({ summary: '解绑指定的 OAuth 账户' })
  @RequirePermissions(PERMISSIONS.AUTH_MANAGE_USERS)
  async unlinkOauthAccount(
    @Param('userId') userId: string,
    @Param('accountId') accountId: string,
    @Req() req: Request,
  ) {
    return this.usersService.unlinkUserOauthAccount(
      userId,
      accountId,
      req.user?.id,
    );
  }

  @Patch(':userId/profile')
  @ApiOperation({ summary: '更新用户档案' })
  @RequirePermissions(PERMISSIONS.AUTH_MANAGE_USERS)
  async updateProfile(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  // Update user's in-game join date (admin only). Registration time is immutable.
  @Patch(':userId/join-date')
  @ApiOperation({ summary: '调整入服日期' })
  @RequirePermissions(PERMISSIONS.AUTH_MANAGE_USERS)
  async updateJoinDate(
    @Param('userId') userId: string,
    @Body() dto: UpdateJoinDateDto,
  ) {
    return this.usersService.updateJoinDate(userId, dto.joinDate);
  }

  @Post(':userId/reset-password')
  @ApiOperation({ summary: '重置用户密码' })
  @RequirePermissions(PERMISSIONS.AUTH_ADMIN_USER_SECURITY)
  async resetPassword(
    @Param('userId') userId: string,
    @Body() dto: ResetUserPasswordDto,
    @Req() req: Request,
  ) {
    return this.usersService.resetUserPassword(userId, dto, req.user?.id);
  }

  @Patch(':userId/avatar')
  @ApiOperation({ summary: '更新指定用户头像' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: { type: 'string', format: 'binary' },
      },
      required: ['avatar'],
    },
  })
  @RequirePermissions(PERMISSIONS.AUTH_MANAGE_USERS)
  async updateUserAvatar(@Param('userId') userId: string, @Req() req: Request) {
    const { file } = await parseSingleFileMultipart(req, {
      fileFieldName: 'avatar',
      maxFileSizeBytes: 8 * 1024 * 1024,
    });

    const existingUser = await this.usersService.getSessionUser(userId);
    const previousAvatarAttachmentId =
      (existingUser as any)?.avatarAttachmentId ?? null;

    const avatarFolder =
      await this.attachmentsService.resolveUserAvatarFolder(userId);

    const attachment = await this.attachmentsService.uploadAttachmentStream(
      userId,
      {
        originalName: file.filename,
        mimeType: file.mimeType,
        stream: file.stream,
      },
      {
        name: file.filename,
        folderId: avatarFolder?.id ?? null,
        description: 'User avatar',
        isPublic: true,
        tagKeys: [],
        visibilityMode: 'public',
        visibilityRoles: [],
        visibilityLabels: [],
        metadata: {},
      } as any,
    );

    await this.usersService.updateCurrentUser(userId, {
      avatarAttachmentId: attachment.id,
    } as any);

    if (
      previousAvatarAttachmentId &&
      previousAvatarAttachmentId !== attachment.id
    ) {
      try {
        await this.attachmentsService.deleteAttachment(
          previousAvatarAttachmentId,
        );
      } catch {
        // ignore avatar cleanup errors
      }
    }

    const detail = await this.usersService.getUserDetail(userId);
    const enriched = await enrichUserAvatar(
      this.attachmentsService,
      detail as any,
      attachment,
    );
    return { user: enriched };
  }

  @Patch(':userId/bindings/:bindingId')
  @ApiOperation({ summary: '更新 AuthMe 绑定信息' })
  async updateBinding(
    @Param('userId') userId: string,
    @Param('bindingId') bindingId: string,
    @Body() dto: UpdateAuthmeBindingAdminDto,
    @Req() req: Request,
  ) {
    return this.usersService.updateAuthmeBinding(
      userId,
      bindingId,
      dto,
      req.user?.id,
    );
  }

  @Post(':userId/bindings')
  @ApiOperation({ summary: '创建新的 AuthMe 绑定（管理员直接绑定）' })
  async createBinding(
    @Param('userId') userId: string,
    @Body() dto: CreateBindingBody,
    @Req() req: Request,
  ) {
    const safeDto: { identifier: string; setPrimary?: boolean } = {
      identifier: String(dto.identifier ?? ''),
      setPrimary: dto.setPrimary,
    };
    return this.usersService.createAuthmeBindingAdmin(
      userId,
      safeDto,
      req.user?.id,
    );
  }

  @Patch(':userId/bindings/:bindingId/primary')
  @ApiOperation({ summary: '设置主 AuthMe 绑定' })
  async setPrimaryBinding(
    @Param('userId') userId: string,
    @Param('bindingId') bindingId: string,
    @Req() req: Request,
  ) {
    return this.usersService.setPrimaryAuthmeBinding(
      userId,
      bindingId,
      req.user?.id,
    );
  }

  @Delete(':userId/bindings/:bindingId')
  @ApiOperation({ summary: '解绑指定 AuthMe 绑定' })
  async unbindAuthme(
    @Param('userId') userId: string,
    @Param('bindingId') bindingId: string,
    @Req() req: Request,
  ) {
    return await this.usersService.unbindAuthmeBinding(
      userId,
      bindingId,
      req.user?.id,
    );
  }

  @Get(':userId/bindings/history')
  @ApiOperation({ summary: '查看绑定流转记录' })
  async listBindingHistory(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.usersService.listAuthmeBindingHistoryByUser(userId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post(':userId/minecraft-profiles')
  @ApiOperation({ summary: '新增玩家昵称或别名记录' })
  async addMinecraftProfile(
    @Param('userId') userId: string,
    @Body() dto: CreateMinecraftProfileDto,
  ) {
    return this.usersService.addMinecraftProfile(userId, dto);
  }

  @Patch(':userId/minecraft-profiles/:profileId')
  @ApiOperation({ summary: '更新玩家昵称或别名记录' })
  async updateMinecraftProfile(
    @Param('userId') userId: string,
    @Param('profileId') profileId: string,
    @Body() dto: UpdateMinecraftProfileDto,
  ) {
    return this.usersService.updateMinecraftProfile(userId, profileId, dto);
  }

  @Delete(':userId/minecraft-profiles/:profileId')
  @ApiOperation({ summary: '删除玩家昵称或别名记录' })
  async removeMinecraftProfile(
    @Param('userId') userId: string,
    @Param('profileId') profileId: string,
  ) {
    await this.usersService.removeMinecraftProfile(userId, profileId);
    return { success: true };
  }

  @Post(':userId/status-events')
  @ApiOperation({ summary: '新增状态事件' })
  @RequirePermissions(PERMISSIONS.AUTH_MANAGE_USERS)
  async addStatusEvent(
    @Param('userId') userId: string,
    @Body() dto: CreateStatusEventDto,
    @Req() req: Request,
  ) {
    return this.usersService.addStatusEvent(userId, dto, req.user?.id);
  }

  @Patch(':userId/status')
  @ApiOperation({ summary: '直接调整用户状态' })
  @RequirePermissions(PERMISSIONS.AUTH_ADMIN_USER_SECURITY)
  async updateStatus(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: Request,
  ) {
    return this.usersService.updateUserStatus(userId, dto, req.user?.id);
  }

  @Post(':userId/lifecycle-events')
  @ApiOperation({ summary: '新增生命周期事件' })
  @RequirePermissions(PERMISSIONS.AUTH_MANAGE_USERS)
  async addLifecycleEvent(
    @Param('userId') userId: string,
    @Body() dto: CreateLifecycleEventDto,
    @Req() req: Request,
  ) {
    return this.usersService.addLifecycleEvent(userId, dto, req.user?.id);
  }

  @Post(':userId/contacts')
  @ApiOperation({ summary: '新增联系信息' })
  async addContact(
    @Param('userId') userId: string,
    @Body() dto: CreateUserContactDto,
  ) {
    // 管理端新增邮箱联系方式：不自动发送验证码，由用户在个人中心发起
    return this.usersService.addContactAdmin(userId, dto);
  }

  @Patch(':userId/contacts/:contactId')
  @ApiOperation({ summary: '更新联系信息' })
  async updateContact(
    @Param('userId') userId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateUserContactDto,
  ) {
    return this.usersService.updateContact(userId, contactId, dto);
  }

  @Delete(':userId/contacts/:contactId')
  @ApiOperation({ summary: '删除联系信息' })
  async removeContact(
    @Param('userId') userId: string,
    @Param('contactId') contactId: string,
  ) {
    await this.usersService.removeContact(userId, contactId);
    return { success: true };
  }

  @Get(':userId/contacts/phone')
  @ApiOperation({ summary: '列出用户手机号联系人' })
  async listPhoneContacts(@Param('userId') userId: string) {
    const items = await this.usersService.listPhoneContacts(userId);
    return { items };
  }

  @Post(':userId/contacts/phone')
  @ApiOperation({ summary: '为用户新增手机号联系人' })
  async addPhoneContact(
    @Param('userId') userId: string,
    @Body() dto: AddPhoneContactDto,
  ) {
    const contact = await this.usersService.addPhoneContact(userId, dto);
    return { contact };
  }

  @Patch(':userId/contacts/phone/:contactId')
  @ApiOperation({ summary: '更新用户手机号联系人' })
  async updatePhoneContact(
    @Param('userId') userId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdatePhoneContactDto,
  ) {
    const contact = await this.usersService.updatePhoneContact(
      userId,
      contactId,
      dto,
    );
    return { contact };
  }

  @Patch(':userId/contacts/phone/:contactId/primary')
  @ApiOperation({ summary: '设置用户主手机号' })
  async setPrimaryPhoneContact(
    @Param('userId') userId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.usersService.setPrimaryPhoneContact(userId, contactId);
  }

  @Delete(':userId/contacts/phone/:contactId')
  @ApiOperation({ summary: '删除用户手机号联系人' })
  async removePhoneContact(
    @Param('userId') userId: string,
    @Param('contactId') contactId: string,
  ) {
    await this.usersService.removeContact(userId, contactId);
    return { success: true };
  }

  @Post(':userId/piic/regenerate')
  @ApiOperation({ summary: '重新生成 PIIC' })
  async regeneratePiic(
    @Param('userId') userId: string,
    @Body() dto: RegeneratePiicDto,
    @Req() req: Request,
  ) {
    return this.usersService.regeneratePiic(userId, dto, req.user?.id);
  }

  @Post(':userId/roles')
  @ApiOperation({ summary: '分配角色' })
  async assignRoles(
    @Param('userId') userId: string,
    @Body() dto: AssignRolesDto,
    @Req() req: Request,
  ) {
    return this.usersService.assignRoles(userId, dto.roleKeys, req.user?.id);
  }

  @Post(':userId/permission-labels')
  @ApiOperation({ summary: '分配权限标签' })
  async assignPermissionLabels(
    @Param('userId') userId: string,
    @Body() dto: AssignPermissionLabelsDto,
    @Req() req: Request,
  ) {
    return this.usersService.assignPermissionLabels(userId, dto, req.user?.id);
  }
}
