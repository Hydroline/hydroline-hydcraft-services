export type CompanyStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'NEEDS_REVISION'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'REJECTED'
  | 'ARCHIVED'

export type CompanyVisibility = 'PUBLIC' | 'PRIVATE' | 'INTERNAL'

export type CompanyMemberRole =
  | 'OWNER'
  | 'LEGAL_PERSON'
  | 'EXECUTIVE'
  | 'MANAGER'
  | 'MEMBER'
  | 'AUDITOR'

export interface CompanyIndustry {
  id: string
  code: string
  name: string
  description?: string | null
  icon?: string | null
  color?: string | null
}

export interface CompanyType {
  id: string
  code: string
  name: string
  description?: string | null
  category?: string | null
}

export interface CompanyPosition {
  code: string
  name: string
  description?: string | null
  role: CompanyMemberRole
}

export interface CompanyMemberUserRef {
  id: string
  name?: string | null
  email?: string | null
  displayName?: string | null
}

export interface CompanyMember {
  id: string
  role: CompanyMemberRole
  title?: string | null
  isPrimary: boolean
  user?: CompanyMemberUserRef | null
  position?: CompanyPosition | null
}

export interface CompanyWorkflowInfo {
  id: string
  state: string
  definitionCode: string
  definitionName?: string | null
}

export interface CompanyWorkflowActionOption {
  key: string
  label: string
  roles?: string[]
}

export interface CompanyPolicy {
  id: string
  title: string
  summary?: string | null
  status: string
  version: number
  updatedAt: string
}

export interface CompanyAuditRecord {
  id: string
  actionKey: string
  actionLabel?: string | null
  resultState?: string | null
  comment?: string | null
  payload?: Record<string, unknown> | null
  createdAt: string
}

export interface CompanyApplication {
  id: string
  status: string
  submittedAt: string
  resolvedAt?: string | null
}

export type CompanyApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_CHANGES'
  | 'APPROVED'
  | 'REJECTED'
  | 'ARCHIVED'

export interface ApplicationWorkflowDefinitionRef {
  id: string
  code: string
  name?: string | null
}

export interface CompanyWorkflowInstanceRef {
  id: string
  definition?: ApplicationWorkflowDefinitionRef | null
}

export interface AdminCompanyApplicationEntry {
  id: string
  status: CompanyApplicationStatus
  submittedAt: string
  resolvedAt?: string | null
  notes?: string | null
  rejectReason?: string | null
  company?: {
    id: string
    name: string
    slug: string
    type?: CompanyType | null
    industry?: CompanyIndustry | null
    status?: CompanyStatus | null
    workflowState?: string | null
  } | null
  applicant: {
    id: string
    name?: string | null
    email?: string | null
    profile?: {
      displayName?: string | null
    } | null
  }
  workflowInstance?: CompanyWorkflowInstanceRef | null
}

export interface CompanyPermissions {
  canEdit: boolean
  canManageMembers: boolean
}

export interface CompanyModel {
  id: string
  name: string
  slug: string
  summary?: string | null
  description?: string | null
  status: CompanyStatus
  visibility: CompanyVisibility
  category?: string | null
  isIndividualBusiness?: boolean
  recommendationScore?: number | null
  highlighted?: boolean | null
  lastActiveAt?: string | null
  approvedAt?: string | null
  type?: CompanyType | null
  industry?: CompanyIndustry | null
  members: CompanyMember[]
  owners: CompanyMember[]
  legalPerson?: CompanyMember | null
  legalRepresentative?: CompanyMemberUserRef | null
  policies: CompanyPolicy[]
  auditTrail: CompanyAuditRecord[]
  applications: CompanyApplication[]
  workflow: CompanyWorkflowInfo | null
  availableActions: CompanyWorkflowActionOption[]
  contactEmail?: string | null
  contactPhone?: string | null
  contactAddress?: string | null
  homepageUrl?: string | null
  permissions: CompanyPermissions
}

export interface CompanyRecommendation {
  id: string
  name: string
  slug: string
  summary?: string | null
  status: CompanyStatus
  type?: CompanyType | null
  industry?: CompanyIndustry | null
  legalPerson?: CompanyMember | null
  legalRepresentative?: CompanyMemberUserRef | null
  owners: CompanyMember[]
  recommendationScore?: number | null
  lastActiveAt?: string | null
  approvedAt?: string | null
}

export interface CompanyMeta {
  industries: CompanyIndustry[]
  types: CompanyType[]
  memberWriteRoles: CompanyMemberRole[]
  positions: CompanyPosition[]
}

export interface CompanyDashboardStats {
  companyCount: number
  individualBusinessCount: number
  memberCount: number
}

export interface CompanyDailyRegistration {
  date: string
  total: number
  individual: number
}

export interface AdminCreateCompanyPayload {
  name: string
  summary?: string
  description?: string
  typeId?: string
  industryId?: string
  isIndividualBusiness?: boolean
  legalRepresentativeId?: string
  category?: string
  status?: CompanyStatus
  visibility?: CompanyVisibility
}

export interface CreateCompanyApplicationPayload {
  name: string
  summary?: string
  description?: string
  typeId?: string
  typeCode?: string
  industryId?: string
  industryCode?: string
  category?: string
  isIndividualBusiness?: boolean
  legalRepresentativeId?: string
}

export interface UpdateCompanyPayload {
  summary?: string
  description?: string
  contactEmail?: string
  contactPhone?: string
  contactAddress?: string
  homepageUrl?: string
  industryId?: string
  industryCode?: string
  extra?: Record<string, unknown>
}

export interface CompanyMemberInvitePayload {
  userId: string
  role?: CompanyMemberRole
  title?: string
  positionCode?: string
}

export interface CompanyMemberJoinPayload {
  title?: string
  positionCode?: string
}
