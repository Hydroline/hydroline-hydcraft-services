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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { CompanyService } from './company.service';
import { parseSingleFileMultipart } from '../lib/multipart/parse-single-file-multipart';
import {
  CompanyDirectoryQueryDto,
  CompanyResolveDto,
  CompanyMemberApprovalDto,
  CompanyMemberRejectDto,
  CompanyMemberUpdateDto,
  CompanyMemberInviteDto,
  CompanyMemberJoinDto,
  CompanyRecommendationsQueryDto,
  CompanyRegistrationStatsQueryDto,
  CompanySettingsDto,
  CompanyUserSearchDto,
  CompanyAttachmentSearchDto,
  CompanyLogoAttachmentDto,
  CompanyDeregistrationApplyDto,
  CreateCompanyApplicationDto,
  UpdateCompanyProfileDto,
} from './dto/company.dto';

@ApiTags('公司系统')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  private requireUserId(req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('User session has expired');
    }
    return userId;
  }

  @Get('meta')
  @ApiOperation({ summary: '获取行业、公司类型等元数据' })
  async meta() {
    return this.companyService.getMeta();
  }

  @Get('public/recommendations')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '获取推荐公司（最近注册、活跃）' })
  async recommendations(@Query() query: CompanyRecommendationsQueryDto) {
    return this.companyService.listRecommendations(query);
  }

  @Get('dashboard')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前玩家可管理的公司列表' })
  async dashboard(@Req() req: Request) {
    const userId = this.requireUserId(req);
    return this.companyService.listMine(userId);
  }

  @Get('statistics/registrations')
  @ApiOperation({ summary: '获取每日主体注册曲线' })
  async registrationStats(@Query() query: CompanyRegistrationStatsQueryDto) {
    return this.companyService.getDailyRegistrations(query.days);
  }

  @Get('list')
  @ApiOperation({ summary: '工商数据库列表' })
  async list(@Query() query: CompanyDirectoryQueryDto) {
    return this.companyService.listDirectory(query);
  }

  @Post('resolve')
  @ApiOperation({ summary: '按 ID 查询公司信息' })
  async resolve(@Body() body: CompanyResolveDto) {
    return this.companyService.resolveCompanies(body.ids);
  }

  @Get('users/search')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索站内用户（法人/职员）' })
  async searchUsers(@Query() query: CompanyUserSearchDto) {
    return this.companyService.searchUsers(query);
  }

  @Get('attachments')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '搜索当前玩家上传的附件' })
  async searchAttachments(
    @Query() query: CompanyAttachmentSearchDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.searchUserAttachments(userId, query);
  }

  @Post('apply')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交公司/个体工商户注册申请' })
  async apply(@Req() req: Request, @Body() body: CreateCompanyApplicationDto) {
    const userId = this.requireUserId(req);
    return this.companyService.createApplication(userId, body);
  }

  @Post(':id/deregistration')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交公司注销申请' })
  async applyDeregistration(
    @Param('id') id: string,
    @Body() body: CompanyDeregistrationApplyDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.createDeregistrationApplication(
      id,
      userId,
      body,
    );
  }

  @Post(':id/members/join')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '申请加入公司/个体户' })
  async joinCompany(
    @Param('id') id: string,
    @Body() body: CompanyMemberJoinDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.joinCompany(id, userId, body);
  }

  @Post(':id/members/approve')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '审批入职申请' })
  async approveJoin(
    @Param('id') id: string,
    @Body() body: CompanyMemberApprovalDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.approveJoinRequest(id, userId, body);
  }

  @Post(':id/members/reject')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '驳回入职申请' })
  async rejectJoin(
    @Param('id') id: string,
    @Body() body: CompanyMemberRejectDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.rejectJoinRequest(id, userId, body);
  }

  @Patch(':id/members/:memberId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新成员岗位/权限' })
  async updateMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: CompanyMemberUpdateDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.updateMember(id, userId, {
      ...body,
      memberId,
    });
  }

  @Post(':id/members/invite')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '法人邀请用户入职' })
  async inviteMember(
    @Param('id') id: string,
    @Body() body: CompanyMemberInviteDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.inviteMember(id, userId, body);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: '查看公司详情' })
  async detail(@Param('id') id: string, @Req() req: Request) {
    return this.companyService.getCompanyDetail(id, req.user?.id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '公司持有者/法人更新公司信息' })
  async updateProfile(
    @Param('id') id: string,
    @Body() body: UpdateCompanyProfileDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.updateCompanyAsMember(id, userId, body);
  }

  @Patch(':id/settings')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新公司入职/岗位设置' })
  async updateSettings(
    @Param('id') id: string,
    @Body() body: CompanySettingsDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.updateCompanySettings(id, userId, body);
  }

  @Patch(':id/logo')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '上传公司 Logo' })
  async uploadLogo(@Param('id') id: string, @Req() req: Request) {
    const userId = this.requireUserId(req);
    const { file } = await parseSingleFileMultipart(req, {
      fileFieldName: 'logo',
      maxFileSizeBytes: 10 * 1024 * 1024,
    });
    return this.companyService.updateCompanyLogoStream(id, userId, {
      originalName: file.filename,
      mimeType: file.mimeType,
      stream: file.stream,
    });
  }

  @Patch(':id/logo/attachment')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '使用已有附件更新公司 Logo' })
  async updateLogoAttachment(
    @Param('id') id: string,
    @Body() body: CompanyLogoAttachmentDto,
    @Req() req: Request,
  ) {
    const userId = this.requireUserId(req);
    return this.companyService.updateCompanyLogoAttachment(
      id,
      userId,
      body.attachmentId,
    );
  }
}
