import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  CompanyApplicationStatus,
  CompanyCategory,
  CompanyIndustry,
  CompanyMemberRole,
  CompanyPosition,
  CompanyStatus,
  CompanyType,
  CompanyVisibility,
  Prisma,
  WorkflowInstanceStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import {
  AdminCompanyListQueryDto,
  AdminCreateCompanyDto,
  AdminUpdateCompanyDto,
  CompanyActionDto,
  CompanyAttachmentSearchDto,
  CompanyDeregistrationApplyDto,
  CompanyDirectoryQueryDto,
  CompanyMemberApprovalDto,
  CompanyMemberInviteDto,
  CompanyMemberJoinDto,
  CompanyMemberRejectDto,
  CompanyMemberUpdateDto,
  CompanyRecommendationsQueryDto,
  CompanySettingsDto,
  CompanyUserSearchDto,
  CreateCompanyApplicationDto,
  UpdateCompanyProfileDto,
} from './dto/company.dto';
import {
  COMPANY_MEMBER_WRITE_ROLES,
  DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
  DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_DEFINITION,
  DEFAULT_COMPANY_WORKFLOW_CODE,
  DEFAULT_COMPANY_WORKFLOW_DEFINITION,
} from './company.constants';
import { AttachmentsService } from '../attachments/attachments.service';
import type { UploadedStreamFile } from '../attachments/attachments.service';
import type { StoredUploadedFile } from '../attachments/uploaded-file.interface';
import { ConfigService } from '../config/config.service';
import {
  CompanyApplicationListQueryDto,
  CompanyApplicationSettingsDto,
  UpsertCompanyIndustryDto,
  UpsertCompanyTypeDto,
} from './dto/admin-config.dto';
import type {
  WorkflowDefinitionWithConfig,
  WorkflowTransitionResult,
} from '../workflow/workflow.types';

const companyInclude = Prisma.validator<Prisma.CompanyInclude>()({
  type: true,
  industry: true,
  legalRepresentative: {
    select: {
      id: true,
      name: true,
      email: true,
      avatarAttachmentId: true,
      profile: {
        select: {
          displayName: true,
        },
      },
    },
  },
  members: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarAttachmentId: true,
          profile: {
            select: {
              displayName: true,
            },
          },
        },
      },
      position: true,
    },
  },
  policies: {
    orderBy: { createdAt: 'desc' },
  },
  auditRecords: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          profile: {
            select: {
              displayName: true,
            },
          },
        },
      },
    },
  },
  applications: {
    orderBy: { submittedAt: 'desc' },
    take: 5,
  },
  workflowInstance: {
    include: { definition: true },
  },
});

const COMPANY_CONFIG_NAMESPACE = 'company';
const COMPANY_CONFIG_AUTO_APPROVE_KEY = 'auto_approve_applications';

type CompanyWithRelations = Prisma.CompanyGetPayload<{
  include: typeof companyInclude;
}>;

type CompanyMetaResult = {
  industries: CompanyIndustry[];
  types: CompanyType[];
  positions: CompanyPosition[];
};

type CompanyRegistrationStatRow = {
  date: string;
  total: number;
  individual: number;
};

type CompanyDashboardStats = {
  companyCount: number;
  individualBusinessCount: number;
  memberCount: number;
};

type CompanySettings = {
  joinPolicy?: 'AUTO' | 'REVIEW';
  positionPermissions?: Record<string, string[]>;
};

const DEFAULT_INDUSTRIES = [
  {
    code: 'it-service',
    name: '信息技术与服务',
    description: '软件、互联网、数字化运营服务。',
  },
  {
    code: 'manufacturing',
    name: '制造业',
    description: '传统与高端制造、自动化、装备。',
  },
  {
    code: 'finance',
    name: '金融与投资',
    description: '银行、支付、虚拟经济与资产管理。',
  },
  {
    code: 'culture',
    name: '文化创意',
    description: '媒体、设计、文娱和内容生产。',
  },
  {
    code: 'education',
    name: '教育与培训',
    description: '教育科技、职业培训与认证。',
  },
  {
    code: 'logistics',
    name: '交通与物流',
    description: '运输、仓储、供应链与港航。',
  },
  {
    code: 'energy',
    name: '能源与环境',
    description: '新能源、环保、能源服务。',
  },
  {
    code: 'healthcare',
    name: '医疗与健康',
    description: '医疗、康复、营养与保健。',
  },
  {
    code: 'real-estate',
    name: '房地产与建设',
    description: '地产开发、建筑施工与物业。',
  },
  {
    code: 'retail',
    name: '批发与零售',
    description: '消费零售、供应链与分销。',
  },
];

const DEFAULT_COMPANY_TYPES = [
  {
    code: 'limited_liability',
    name: '有限责任公司',
    description: '中国最常见的公司形式，股东以出资额为限对公司承担责任。',
    category: CompanyCategory.ENTERPRISE,
  },
  {
    code: 'joint_stock',
    name: '股份有限公司',
    description: '适用于资本较大、计划引入多方投资的实体。',
    category: CompanyCategory.ENTERPRISE,
  },
  {
    code: 'foreign_invested',
    name: '外商投资企业',
    description: '对接外资与全球合作的特殊类型。',
    category: CompanyCategory.ENTERPRISE,
  },
  {
    code: 'individual_business',
    name: '个体工商户',
    description: '天然适合玩家单人经营的小微模式，允许少量成员。',
    category: CompanyCategory.INDIVIDUAL,
  },
  {
    code: 'organization',
    name: '事业机构 / 组织',
    description: '用于社团、联盟或公共事业类运营。',
    category: CompanyCategory.ORGANIZATION,
  },
];

const DEFAULT_POSITIONS = [
  {
    code: 'legal_person',
    name: '法定代表人',
    description: '对外承担法律责任的法人，具备流程审批权。',
    role: CompanyMemberRole.LEGAL_PERSON,
  },
  {
    code: 'owner',
    name: '股东 / 持有人',
    description: '拥有公司份额，决定重大运营方向。',
    role: CompanyMemberRole.OWNER,
  },
  {
    code: 'board_director',
    name: '董事',
    description: '董事会成员，负责制度与监督。',
    role: CompanyMemberRole.EXECUTIVE,
  },
  {
    code: 'general_manager',
    name: '总经理 / 经理',
    description: '负责日常运营与团队管理。',
    role: CompanyMemberRole.MANAGER,
  },
  {
    code: 'auditor',
    name: '监事 / 审计',
    description: '监督公司财务与合规。',
    role: CompanyMemberRole.AUDITOR,
  },
  {
    code: 'staff',
    name: '职员 / 成员',
    description: '普通职级，承担执行任务。',
    role: CompanyMemberRole.MEMBER,
  },
];

