export interface UserBindingHistoryEntry {
  id: string
  action: string
  reason: string | null
  createdAt: string
  payload?: unknown
  binding?: {
    id: string
    authmeUsername: string
    authmeRealname: string | null
    authmeUuid: string | null
    status?: string | null
  } | null
  operator?: {
    id: string
    email: string
    profile?: {
      displayName: string | null
    } | null
  } | null
}
