import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  Company,
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
  CompanyMemberInviteDto,
  CompanyMemberJoinDto,
  CompanyRecommendationsQueryDto,
  CompanyUserSearchDto,
  CreateCompanyApplicationDto,
  UpdateCompanyProfileDto,
} from './dto/company.dto';
import {
  COMPANY_MEMBER_WRITE_ROLES,
  DEFAULT_COMPANY_WORKFLOW_CODE,
  DEFAULT_COMPANY_WORKFLOW_DEFINITION,
} from './company.constants';
import {
  CompanyApplicationListQueryDto,
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
  members: {
    include: {
      user: {
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
      position: true,
    },
  },
  policies: {
    orderBy: { createdAt: 'desc' },
  },
  auditRecords: {
    orderBy: { createdAt: 'desc' },
    take: 20,
  },
  applications: {
    orderBy: { submittedAt: 'desc' },
    take: 5,
  },
  workflowInstance: {
    include: { definition: true },
  },
});

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
            role: { in: COMPANY_MEMBER_WRITE_ROLES },
          },
        },
      },
      include: companyInclude,
      orderBy: { createdAt: 'desc' },
    });
    const stats = this.calculateDashboardStats(companies);
    return {
      stats,
      companies: companies.map((company) =>
        this.serializeCompany(company, userId),
      ),
    };
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

    const withRelations = await this.findCompanyOrThrow(company.id);
    return this.serializeCompany(withRelations, userId);
  }

  async updateCompanyAsMember(
    companyId: string,
    userId: string,
    dto: UpdateCompanyProfileDto,
  ) {
    await this.assertMember(companyId, userId);
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
    await this.assertMember(companyId, actorId);
    const role = dto.role ?? CompanyMemberRole.MEMBER;
    if (!INVITEABLE_MEMBER_ROLES.includes(role)) {
      throw new BadRequestException('Disallowed member role');
    }
    await this.findCompanyOrThrow(companyId);
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
    await this.prisma.companyMember.create({
      data: {
        companyId,
        userId: dto.userId,
        role,
        title: dto.title,
        positionCode: position?.code,
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
    await this.prisma.companyMember.create({
      data: {
        companyId,
        userId,
        role: CompanyMemberRole.MEMBER,
        title: dto.title,
        positionCode: position?.code,
      },
    });
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        lastActiveAt: new Date(),
      },
    });
    const refreshed = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(refreshed, userId);
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
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        summary: dto.summary,
        description: dto.description,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        contactAddress: dto.contactAddress,
        homepageUrl: dto.homepageUrl,
        industryId: industry?.id ?? undefined,
        typeId: type?.id ?? undefined,
        extra: dto.extra ? this.toJsonValue(dto.extra) : Prisma.JsonNull,
        status: dto.status,
        visibility: dto.visibility,
        highlighted: dto.highlighted,
        recommendationScore: dto.recommendationScore,
        updatedById: userId,
      },
      include: companyInclude,
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
      items: items.map((company) => this.serializeCompany(company)),
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

  async adminExecuteAction(
    companyId: string,
    actorId: string,
    dto: CompanyActionDto,
  ) {
    const company = await this.findCompanyOrThrow(companyId);
    if (!company.workflowInstanceId) {
      throw new BadRequestException(
        'This company is not yet associated with a process instance',
      );
    }
    const transition = await this.workflowService.performAction({
      instanceId: company.workflowInstanceId,
      actionKey: dto.actionKey,
      actorId,
      actorRoles: ['ADMIN'],
      comment: dto.comment,
      payload: dto.payload,
    });
    await this.applyWorkflowEffects(company, transition);
    await this.prisma.companyAuditRecord.create({
      data: {
        companyId: company.id,
        applicationId: company.applications[0]?.id,
        actorId,
        actionKey: transition.action.key,
        actionLabel: transition.action.label,
        resultState: transition.nextState.key,
        comment: dto.comment,
        payload: dto.payload ? this.toJsonValue(dto.payload) : Prisma.JsonNull,
      },
    });
    const updated = await this.findCompanyOrThrow(companyId);
    return this.serializeCompany(updated);
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

  private async assertMember(companyId: string, userId: string) {
    const member = await this.prisma.companyMember.findFirst({
      where: {
        companyId,
        userId,
        role: { in: COMPANY_MEMBER_WRITE_ROLES },
      },
    });
    if (!member) {
      throw new ForbiddenException(
        'Only company owner or legal representative can edit',
      );
    }
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

  private serializeCompany(company: CompanyWithRelations, viewerId?: string) {
    const canEdit = viewerId
      ? company.members.some(
          (member) =>
            member.userId === viewerId &&
            COMPANY_MEMBER_WRITE_ROLES.includes(member.role),
        )
      : false;
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      summary: company.summary,
      description: company.description,
      status: company.status,
      visibility: company.visibility,
      category: company.category,
      recommendationScore: company.recommendationScore,
      highlighted: company.highlighted,
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
        isPrimary: member.isPrimary,
        user: member.user
          ? {
              id: member.user.id,
              name: member.user.name,
              email: member.user.email,
              displayName: member.user.profile?.displayName ?? null,
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
        canManageMembers: canEdit,
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
      (sum, company) => sum + company.members.length,
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
