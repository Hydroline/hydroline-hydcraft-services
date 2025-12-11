import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  CompanyApplicationStatus,
  CompanyIndustry,
  CompanyMemberRole,
  CompanyStatus,
  CompanyType,
  CompanyVisibility,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import {
  AdminCompanyListQueryDto,
  AdminUpdateCompanyDto,
  CompanyActionDto,
  CompanyRecommendationsQueryDto,
  CreateCompanyApplicationDto,
  UpdateCompanyProfileDto,
} from './dto/company.dto';
import {
  COMPANY_MEMBER_WRITE_ROLES,
  DEFAULT_COMPANY_WORKFLOW_CODE,
  DEFAULT_COMPANY_WORKFLOW_DEFINITION,
} from './company.constants';
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
};

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowService: WorkflowService,
  ) {}

  async getMeta(): Promise<
    CompanyMetaResult & { memberWriteRoles: CompanyMemberRole[] }
  > {
    const [industries, types] = await this.prisma.$transaction([
      this.prisma.companyIndustry.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.companyType.findMany({
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      industries,
      types,
      memberWriteRoles: COMPANY_MEMBER_WRITE_ROLES,
    };
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

    return companies.map((company) => this.serializeCompany(company, userId));
  }

  async getCompanyDetail(id: string, viewerId?: string | null) {
    const company = await this.findCompanyOrThrow(id);
    if (!this.canViewCompany(company, viewerId)) {
      throw new ForbiddenException('没有权限查看该公司信息');
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
    const slug = await this.generateUniqueSlug(dto.name);
    const workflowCode =
      dto.workflowCode ??
      type?.defaultWorkflow ??
      DEFAULT_COMPANY_WORKFLOW_CODE;

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
        legalNameSnapshot: dto.legalRepresentativeName,
        legalIdSnapshot: dto.legalRepresentativeCode,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        contactAddress: dto.contactAddress,
        homepageUrl: dto.homepageUrl,
        registrationNumber: dto.registrationNumber,
        unifiedSocialCreditCode: dto.unifiedSocialCreditCode,
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
              },
              {
                userId,
                role: CompanyMemberRole.LEGAL_PERSON,
                title: '法定代表人',
                isPrimary: true,
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

  async adminExecuteAction(
    companyId: string,
    actorId: string,
    dto: CompanyActionDto,
  ) {
    const company = await this.findCompanyOrThrow(companyId);
    if (!company.workflowInstanceId) {
      throw new BadRequestException('该公司暂未关联流程实例');
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
      throw new ForbiddenException('只有公司持有者或法人可以编辑');
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
      throw new BadRequestException('未找到对应的公司类型');
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
      throw new BadRequestException('未找到对应的行业分类');
    }
    return industry;
  }

  private async findCompanyOrThrow(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: companyInclude,
    });
    if (!company) {
      throw new NotFoundException('找不到对应的公司');
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

  private toJsonValue(value: unknown) {
    return value as unknown as Prisma.InputJsonValue;
  }
}
