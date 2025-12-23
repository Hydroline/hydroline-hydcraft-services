import {
  CompanyApplicationStatus,
  CompanyMemberRole,
  CompanyStatus,
} from '@prisma/client';
import { UpsertWorkflowDefinitionDto } from '../workflow/dto/upsert-workflow-definition.dto';

export const DEFAULT_COMPANY_WORKFLOW_CODE = 'company.registration';
export const DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE =
  'company.deregistration';

export const DEFAULT_COMPANY_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_WORKFLOW_CODE,
    name: '公司注册审批流程',
    description: '玩家提交工商主体申请，管理员审核后正式生效',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          companyStatus: CompanyStatus.PENDING_REVIEW,
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '直接驳回',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          companyStatus: CompanyStatus.UNDER_REVIEW,
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准并入库',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'request_changes',
            label: '要求补件',
            to: 'needs_revision',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'needs_revision',
        label: '待补件',
        business: {
          companyStatus: CompanyStatus.NEEDS_REVISION,
          applicationStatus: CompanyApplicationStatus.NEEDS_CHANGES,
        },
        actions: [
          {
            key: 'resubmit',
            label: '重新提交',
            to: 'under_review',
            roles: ['OWNER', 'LEGAL_PERSON'],
          },
          {
            key: 'withdraw',
            label: '撤回申请',
            to: 'rejected',
            roles: ['OWNER', 'LEGAL_PERSON'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已注册',
        final: true,
        business: {
          companyStatus: CompanyStatus.ACTIVE,
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [
          {
            key: 'suspend',
            label: '暂停主体',
            to: 'suspended',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'suspended',
        label: '暂停营业',
        business: {
          companyStatus: CompanyStatus.SUSPENDED,
          applicationStatus: CompanyApplicationStatus.ARCHIVED,
        },
        actions: [
          {
            key: 'reactivate',
            label: '重新激活',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'archive',
            label: '归档',
            to: 'archived',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'archived',
        label: '注销',
        final: true,
        business: {
          companyStatus: CompanyStatus.ARCHIVED,
          applicationStatus: CompanyApplicationStatus.ARCHIVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          companyStatus: CompanyStatus.REJECTED,
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [
          {
            key: 'reopen',
            label: '重新审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
        ],
      },
    ],
  };

export const DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_DEFINITION: UpsertWorkflowDefinitionDto =
  {
    code: DEFAULT_COMPANY_DEREGISTRATION_WORKFLOW_CODE,
    name: '公司注销审批流程',
    description: '公司发起注销申请，审核通过后完成注销',
    category: 'company',
    states: [
      {
        key: 'submitted',
        label: '已提交',
        business: {
          applicationStatus: CompanyApplicationStatus.SUBMITTED,
        },
        actions: [
          {
            key: 'route_to_review',
            label: '进入审核',
            to: 'under_review',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'under_review',
        label: '审核中',
        business: {
          applicationStatus: CompanyApplicationStatus.UNDER_REVIEW,
        },
        actions: [
          {
            key: 'approve',
            label: '批准注销',
            to: 'approved',
            roles: ['ADMIN'],
          },
          {
            key: 'reject',
            label: '驳回申请',
            to: 'rejected',
            roles: ['ADMIN'],
          },
        ],
      },
      {
        key: 'approved',
        label: '已注销',
        final: true,
        business: {
          companyStatus: CompanyStatus.ARCHIVED,
          applicationStatus: CompanyApplicationStatus.APPROVED,
        },
        actions: [],
      },
      {
        key: 'rejected',
        label: '已驳回',
        final: true,
        business: {
          applicationStatus: CompanyApplicationStatus.REJECTED,
        },
        actions: [],
      },
    ],
  };

export const COMPANY_MEMBER_WRITE_ROLES: CompanyMemberRole[] = [
  CompanyMemberRole.OWNER,
  CompanyMemberRole.LEGAL_PERSON,
  CompanyMemberRole.EXECUTIVE,
];