const INVITEABLE_MEMBER_ROLES: CompanyMemberRole[] = [
  CompanyMemberRole.MEMBER,
  CompanyMemberRole.MANAGER,
  CompanyMemberRole.EXECUTIVE,
  CompanyMemberRole.AUDITOR,
];

@Injectable()
export class CompanyService implements OnModuleInit {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
    private readonly attachmentsService: AttachmentsService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureBaselineMetadata();
    } catch (error) {
      this.logger.warn(`加载工商基础配置失败: ${error}`);
    }
  }

  async getMeta(): Promise<
    CompanyMetaResult & { memberWriteRoles: CompanyMemberRole[] }
  > {
    const [industries, types, positions] = await this.prisma.$transaction([
      this.prisma.companyIndustry.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.companyType.findMany({
        orderBy: { name: 'asc' },
      }),
      this.prisma.companyPosition.findMany({
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      industries,
      types,
      positions,
      memberWriteRoles: COMPANY_MEMBER_WRITE_ROLES,
    };
  }

  async getDailyRegistrations(days?: number) {
    const span = Math.min(Math.max(days ?? 30, 7), 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (span - 1));
    const rows = await this.prisma.$queryRaw<
      {
        date: string;
        total: number | Prisma.Decimal;
        individual: number | Prisma.Decimal;
      }[]
    >(Prisma.sql`
      SELECT
        to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "date",
        COUNT(*) AS "total",
        SUM(CASE WHEN "isIndividualBusiness" THEN 1 ELSE 0 END) AS "individual"
      FROM "companies"
      WHERE "createdAt" >= ${start}
      GROUP BY date
      ORDER BY date ASC
    `);
    const normalized = rows.map((row) => ({
      date: row.date,
      total: Number(row.total ?? 0),
      individual: Number(row.individual ?? 0),
    }));
    const map = new Map(normalized.map((row) => [row.date, row]));
    const stats: CompanyRegistrationStatRow[] = [];
    for (let i = 0; i < span; i += 1) {
      const current = new Date(start);
      current.setDate(current.getDate() + i);
      const mark = current.toISOString().slice(0, 10);
      if (map.has(mark)) {
        stats.push(map.get(mark)!);
      } else {
        stats.push({ date: mark, individual: 0, total: 0 });
      }
    }
    return stats;
  }

  async listRecommendations(query: CompanyRecommendationsQueryDto) {
    const limit = query.limit ?? 6;
    const orderByRecent =
      query.kind === 'active'
        ? { lastActiveAt: 'desc' as const }
        : { approvedAt: 'desc' as const };
    const companies = await this.prisma.company.findMany({
      where: {
        visibility: CompanyVisibility.PUBLIC,
        status: {
          in: [
            CompanyStatus.ACTIVE,
            CompanyStatus.SUSPENDED,
            CompanyStatus.UNDER_REVIEW,
          ],
        },
      },
      orderBy: [orderByRecent, { createdAt: 'desc' }],
      take: limit,
      include: {
        type: true,
        industry: true,
        legalRepresentative: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarAttachmentId: true,
            profile: { select: { displayName: true } },
          },
        },
        members: {
          where: {
            role: {
              in: [CompanyMemberRole.LEGAL_PERSON, CompanyMemberRole.OWNER],
            },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profile: { select: { displayName: true } },
              },
            },
          },
        },
      },
    });

    const legalRepAvatarUrlMap =
      await this.attachmentsService.resolvePublicUrlsByIds(
        companies.map(
          (company) => company.legalRepresentative?.avatarAttachmentId,
        ),
      );

    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      summary: company.summary,
      status: company.status,
      type: company.type,
      industry: company.industry,
      legalPerson: this.pickMember(
        company.members,
        CompanyMemberRole.LEGAL_PERSON,
      ),
      legalRepresentative: company.legalRepresentative
        ? {
            id: company.legalRepresentative.id,
            name: company.legalRepresentative.name,
            email: company.legalRepresentative.email,
            displayName:
              company.legalRepresentative.profile?.displayName ?? null,
            avatarUrl: company.legalRepresentative.avatarAttachmentId
              ? (legalRepAvatarUrlMap.get(
                  company.legalRepresentative.avatarAttachmentId,
                ) ?? null)
              : null,
          }
        : null,
      owners: company.members.filter(
        (member) => member.role === CompanyMemberRole.OWNER,
      ),
      recommendationScore: company.recommendationScore,
      lastActiveAt: company.lastActiveAt,
      approvedAt: company.approvedAt,
    }));
  }

  async listIndustries() {
    return this.prisma.companyIndustry.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async searchUsers(query: CompanyUserSearchDto) {
    const keyword = query.query.trim();
    if (!keyword) {
      return [];
    }
    const limit = Math.min(query.limit ?? 20, 100);
    return this.prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { email: { contains: keyword, mode: 'insensitive' } },
          {
            profile: {
              displayName: { contains: keyword, mode: 'insensitive' },
            },
          },
        ],
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        profile: {
          select: {
            displayName: true,
          },
        },
      },
    });
  }

  async searchUserAttachments(
    userId: string,
    query: CompanyAttachmentSearchDto,
  ) {
    return this.attachmentsService.searchUserAttachments(
      userId,
      query.keyword,
      query.limit,
    );
  }

  async upsertIndustry(dto: UpsertCompanyIndustryDto) {
    const payload = {
      name: dto.name,
      code: dto.code?.trim() || this.slugify(dto.name),
      description: dto.description,
      icon: dto.icon,
      color: dto.color,
      parentId: dto.parentId,
      metadata: dto.metadata ? this.toJsonValue(dto.metadata) : Prisma.JsonNull,
    };
    if (dto.id) {
      return this.prisma.companyIndustry.update({
        where: { id: dto.id },
        data: payload,
      });
    }
    return this.prisma.companyIndustry.create({
      data: payload,
    });
  }

  async listTypes() {
    return this.prisma.companyType.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async upsertType(dto: UpsertCompanyTypeDto) {
    const payload = {
      name: dto.name,
      code: dto.code?.trim() || this.slugify(dto.name),
      description: dto.description,
      category: dto.category,
      requiredDocuments: dto.requiredDocuments ?? undefined,
      config: dto.config ? this.toJsonValue(dto.config) : Prisma.JsonNull,
    };
    if (dto.id) {
      return this.prisma.companyType.update({
        where: { id: dto.id },
        data: payload,
      });
    }
    return this.prisma.companyType.create({
      data: payload,
    });
  }

  async listMine(userId: string) {
    const companies = await this.prisma.company.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: companyInclude,
      orderBy: { createdAt: 'desc' },
    });
    const stats = this.calculateDashboardStats(companies);
    return {
      stats,
      companies: await Promise.all(
        companies.map((company) => this.serializeCompany(company, userId)),
      ),
    };
  }

  async listDirectory(query: CompanyDirectoryQueryDto) {
    const page = Math.max(query.page ?? 1, 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 20, 5), 50);
    const where: Prisma.CompanyWhereInput = {
      status: CompanyStatus.ACTIVE,
      visibility: CompanyVisibility.PUBLIC,
    };
    if (query.typeId) {
      where.typeId = query.typeId;
    }
    if (query.industryId) {
      where.industryId = query.industryId;
    }
    if (query.category) {
      where.category = query.category as CompanyCategory;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        include: companyInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      pageCount: Math.max(Math.ceil(total / pageSize), 1),
      items: await Promise.all(
        items.map((company) => this.serializeCompany(company)),
      ),
    };
  }

  async resolveCompanies(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter((id) => id?.trim())));
    if (!uniqueIds.length) {
      return [];
    }
    const companies = await this.prisma.company.findMany({
      where: {
        id: { in: uniqueIds },
        status: CompanyStatus.ACTIVE,
        visibility: CompanyVisibility.PUBLIC,
      },
      include: companyInclude,
    });
    return Promise.all(
      companies.map((company) => this.serializeCompany(company)),
    );
  }

  async getCompanyDetail(id: string, viewerId?: string | null) {
    const company = await this.findCompanyOrThrow(id);
    if (!this.canViewCompany(company, viewerId)) {
      throw new ForbiddenException(
        'No permission to view this company information',
      );
    }
    return this.serializeCompany(company, viewerId ?? undefined);
  }

  async createApplication(userId: string, dto: CreateCompanyApplicationDto) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_WORKFLOW_DEFINITION,
    );
    const type = await this.resolveCompanyType(dto.typeId, dto.typeCode);
    const industry = await this.resolveIndustry(
      dto.industryId,
      dto.industryCode,
    );
    const legalRepresentativeId = dto.legalRepresentativeId ?? userId;
    const legalRepresentative = await this.prisma.user.findUnique({
      where: { id: legalRepresentativeId },
      select: {
        id: true,
        name: true,
        profile: {
          select: {
            displayName: true,
          },
        },
      },
    });
    if (!legalRepresentative) {
      throw new BadRequestException('Legal representative user not found');
    }
    const slug = await this.generateUniqueSlug(dto.name);
    const workflowCode = type?.defaultWorkflow ?? DEFAULT_COMPANY_WORKFLOW_CODE;

    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        slug,
        summary: dto.summary,
        description: dto.description,
        typeId: type?.id ?? null,
        industryId: industry?.id ?? null,
        category: dto.category ?? type?.category ?? undefined,
        isIndividualBusiness: dto.isIndividualBusiness ?? false,
        legalRepresentativeId,
        legalNameSnapshot:
          legalRepresentative.profile?.displayName ??
          legalRepresentative.name ??
          undefined,
        workflowDefinitionCode: workflowCode,
        status: CompanyStatus.PENDING_REVIEW,
        visibility: CompanyVisibility.PRIVATE,
        createdById: userId,
        updatedById: userId,
        lastActiveAt: new Date(),
      },
    });

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: workflowCode,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: dto.name,
        typeCode: type?.code,
        industryCode: industry?.code,
        category: dto.category ?? type?.category,
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        typeId: type?.id,
        industryId: industry?.id,
        status: CompanyApplicationStatus.SUBMITTED,
        payload: this.toJsonValue(dto),
        workflowInstanceId: workflowInstance.id,
      },
    });

    const ownerPosition = await this.resolvePosition('owner');
    const legalPosition = await this.resolvePosition('legal_person');

    await this.prisma.company.update({
      where: { id: company.id },
      data: {
        workflowInstanceId: workflowInstance.id,
        workflowState: workflowInstance.currentState,
        members: {
          createMany: {
            data: [
              {
                userId,
                role: CompanyMemberRole.OWNER,
                title: '公司持有者',
                isPrimary: true,
                positionCode: ownerPosition?.code,
              },
              {
                userId: legalRepresentativeId,
                role: CompanyMemberRole.LEGAL_PERSON,
                title: '法定代表人',
                isPrimary: true,
                positionCode: legalPosition?.code,
              },
            ],
            skipDuplicates: true,
          },
        },
      },
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: application.id,
        actorId: userId,
        actionKey: 'submit',
        actionLabel: '提交申请',
        resultState: workflowInstance.currentState,
        payload: this.toJsonValue(dto),
      },
    });

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteAction(company.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: { workflowInstanceId: workflowInstance.id },
      });
      await this.adminExecuteAction(company.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: { workflowInstanceId: workflowInstance.id },
      });
    }

    const withRelations = await this.findCompanyOrThrow(company.id);
    return this.serializeCompany(withRelations, userId);
  }

  async createDeregistrationApplication(
    companyId: string,
    userId: string,
    dto: CompanyDeregistrationApplyDto,
  ) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_DEFINITION,
    );
    await this.assertOwnerOrLegal(companyId, userId);
    const company = await this.findCompanyOrThrow(companyId);
    if (
      company.status !== CompanyStatus.ACTIVE &&
      company.status !== CompanyStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        'Company is not eligible for deregistration',
      );
    }
    const existing = await this.prisma.companyApplication.findFirst({
      where: {
        companyId,
        status: {
          in: [
            CompanyApplicationStatus.SUBMITTED,
            CompanyApplicationStatus.UNDER_REVIEW,
            CompanyApplicationStatus.NEEDS_CHANGES,
          ],
        },
        workflowInstance: {
          definition: { code: DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE },
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Deregistration request already submitted');
    }

    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
      targetType: 'company',
      targetId: company.id,
      createdById: userId,
      context: {
        name: company.name,
      },
    });

    const application = await this.prisma.companyApplication.create({
      data: {
        companyId: company.id,
        applicantId: userId,
        status: CompanyApplicationStatus.SUBMITTED,
        payload: this.toJsonValue({
          reason: dto.reason ?? null,
        }),
        workflowInstanceId: workflowInstance.id,
      },
    });

    await this.prisma.company.update({
      where: { id: company.id },
      data: {
        workflowInstanceId: workflowInstance.id,
        workflowDefinitionCode: DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
        workflowState: workflowInstance.currentState,
        updatedById: userId,
      },
    });

    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: application.id,
        actorId: userId,
        actionKey: 'submit_deregistration',
        actionLabel: '提交注销申请',
        resultState: workflowInstance.currentState,
        comment: dto.reason ?? undefined,
        payload: this.toJsonValue({ reason: dto.reason ?? null }),
      },
    });

    const settings = await this.getCompanyApplicationSettings(
      DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
    );
    if (settings.autoApprove) {
      const systemUser = await this.resolveSystemUser();
      await this.adminExecuteAction(company.id, systemUser.id, {
        actionKey: 'route_to_review',
        comment: 'Auto approval enabled',
        payload: { workflowInstanceId: workflowInstance.id },
      });
      await this.adminExecuteAction(company.id, systemUser.id, {
        actionKey: 'approve',
        comment: 'Auto approval enabled',
        payload: { workflowInstanceId: workflowInstance.id },
      });
    }

    const refreshed = await this.findCompanyOrThrow(company.id);
    return this.serializeCompany(refreshed, userId);
  }

  async updateCompanyAsMember(
    companyId: string,
    userId: string,
    dto: UpdateCompanyProfileDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
    const industry = await this.resolveIndustry(
      dto.industryId,
      dto.industryCode,
      true,
    );
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        summary: dto.summary,
        description: dto.description,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        contactAddress: dto.contactAddress,
        homepageUrl: dto.homepageUrl,
        industryId: industry?.id,
        extra: dto.extra ? this.toJsonValue(dto.extra) : Prisma.JsonNull,
        updatedById: userId,
      },
      include: companyInclude,
    });
    return this.serializeCompany(updated, userId);
  }

  async inviteMember(
    companyId: string,
    actorId: string,
    dto: CompanyMemberInviteDto,
  ) {
    await this.assertMemberPermission(companyId, actorId, 'MANAGE_MEMBERS');
    const role = dto.role ?? CompanyMemberRole.MEMBER;
    if (!INVITEABLE_MEMBER_ROLES.includes(role)) {
      throw new BadRequestException('Disallowed member role');
    }
    const company = await this.findCompanyOrThrow(companyId);
    const settings = this.parseCompanySettings(company.settings ?? null);
    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!targetUser) {
      throw new BadRequestException('Invalid member user');
    }
    const existingMember = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId: dto.userId,
      },
    });
    if (existingMember) {
      throw new BadRequestException('This user is already a member');
    }
    const position = await this.resolvePosition(dto.positionCode ?? 'staff');
    const basePermissions = this.resolvePositionPermissions(
      settings,
      position?.code ?? null,
    );
    await this.prisma.companyMember.create({
      data: {
        companyId,
        userId: dto.userId,
        role,
        title: dto.title,
        positionCode: position?.code,
        permissions: basePermissions,
      },
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        lastActiveAt: new Date(),
      },
    });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, actorId);
  }

  async joinCompany(
    companyId: string,
    userId: string,
    dto: CompanyMemberJoinDto,
  ) {
    const company = await this.findCompanyOrThrow(companyId);
    if (company.status !== CompanyStatus.ACTIVE) {
      throw new BadRequestException('Can only join active entities');
    }
    const settings = this.parseCompanySettings(company.settings ?? null);
    const existingMember = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId,
      },
    });
    if (existingMember) {
      throw new BadRequestException('You are already a member of this entity');
    }
    const position = await this.resolvePosition(dto.positionCode ?? 'staff');
    const joinPolicy = this.resolveJoinPolicy(settings);
    const basePermissions = this.resolvePositionPermissions(
      settings,
      position?.code ?? null,
    );
    const metadata =
      joinPolicy === 'REVIEW'
        ? this.toJsonValue(
            this.buildMemberMetadata(null, {
              joinStatus: 'PENDING',
              requestedPositionCode: position?.code ?? null,
              requestedTitle: dto.title ?? null,
            }),
          )
        : Prisma.JsonNull;
    await this.prisma.companyMember.create({
      data: {
        companyId,
        userId,
        role: CompanyMemberRole.MEMBER,
        title: joinPolicy === 'AUTO' ? dto.title : null,
        positionCode: joinPolicy === 'AUTO' ? position?.code : null,
        permissions: basePermissions,
        metadata,
      },
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        lastActiveAt: joinPolicy === 'AUTO' ? new Date() : undefined,
      },
    });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, userId);
  }

  async approveJoinRequest(
    companyId: string,
    userId: string,
    dto: CompanyMemberApprovalDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'MANAGE_MEMBERS');
    const company = await this.findCompanyOrThrow(companyId);
    const settings = this.parseCompanySettings(company.settings ?? null);
    const member = await this.prisma.companyMember.findFirst({
      where: { id: dto.memberId, companyId },
    });
    if (!member) {
      throw new NotFoundException('Pending member not found');
    }
    if (this.resolveJoinStatus(member.metadata) !== 'PENDING') {
      throw new BadRequestException('Member is not pending approval');
    }
    const requestedPositionCode =
      (member.metadata as { requestedPositionCode?: string })
        ?.requestedPositionCode ?? null;
    const position = await this.resolvePosition(
      dto.positionCode ?? requestedPositionCode ?? 'staff',
    );
    const permissions = this.resolvePositionPermissions(
      settings,
      position?.code ?? null,
    );
    await this.prisma.companyMember.update({
      where: { id: member.id },
      data: {
        positionCode: position?.code ?? null,
        title: dto.title ?? member.title ?? null,
        permissions,
        metadata: this.toJsonValue(
          this.buildMemberMetadata(member.metadata, {
            joinStatus: 'ACTIVE',
          }),
        ),
      },
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: { lastActiveAt: new Date() },
    });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, userId);
  }

  async rejectJoinRequest(
    companyId: string,
    userId: string,
    dto: CompanyMemberRejectDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'MANAGE_MEMBERS');
    const member = await this.prisma.companyMember.findFirst({
      where: { id: dto.memberId, companyId },
    });
    if (!member) {
      throw new NotFoundException('Pending member not found');
    }
    if (this.resolveJoinStatus(member.metadata) !== 'PENDING') {
      throw new BadRequestException('Member is not pending approval');
    }
    await this.prisma.companyMember.delete({ where: { id: member.id } });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, userId);
  }

  async updateMember(
    companyId: string,
    userId: string,
    dto: CompanyMemberUpdateDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'MANAGE_MEMBERS');
    const member = await this.prisma.companyMember.findFirst({
      where: { id: dto.memberId, companyId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    const position = dto.positionCode
      ? await this.resolvePosition(dto.positionCode)
      : null;
    await this.prisma.companyMember.update({
      where: { id: member.id },
      data: {
        positionCode: position?.code ?? null,
        title: dto.title ?? null,
        permissions: dto.permissions ?? member.permissions ?? [],
      },
    });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, userId);
  }

  async updateCompanySettings(
    companyId: string,
    userId: string,
    dto: CompanySettingsDto,
  ) {
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
    const company = await this.findCompanyOrThrow(companyId);
    const currentSettings = this.parseCompanySettings(company.settings ?? null);
    const merged = this.buildCompanySettings(currentSettings, {
      joinPolicy: dto.joinPolicy,
      positionPermissions: dto.positionPermissions ?? {},
    });
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        settings: this.toJsonValue(merged),
        updatedById: userId,
      },
      include: companyInclude,
    });
    return this.serializeCompany(updated, userId);
  }

  async updateCompanyLogo(
    companyId: string,
    userId: string,
    file: StoredUploadedFile,
  ) {
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    const company = await this.findCompanyOrThrow(companyId);
    const attachment = await this.attachmentsService.uploadAttachment(
      userId,
      file,
      {
        name: `${company.slug}-logo`,
        isPublic: true,
        metadata: {
          scope: 'company-logo',
          companyId,
        },
      },
    );
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        logoAttachmentId: attachment.id,
        updatedById: userId,
      },
      include: companyInclude,
    });
    if (
      company.logoAttachmentId &&
      company.logoAttachmentId !== attachment.id
    ) {
      try {
        await this.attachmentsService.deleteAttachment(
          company.logoAttachmentId,
        );
      } catch (error) {
        this.logger.warn(`Failed to clean old logo: ${error}`);
      }
    }
    return this.serializeCompany(updated, userId);
  }

  async updateCompanyLogoStream(
    companyId: string,
    userId: string,
    file: UploadedStreamFile,
  ) {
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    const company = await this.findCompanyOrThrow(companyId);

    const attachment = await this.attachmentsService.uploadAttachmentStream(
      userId,
      file,
      {
        name: `${company.slug}-logo`,
        isPublic: true,
        metadata: {
          scope: 'company-logo',
          companyId,
        },
      },
    );

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        logoAttachmentId: attachment.id,
        updatedById: userId,
      },
      include: companyInclude,
    });

    if (
      company.logoAttachmentId &&
      company.logoAttachmentId !== attachment.id
    ) {
      try {
        await this.attachmentsService.deleteAttachment(
          company.logoAttachmentId,
        );
      } catch (error) {
        this.logger.warn(`Failed to clean old logo: ${error}`);
      }
    }

    return this.serializeCompany(updated, userId);
  }

  async updateCompanyLogoAttachment(
    companyId: string,
    userId: string,
    attachmentId: string,
  ) {
    await this.assertMemberPermission(companyId, userId, 'EDIT_COMPANY');
    const attachment =
      await this.attachmentsService.getAttachmentOrThrow(attachmentId);
    if (attachment.owner?.id !== userId) {
      throw new ForbiddenException('Attachment is not owned by the requester');
    }
    if (!attachment.isPublic) {
      throw new BadRequestException('Attachment must be public');
    }
    const company = await this.findCompanyOrThrow(companyId);
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        logoAttachmentId: attachment.id,
        updatedById: userId,
      },
      include: companyInclude,
    });
    if (
      company.logoAttachmentId &&
      company.logoAttachmentId !== attachment.id
    ) {
      try {
        await this.attachmentsService.deleteAttachment(
          company.logoAttachmentId,
        );
      } catch (error) {
        this.logger.warn(`Failed to clean old logo: ${error}`);
      }
    }
    return this.serializeCompany(updated, userId);
  }

  async updateCompanyAsAdmin(
    companyId: string,
    userId: string,
    dto: AdminUpdateCompanyDto,
  ) {
    const type = await this.resolveCompanyType(dto.typeId, dto.typeCode, true);
    const industry = await this.resolveIndustry(
      dto.industryId,
      dto.industryCode,
      true,
    );
    if (dto.logoAttachmentId) {
      await this.attachmentsService.getAttachmentOrThrow(dto.logoAttachmentId);
    }
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: dto.name,
        summary: dto.summary,
        description: dto.description,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        contactAddress: dto.contactAddress,
        homepageUrl: dto.homepageUrl,
        industryId: industry?.id ?? undefined,
        typeId: type?.id ?? undefined,
        category: dto.category,
        extra: dto.extra ? this.toJsonValue(dto.extra) : Prisma.JsonNull,
        status: dto.status,
        visibility: dto.visibility,
        highlighted: dto.highlighted,
        recommendationScore: dto.recommendationScore,
        logoAttachmentId: dto.logoAttachmentId ?? undefined,
        updatedById: userId,
      },
      include: companyInclude,
    });
    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: updated.id,
        actorId: userId,
        actionKey: 'admin_update',
        actionLabel: '管理员更新公司信息',
        comment: dto.auditReason ?? '管理员更新公司信息',
      },
    });
    return this.serializeCompany(updated, userId);
  }

  async createCompanyAsAdmin(actorId: string, dto: AdminCreateCompanyDto) {
    await this.workflowService.ensureDefinition(
      DEFAULT_COMPANY_WORKFLOW_DEFINITION,
    );
    const type = await this.resolveCompanyType(dto.typeId, dto.typeCode, true);
    const industry = await this.resolveIndustry(
      dto.industryId,
      dto.industryCode,
      true,
    );
    const ownerId = dto.ownerId ?? actorId;
    const legalRepresentativeId = dto.legalRepresentativeId ?? ownerId;
    const ownerExists = await this.prisma.user.findUnique({
      where: { id: ownerId },
    });
    if (!ownerExists) {
      throw new BadRequestException('Invalid owner');
    }
    const legalRepresentative = await this.prisma.user.findUnique({
      where: { id: legalRepresentativeId },
      select: {
        id: true,
        name: true,
        profile: { select: { displayName: true } },
      },
    });
    if (!legalRepresentative) {
      throw new BadRequestException('Invalid legal representative user');
    }
    const slug = await this.generateUniqueSlug(dto.name);
    const workflowCode = DEFAULT_COMPANY_WORKFLOW_CODE;
    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        slug,
        summary: dto.summary,
        description: dto.description,
        typeId: type?.id ?? null,
        industryId: industry?.id ?? null,
        category: dto.category ?? type?.category ?? CompanyCategory.ENTERPRISE,
        isIndividualBusiness: dto.isIndividualBusiness ?? false,
        legalRepresentativeId,
        legalNameSnapshot:
          legalRepresentative.profile?.displayName ??
          legalRepresentative.name ??
          undefined,
        workflowDefinitionCode: workflowCode,
        status: dto.status ?? CompanyStatus.ACTIVE,
        visibility: dto.visibility ?? CompanyVisibility.PUBLIC,
        createdById: ownerId,
        updatedById: actorId,
        lastActiveAt: new Date(),
        approvedAt: new Date(),
        activatedAt: new Date(),
        recommendationScore: 0,
      },
    });
    const workflowInstance = await this.workflowService.createInstance({
      definitionCode: workflowCode,
      targetType: 'company',
      targetId: company.id,
      createdById: actorId,
      context: {
        name: dto.name,
        typeCode: type?.code,
        industryCode: industry?.code,
      },
    });
    await this.prisma.workflowInstance.update({
      where: { id: workflowInstance.id },
      data: {
        currentState: 'approved',
        status: WorkflowInstanceStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
    await this.prisma.company.update({
      where: { id: company.id },
      data: {
        workflowInstanceId: workflowInstance.id,
        workflowState: 'approved',
      },
    });
    const ownerPosition = await this.resolvePosition('owner');
    const legalPosition = await this.resolvePosition('legal_person');
    await this.prisma.companyMember.createMany({
      data: [
        {
          companyId: company.id,
          userId: ownerId,
          role: CompanyMemberRole.OWNER,
          title: '公司持有者',
          isPrimary: true,
          positionCode: ownerPosition?.code,
        },
        {
          companyId: company.id,
          userId: legalRepresentativeId,
          role: CompanyMemberRole.LEGAL_PERSON,
          title: '法定代表人',
          isPrimary: true,
          positionCode: legalPosition?.code,
        },
      ],
      skipDuplicates: true,
    });
    const refreshed = await this.findCompanyOrThrow(company.id);
    return this.serializeCompany(refreshed);
  }

  async adminList(query: AdminCompanyListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CompanyWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.typeId) {
      where.typeId = query.typeId;
    }
    if (query.industryId) {
      where.industryId = query.industryId;
    }
    if (query.isIndividualBusiness !== undefined) {
      where.isIndividualBusiness = query.isIndividualBusiness;
    }
    if (query.search) {
      const keyword = query.search.trim();
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { summary: { contains: keyword, mode: 'insensitive' } },
        { slug: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: companyInclude,
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: await Promise.all(
        items.map((company) => this.serializeCompany(company)),
      ),
    };
  }

  async adminGet(companyId: string) {
    const company = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(company);
  }

  async listApplications(query: CompanyApplicationListQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.CompanyApplicationWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.workflowCode) {
      where.workflowInstance = {
        definition: {
          code: query.workflowCode,
        },
      };
    }
    if (query.search) {
      const keyword = query.search.trim();
      where.OR = [
        {
          notes: { contains: keyword, mode: 'insensitive' },
        },
        {
          company: {
            name: { contains: keyword, mode: 'insensitive' },
          },
        },
        {
          applicant: {
            name: { contains: keyword, mode: 'insensitive' },
          },
        },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.companyApplication.count({ where }),
      this.prisma.companyApplication.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: {
            include: {
              type: true,
              industry: true,
            },
          },
          applicant: {
            select: {
              id: true,
              name: true,
              email: true,
              profile: {
                select: {
                  displayName: true,
                },
              },
            },
          },
          workflowInstance: {
            include: {
              definition: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      pageCount: Math.max(Math.ceil(total / pageSize), 1),
      items,
    };
  }

  async getCompanyApplicationSettings(
    workflowCode?: string,
  ): Promise<CompanyApplicationSettingsDto> {
    const entry = await this.configService.getEntry(
      COMPANY_CONFIG_NAMESPACE,
      this.resolveAutoApproveKey(workflowCode),
    );
    const value = entry?.value;
    const autoApprove =
      typeof value === 'boolean'
        ? value
        : typeof value === 'object' && value !== null && 'autoApprove' in value
          ? Boolean((value as { autoApprove?: boolean }).autoApprove)
          : false;
    return { autoApprove };
  }

  async updateCompanyApplicationSettings(
    autoApprove: boolean,
    userId: string,
    workflowCode?: string,
  ): Promise<CompanyApplicationSettingsDto> {
    const namespace = await this.configService.ensureNamespaceByKey(
      COMPANY_CONFIG_NAMESPACE,
      {
        name: '工商系统配置',
        description: '工商系统全局设置',
      },
    );
    const entry = await this.configService.getEntry(
      COMPANY_CONFIG_NAMESPACE,
      this.resolveAutoApproveKey(workflowCode),
    );
    if (entry) {
      await this.configService.updateEntry(
        entry.id,
        { value: autoApprove },
        userId,
      );
    } else {
      const description =
        workflowCode === DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE
          ? '公司注销自动审批'
          : '公司申请自动审批';
      await this.configService.createEntry(
        namespace.id,
        {
          key: this.resolveAutoApproveKey(workflowCode),
          value: autoApprove,
          description,
        },
        userId,
      );
    }
    return { autoApprove };
  }

  async adminExecuteAction(
    companyId: string,
    actorId: string,
    dto: CompanyActionDto,
  ) {
    const company = await this.findCompanyOrThrow(companyId);
    const payload = dto.payload as
      | { workflowInstanceId?: string; [key: string]: unknown }
      | undefined;
    const instanceId =
      payload?.workflowInstanceId ?? company.workflowInstanceId;
    if (!instanceId) {
      throw new BadRequestException(
        'This company is not yet associated with a process instance',
      );
    }
    const sanitizedPayload =
      payload && 'workflowInstanceId' in payload
        ? Object.fromEntries(
            Object.entries(payload).filter(
              ([key]) => key !== 'workflowInstanceId',
            ),
          )
        : dto.payload;
    return this.executeWorkflowAction(
      company,
      actorId,
      { ...dto, payload: sanitizedPayload },
      instanceId,
    );
  }

  async adminExecuteApplicationAction(
    applicationId: string,
    actorId: string,
    dto: CompanyActionDto,
  ) {
    const application = await this.prisma.companyApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        companyId: true,
        workflowInstanceId: true,
      },
    });
    if (!application?.companyId || !application.workflowInstanceId) {
      throw new BadRequestException('Application is not linked to a company');
    }
    const company = await this.findCompanyOrThrow(application.companyId);
    return this.executeWorkflowAction(
      company,
      actorId,
      dto,
      application.workflowInstanceId,
      application.id,
    );
  }

  async deleteCompanyAsAdmin(companyId: string, userId: string) {
    await this.findCompanyOrThrow(companyId);
    await this.prisma.company.delete({ where: { id: companyId } });
    this.logger.log(`Company ${companyId} deleted by ${userId}`);
    return { success: true };
  }

  private async applyWorkflowEffects(
    company: CompanyWithRelations,
    transition: WorkflowTransitionResult,
  ) {
    const companyStatus = transition.nextState.business?.companyStatus as
      | CompanyStatus
      | undefined;
    const applicationStatus = transition.nextState.business
      ?.applicationStatus as CompanyApplicationStatus | undefined;
    await this.prisma.company.update({
      where: { id: company.id },
      data: {
        workflowState: transition.nextState.key,
        status: companyStatus ?? undefined,
        visibility:
          companyStatus === CompanyStatus.ACTIVE
            ? CompanyVisibility.PUBLIC
            : undefined,
        lastActiveAt:
          companyStatus === CompanyStatus.ACTIVE ? new Date() : undefined,
        approvedAt:
          companyStatus === CompanyStatus.ACTIVE
            ? new Date()
            : company.approvedAt,
        archivedAt:
          companyStatus === CompanyStatus.ARCHIVED
            ? new Date()
            : company.archivedAt,
      },
    });
    if (applicationStatus) {
      await this.prisma.companyApplication.updateMany({
        where: {
          companyId: company.id,
          workflowInstanceId: transition.instance.id,
        },
        data: { status: applicationStatus, resolvedAt: new Date() },
      });
    }
  }

  private async executeWorkflowAction(
    company: CompanyWithRelations,
    actorId: string,
    dto: CompanyActionDto,
    instanceId: string,
    applicationId?: string,
  ) {
    const transition = await this.workflowService.performAction({
      instanceId,
      actionKey: dto.actionKey,
      actorId,
      actorRoles: ['ADMIN'],
      comment: dto.comment,
      payload: dto.payload,
    });
    await this.applyWorkflowEffects(company, transition);
    const resolvedApplicationId =
      applicationId ??
      company.applications.find(
        (entry) => entry.workflowInstanceId === transition.instance.id,
      )?.id;
    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: resolvedApplicationId,
        actorId,
        actionKey: transition.action.key,
        actionLabel: transition.action.label,
        resultState: transition.nextState.key,
        comment: dto.comment,
        payload: dto.payload ? this.toJsonValue(dto.payload) : Prisma.JsonNull,
      },
    });
    const updated = await this.findCompanyOrThrow(company.id);
    return this.serializeCompany(updated);
  }

  private canViewCompany(
    company: CompanyWithRelations,
    viewerId?: string | null,
  ) {
    if (viewerId) {
      const isMember = company.members.some(
        (member) => member.userId === viewerId,
      );
      if (isMember) return true;
    }
    if (company.visibility === CompanyVisibility.PUBLIC) {
      return company.status !== CompanyStatus.REJECTED;
    }
    return false;
  }

  private pickMember<T extends { role: CompanyMemberRole }>(
    members: T[],
    role: CompanyMemberRole,
  ) {
    return members.find((member) => member.role === role);
  }

  private async assertMemberPermission(
    companyId: string,
    userId: string,
    permission: 'MANAGE_MEMBERS' | 'EDIT_COMPANY',
  ) {
    const member = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId,
      },
    });
    if (!member) {
      throw new ForbiddenException('Not a company member');
    }
    if (this.resolveJoinStatus(member.metadata) !== 'ACTIVE') {
      throw new ForbiddenException('Pending members cannot manage company');
    }
    if (
      member.role === CompanyMemberRole.OWNER ||
      member.role === CompanyMemberRole.LEGAL_PERSON
    ) {
      return;
    }
    if (member.permissions?.includes(permission)) {
      return;
    }
    throw new ForbiddenException('Insufficient member permissions');
  }

  private async resolveCompanyType(
    typeId?: string,
    typeCode?: string,
    optional = false,
  ) {
    if (!typeId && !typeCode) {
      return null;
    }
    const type = await this.prisma.companyType.findFirst({
      where: {
        OR: [
          typeId ? { id: typeId } : undefined,
          typeCode ? { code: typeCode } : undefined,
        ].filter(Boolean) as Prisma.CompanyTypeWhereInput[],
      },
    });
    if (!type && !optional) {
      throw new BadRequestException('Company type not found');
    }
    return type;
  }

  private async resolveIndustry(
    industryId?: string,
    industryCode?: string,
    optional = false,
  ) {
    if (!industryId && !industryCode) {
      return null;
    }
    const industry = await this.prisma.companyIndustry.findFirst({
      where: {
        OR: [
          industryId ? { id: industryId } : undefined,
          industryCode ? { code: industryCode } : undefined,
        ].filter(Boolean) as Prisma.CompanyIndustryWhereInput[],
      },
    });
    if (!industry && !optional) {
      throw new BadRequestException('Industry category not found');
    }
    return industry;
  }

  private async findCompanyOrThrow(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: companyInclude,
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  private resolveAutoApproveKey(workflowCode?: string) {
    return workflowCode === DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE
      ? 'auto_approve_deregistration'
      : COMPANY_CONFIG_AUTO_APPROVE_KEY;
  }

  private async assertOwnerOrLegal(companyId: string, userId: string) {
    const member = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId,
        role: {
          in: [CompanyMemberRole.OWNER, CompanyMemberRole.LEGAL_PERSON],
        },
      },
    });
    if (!member) {
      throw new ForbiddenException(
        'Only company owners can request deregistration',
      );
    }
    if (this.resolveJoinStatus(member.metadata) !== 'ACTIVE') {
      throw new ForbiddenException(
        'Pending members cannot request deregistration',
      );
    }
  }

  private async resolveSystemUser() {
    let systemUser = await this.prisma.user.findFirst({
      where: { email: 'system@hydroline.local' },
      select: { id: true },
    });
    if (!systemUser) {
      systemUser = await this.prisma.user.create({
        data: {
          email: 'system@hydroline.local',
          name: 'System',
        },
        select: { id: true },
      });
    }
    return systemUser;
  }

  private async generateUniqueSlug(name: string) {
    const base = this.slugify(name);
    for (let i = 0; i < 20; i += 1) {
      const candidate = i === 0 ? base : `${base}-${i}`;
      const exists = await this.prisma.company.findUnique({
        where: { slug: candidate },
      });
      if (!exists) {
        return candidate;
      }
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  private slugify(input: string) {
    const normalized = input
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized.length > 0
      ? normalized
      : `company-${randomUUID().slice(0, 6)}`;
  }

  private parseCompanySettings(
    value: Prisma.JsonValue | null,
  ): CompanySettings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const settings = value as Record<string, unknown>;
    const joinPolicy = settings.joinPolicy;
    const positionPermissions = settings.positionPermissions;
    return {
      joinPolicy: joinPolicy === 'AUTO' ? 'AUTO' : 'REVIEW',
      positionPermissions:
        typeof positionPermissions === 'object' && positionPermissions
          ? (positionPermissions as Record<string, string[]>)
          : {},
    };
  }

  private buildCompanySettings(
    existing: CompanySettings,
    next: CompanySettings,
  ) {
    return {
      ...existing,
      ...next,
      positionPermissions: {
        ...(existing.positionPermissions ?? {}),
        ...(next.positionPermissions ?? {}),
      },
    };
  }

  private resolveJoinPolicy(settings: CompanySettings | null | undefined) {
    return settings?.joinPolicy === 'AUTO' ? 'AUTO' : 'REVIEW';
  }

  private resolvePositionPermissions(
    settings: CompanySettings | null | undefined,
    positionCode?: string | null,
  ) {
    if (!positionCode) return [];
    return settings?.positionPermissions?.[positionCode] ?? [];
  }

  private resolveJoinStatus(metadata: Prisma.JsonValue | null) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return 'ACTIVE';
    }
    const status = (metadata as { joinStatus?: string }).joinStatus;
    return status === 'PENDING' ? 'PENDING' : 'ACTIVE';
  }

  private buildMemberMetadata(
    metadata: Prisma.JsonValue | null,
    patch: Record<string, unknown>,
  ) {
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};
    return {
      ...base,
      ...patch,
    };
  }

  private async serializeCompany(
    company: CompanyWithRelations,
    viewerId?: string,
  ) {
    const settings = this.parseCompanySettings(company.settings ?? null);
    const viewerMember = viewerId
      ? company.members.find(
          (member) =>
            member.userId === viewerId &&
            this.resolveJoinStatus(member.metadata) === 'ACTIVE',
        )
      : undefined;
    const isOwner =
      viewerMember?.role === CompanyMemberRole.OWNER ||
      viewerMember?.role === CompanyMemberRole.LEGAL_PERSON;
    const memberPermissions = viewerMember?.permissions ?? [];
    const canEdit =
      Boolean(isOwner) ||
      COMPANY_MEMBER_WRITE_ROLES.includes(viewerMember?.role ?? 'MEMBER') ||
      memberPermissions.includes('EDIT_COMPANY');
    const canManageMembers =
      Boolean(isOwner) || memberPermissions.includes('MANAGE_MEMBERS');
    const canViewDashboard =
      Boolean(isOwner) ||
      memberPermissions.includes('VIEW_DASHBOARD') ||
      memberPermissions.includes('MANAGE_MEMBERS') ||
      memberPermissions.includes('EDIT_COMPANY');

    const attachmentUrlMap =
      await this.attachmentsService.resolvePublicUrlsByIds([
        company.logoAttachmentId,
        company.legalRepresentative?.avatarAttachmentId,
        ...company.members.map((member) => member.user?.avatarAttachmentId),
      ]);

    const logoUrl = company.logoAttachmentId
      ? (attachmentUrlMap.get(company.logoAttachmentId) ?? null)
      : null;

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      summary: company.summary,
      description: company.description,
      logoAttachmentId: company.logoAttachmentId,
      logoUrl,
      status: company.status,
      visibility: company.visibility,
      category: company.category,
      recommendationScore: company.recommendationScore,
      highlighted: company.highlighted,
      joinPolicy: this.resolveJoinPolicy(settings),
      positionPermissions: settings.positionPermissions ?? {},
      workflow: company.workflowInstance
        ? {
            id: company.workflowInstance.id,
            state:
              company.workflowState ?? company.workflowInstance.currentState,
            definitionCode: company.workflowInstance.definitionCode,
            definitionName: company.workflowInstance.definition?.name,
          }
        : null,
      members: company.members.map((member) => ({
        id: member.id,
        role: member.role,
        title: member.title,
        joinStatus: this.resolveJoinStatus(member.metadata),
        requestedPositionCode: (
          member.metadata as { requestedPositionCode?: string }
        )?.requestedPositionCode,
        requestedTitle: (member.metadata as { requestedTitle?: string })
          ?.requestedTitle,
        permissions: member.permissions ?? [],
        isPrimary: member.isPrimary,
        user: member.user
          ? {
              id: member.user.id,
              name: member.user.name,
              email: member.user.email,
              displayName: member.user.profile?.displayName ?? null,
              avatarUrl: member.user.avatarAttachmentId
                ? (attachmentUrlMap.get(member.user.avatarAttachmentId) ?? null)
                : null,
            }
          : null,
        position: member.position
          ? {
              code: member.position.code,
              name: member.position.name,
              description: member.position.description ?? null,
              role: member.position.role,
            }
          : null,
      })),
      legalPerson: this.pickMember(
        company.members,
        CompanyMemberRole.LEGAL_PERSON,
      ),
      owners: company.members.filter(
        (member) => member.role === CompanyMemberRole.OWNER,
      ),
      type: company.type,
      industry: company.industry,
      policies: company.policies,
      auditTrail: company.auditRecords,
      applications: company.applications,
      lastActiveAt: company.lastActiveAt,
      approvedAt: company.approvedAt,
      contactEmail: company.contactEmail,
      contactPhone: company.contactPhone,
      contactAddress: company.contactAddress,
      homepageUrl: company.homepageUrl,
      permissions: {
        canEdit,
        canManageMembers,
        canViewDashboard,
      },
      availableActions: this.getAvailableActions(company),
    };
  }

  private getAvailableActions(company: CompanyWithRelations) {
    const instance = company.workflowInstance;
    if (!instance?.definition) {
      return [];
    }
    try {
      const config = this.workflowService.parseDefinitionConfig(
        instance.definition as WorkflowDefinitionWithConfig,
      );
      const stateKey = company.workflowState ?? instance.currentState;
      const state = config.states.find((entry) => entry.key === stateKey);
      if (!state) {
        return [];
      }
      return state.actions.map((action) => ({
        key: action.key,
        label: action.label,
        roles: action.roles ?? [],
      }));
    } catch (error) {
      this.logger.warn(`解析流程配置失败: ${error}`);
      return [];
    }
  }

  private calculateDashboardStats(companies: CompanyWithRelations[]) {
    const companyCount = companies.length;
    const individualBusinessCount = companies.filter(
      (company) => company.isIndividualBusiness,
    ).length;
    const memberCount = companies.reduce(
      (sum, company) =>
        sum +
        company.members.filter(
          (member) => this.resolveJoinStatus(member.metadata) === 'ACTIVE',
        ).length,
      0,
    );
    return {
      companyCount,
      individualBusinessCount,
      memberCount,
    };
  }

  private async ensureBaselineMetadata() {
    await Promise.all([
      this.ensureIndustries(),
      this.ensureTypes(),
      this.ensurePositions(),
    ]);
  }

  private async ensureIndustries() {
    await Promise.all(
      DEFAULT_INDUSTRIES.map((industry) =>
        this.prisma.companyIndustry.upsert({
          where: { code: industry.code },
          update: {
            name: industry.name,
            description: industry.description,
            isActive: true,
          },
          create: {
            ...industry,
            isActive: true,
          },
        }),
      ),
    );
  }

  private async ensureTypes() {
    await Promise.all(
      DEFAULT_COMPANY_TYPES.map((type) =>
        this.prisma.companyType.upsert({
          where: { code: type.code },
          update: {
            name: type.name,
            description: type.description,
            category: type.category,
          },
          create: {
            ...type,
          },
        }),
      ),
    );
  }

  private async ensurePositions() {
    await Promise.all(
      DEFAULT_POSITIONS.map((position) =>
        this.prisma.companyPosition.upsert({
          where: { code: position.code },
          update: {
            name: position.name,
            description: position.description,
            role: position.role,
          },
          create: {
            ...position,
          },
        }),
      ),
    );
  }

  private async resolvePosition(code?: string | null) {
    if (!code) {
      return null;
    }
    const position = await this.prisma.companyPosition.findUnique({
      where: { code },
    });
    if (!position) {
      throw new BadRequestException('Invalid position code');
    }
    return position;
  }

  private toJsonValue(value: unknown) {
    return value as Prisma.InputJsonValue;
  }
}
