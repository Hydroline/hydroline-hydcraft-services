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
  recommendationScore?: number | null
  highlighted?: boolean | null
  lastActiveAt?: string | null
  approvedAt?: string | null
  type?: CompanyType | null
  industry?: CompanyIndustry | null
  members: CompanyMember[]
  owners: CompanyMember[]
  legalPerson?: CompanyMember | null
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
  owners: CompanyMember[]
  recommendationScore?: number | null
  lastActiveAt?: string | null
  approvedAt?: string | null
}

export interface CompanyMeta {
  industries: CompanyIndustry[]
  types: CompanyType[]
  memberWriteRoles: CompanyMemberRole[]
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
  legalRepresentativeName?: string
  legalRepresentativeCode?: string
  contactEmail?: string
  contactPhone?: string
  contactAddress?: string
  homepageUrl?: string
  registrationNumber?: string
  unifiedSocialCreditCode?: string
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
