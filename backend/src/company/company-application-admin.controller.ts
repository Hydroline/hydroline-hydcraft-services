import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
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
  CompanyApplicationListQueryDto,
  CompanyApplicationSettingsDto,
} from './dto/admin-config.dto';
import { CompanyActionDto } from './dto/company.dto';

@ApiTags('公司申请审批')
@Controller('admin/company/applications')
@UseGuards(AuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class CompanyApplicationAdminController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMPANY_VIEW_APPLICATIONS)
  @ApiOperation({ summary: '分页查询公司申请' })
  async list(@Query() query: CompanyApplicationListQueryDto) {
    return this.companyService.listApplications(query);
  }

  @Get('settings')
  @RequirePermissions(PERMISSIONS.COMPANY_VIEW_APPLICATIONS)
  @ApiOperation({ summary: '获取公司申请审批设置' })
  async settings(@Query('workflowCode') workflowCode?: string) {
    return this.companyService.getCompanyApplicationSettings(workflowCode);
  }

  @Post('settings')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_ADMIN)
  @ApiOperation({ summary: '更新公司申请审批设置' })
  async updateSettings(
    @Body() body: CompanyApplicationSettingsDto,
    @Query('workflowCode') workflowCode: string | undefined,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.companyService.updateCompanyApplicationSettings(
      body.autoApprove,
      userId,
      workflowCode,
    );
  }

  @Post(':id/actions')
  @RequirePermissions(PERMISSIONS.COMPANY_MANAGE_ADMIN)
  @ApiOperation({ summary: '审批公司申请' })
  async action(
    @Param('id') id: string,
    @Body() body: CompanyActionDto,
    @Req() req: Request,
  ) {
    const userId = (req.user as { id?: string } | undefined)?.id;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.companyService.adminExecuteApplicationAction(id, userId, body);
  }
}
