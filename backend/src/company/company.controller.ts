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
import {
  CompanyRecommendationsQueryDto,
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
      throw new BadRequestException('用户会话已失效');
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

  @Post('apply')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交公司/个体工商户注册申请' })
  async apply(@Req() req: Request, @Body() body: CreateCompanyApplicationDto) {
    const userId = this.requireUserId(req);
    return this.companyService.createApplication(userId, body);
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
}
