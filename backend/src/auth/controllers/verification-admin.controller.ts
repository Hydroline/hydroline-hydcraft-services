import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth.guard';
import { PermissionsGuard } from '../permissions.guard';
import { RequirePermissions } from '../permissions.decorator';
import { DEFAULT_PERMISSIONS } from '../services/roles.service';
import { ConfigService } from '../../config/config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UsersService } from '../services/users/users.service';
import { AdminAuditService } from '../services/admin-audit.service';
import { MailService } from '../../mail/mail.service';
import { SendTestMailDto } from '../dto/send-test-mail.dto';

@ApiTags('验证管理')
@ApiBearerAuth()
@Controller('auth/admin/verification')
@UseGuards(AuthGuard, PermissionsGuard)
export class VerificationAdminController {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly audit: AdminAuditService,
    private readonly mailService: MailService,
  ) {}

  @Get('flags')
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_CONFIG)
  @ApiOperation({ summary: '读取安全验证开关' })
  async getFlags() {
    const entries = await this.configService.getEntriesByNamespaceKey(
      'security.verification',
    );
    const map = new Map(entries.map((e) => [e.key, e.value]));
    const pick = (key: string, fallback: unknown) =>
      map.has(key) ? map.get(key) : fallback;
    return {
      enableEmailVerification: Boolean(pick('enableEmailVerification', true)),
      enablePhoneVerification: Boolean(pick('enablePhoneVerification', false)),
      enablePasswordReset: Boolean(pick('enablePasswordReset', true)),
      emailCodeTtlMinutes: Number(pick('emailCodeTtlMinutes', 10)),
      rateLimitPerEmailPerHour: Number(pick('rateLimitPerEmailPerHour', 5)),
      supportedPhoneRegions: Array.isArray(
        pick('supportedPhoneRegions', ['+86', '+852', '+853', '+886']),
      )
        ? (pick('supportedPhoneRegions', [
            '+86',
            '+852',
            '+853',
            '+886',
          ]) as string[])
        : ['+86', '+852', '+853', '+886'],
    } as const;
  }

  @Post('flags')
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_CONFIG)
  @ApiOperation({ summary: '更新安全验证开关' })
  async setFlags(
    @Body()
    body: Partial<{
      enableEmailVerification: boolean;
      enablePhoneVerification: boolean;
      enablePasswordReset: boolean;
      emailCodeTtlMinutes: number;
      rateLimitPerEmailPerHour: number;
      supportedPhoneRegions: string[];
    }>,
    @Req() req: Request,
  ) {
    const ns = await this.configService.ensureNamespaceByKey(
      'security.verification',
      { name: 'Security Verification', description: 'Verification toggles' },
    );
    const existing = await this.configService.listEntries(ns.id);
    const byKey = new Map(existing.map((e) => [e.key, e]));
    const writes: Array<Promise<unknown>> = [];
    const write = (key: string, value: unknown) => {
      const found = byKey.get(key);
      if (found) {
        writes.push(
          this.configService.updateEntry(found.id, { value }, req.user!.id),
        );
      } else {
        writes.push(
          this.configService.createEntry(ns.id, { key, value }, req.user!.id),
        );
      }
    };
    if (body.enableEmailVerification !== undefined)
      write('enableEmailVerification', body.enableEmailVerification);
    if (body.enablePhoneVerification !== undefined)
      write('enablePhoneVerification', body.enablePhoneVerification);
    if (body.enablePasswordReset !== undefined)
      write('enablePasswordReset', body.enablePasswordReset);
    if (body.emailCodeTtlMinutes !== undefined)
      write('emailCodeTtlMinutes', body.emailCodeTtlMinutes);
    if (body.rateLimitPerEmailPerHour !== undefined)
      write('rateLimitPerEmailPerHour', body.rateLimitPerEmailPerHour);
    if (body.supportedPhoneRegions !== undefined)
      write('supportedPhoneRegions', body.supportedPhoneRegions);
    await Promise.all(writes);
    await this.audit.record({
      actorId: req.user?.id,
      action: 'update_verification_flags',
      targetType: 'config',
      targetId: 'security.verification',
      payload: body,
    });
    return { success: true } as const;
  }

  @Get('templates')
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_CONFIG)
  @ApiOperation({ summary: '列出可用的邮件模板' })
  async listMailTemplates() {
    const templates = await this.mailService.listTemplates();
    return {
      templates: templates.map((tpl) => ({
        key: tpl.key,
        label: tpl.label,
        description: tpl.description ?? null,
        defaultSubject: tpl.defaultSubject ?? null,
      })),
    } as const;
  }

  @Post('test-email')
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_CONFIG)
  @ApiOperation({ summary: '发送测试邮件到指定邮箱' })
  async sendTestEmail(@Body() body: SendTestMailDto, @Req() req: Request) {
    const templates = await this.mailService.listTemplates();
    const targetTemplate = body.template
      ? templates.find((tpl) => tpl.key === body.template)
      : null;
    if (body.template && !targetTemplate) {
      throw new BadRequestException('未知的邮件模板');
    }
    const subject = body.subject?.trim()
      ? body.subject.trim()
      : (targetTemplate?.defaultSubject ??
        `[测试] ${targetTemplate?.label ?? 'Hydroline 邮件'}`);

    await this.mailService.sendMail({
      to: body.email,
      subject,
      ...(targetTemplate
        ? { template: targetTemplate.key, context: body.context }
        : { text: 'Hydroline 测试邮件' }),
    });

    await this.audit.record({
      actorId: req.user?.id,
      action: 'send_test_mail',
      targetType: 'mail',
      targetId: targetTemplate?.key ?? 'custom',
      payload: {
        email: body.email,
        template: targetTemplate?.key ?? null,
        subject,
      },
    });

    return { success: true } as const;
  }

  @Get('unverified')
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_USERS)
  @ApiOperation({ summary: '列出未验证邮箱的用户（分页）' })
  async listUnverified(
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const page = Math.max(Number(pageStr ?? 1) || 1, 1);
    const pageSize = Math.min(
      Math.max(Number(pageSizeStr ?? 20) || 20, 1),
      100,
    );

    const where: Prisma.UserWhereInput = {
      emailVerified: false,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          profile: { select: { displayName: true } },
          contacts: {
            where: { channel: { key: 'email' } },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              value: true,
              isPrimary: true,
              verification: true,
              verifiedAt: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    } as const;
  }

  @Post('resend-email')
  @RequirePermissions(DEFAULT_PERMISSIONS.MANAGE_USERS)
  @ApiOperation({ summary: '为指定用户邮箱重发验证码' })
  async resendEmail(
    @Body() body: { userId: string; email: string },
    @Req() req: Request,
  ) {
    await this.usersService.sendEmailVerificationCode(body.userId, body.email);
    await this.audit.record({
      actorId: req.user?.id,
      action: 'resend_email_verification',
      targetType: 'user',
      targetId: body.userId,
      payload: { email: body.email },
    });
    return { success: true } as const;
  }
}
