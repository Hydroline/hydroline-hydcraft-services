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
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/services/roles.service';
import { CompanyService } from './company.service';
import {
  AdminCompanyListQueryDto,
  AdminCreateCompanyDto,
  AdminUpdateCompanyDto,
  CompanyActionDto,
} from './dto/company.dto';

@ApiTags('公司系统（管理端）')
@Controller('admin/companies')
@UseGuards(AuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class CompanyAdminController {
  constructor(private readonly companyService: CompanyService) {}

  private getUserId(req: Request) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('用户未登录');
    }
    return userId;
  }

  @Get()
  @RequirePermissions(PERMISSIONS.COMPANY_VIEW_ADMIN)
  @ApiOperation({ summary: '分页查询所有公司/个体工商户' })
  async list(@Query() query: AdminCompanyListQueryDto) {
    return this.companyService.adminList(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.COMPANY_VIEW_ADMIN)
  @ApiOperation({ summary: '查看公司详情（管理端）' })
  async detail(@Param('id') id: string) {
    return this.companyService.adminGet(id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_ADMIN)
  @ApiOperation({ summary: '管理员直接编辑公司信息' })
  async update(
    @Param('id') id: string,
    @Body() body: AdminUpdateCompanyDto,
    @Req() req: Request,
  ) {
    const userId = this.getUserId(req);
    return this.companyService.updateCompanyAsAdmin(id, userId, body);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_ADMIN)
  @ApiOperation({ summary: '管理员直接创建公司/个体工商户' })
  async create(@Body() body: AdminCreateCompanyDto, @Req() req: Request) {
    const userId = this.getUserId(req);
    return this.companyService.createCompanyAsAdmin(userId, body);
  }

  @Post(':id/actions')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_ADMIN)
  @ApiOperation({ summary: '执行流程动作（审批、驳回等）' })
  async action(
    @Param('id') id: string,
    @Body() body: CompanyActionDto,
    @Req() req: Request,
  ) {
    const userId = this.getUserId(req);
    return this.companyService.adminExecuteAction(id, userId, body);
  }
}
