export interface NormalizedLuckpermsGroup {
  name: string
  displayName: string | null
  server: string | null
  world: string | null
  expiry: number | null
  contexts: Record<string, string> | null
  detail: string | null
}

export interface NormalizedLuckpermsBinding {
  username: string
  realname: string | null
  boundAt: string | Date | null
  primaryGroup: string | null
  primaryGroupDisplayName: string | null
  groups: NormalizedLuckpermsGroup[]
  luckpermsUsername: string | null
  luckpermsUuid: string | null
  synced: boolean
}

export function normalizeLuckpermsBinding(
  binding: Record<string, unknown>,
  options: { luckperms?: Record<string, unknown> | null } = {},
): NormalizedLuckpermsBinding {
  const authmeUsername = binding['authmeUsername']
  const fallbackUsername = binding['username']
  const username = resolveUsername(authmeUsername ?? fallbackUsername)

  const rawBindingRealname =
    binding['authmeRealname'] ?? binding['realname'] ?? null
  const bindingRealname =
    typeof rawBindingRealname === 'string' ? rawBindingRealname.trim() : null

  const luckpermsEntry = options.luckperms ?? null
  const rawLuckpermsUsername = luckpermsEntry
    ? (luckpermsEntry['username'] ?? null)
    : null
  const lpUsernameValue = resolveUsername(rawLuckpermsUsername)
  const luckpermsUsername = lpUsernameValue.length > 0 ? lpUsernameValue : null

  const resolvedRealname =
    bindingRealname && bindingRealname.length > 0
      ? bindingRealname
      : luckpermsUsername

  const primaryGroup =
    typeof luckpermsEntry?.['primaryGroup'] === 'string'
      ? (luckpermsEntry['primaryGroup'] as string)
      : null
  const primaryGroupDisplayName =
    typeof luckpermsEntry?.['primaryGroupDisplayName'] === 'string'
      ? normalizeNullableString(luckpermsEntry['primaryGroupDisplayName'])
      : null

  const groups = normalizeLuckpermsGroups(luckpermsEntry?.['groups'] ?? [])

  const uuid = resolveNullableUuid(luckpermsEntry?.['uuid'] ?? null)

  const boundAtRaw = binding['boundAt'] ?? binding['bound_at'] ?? null
  const boundAt =
    boundAtRaw instanceof Date || typeof boundAtRaw === 'string'
      ? (boundAtRaw as Date | string)
      : null

  return {
    username,
    realname: resolvedRealname ?? null,
    boundAt,
    primaryGroup,
    primaryGroupDisplayName,
    groups,
    luckpermsUsername,
    luckpermsUuid: uuid,
    synced: Boolean(luckpermsEntry?.['synced'] ?? luckpermsEntry),
  }
}

export function normalizeLuckpermsBindings(
  raw: unknown,
  options: {
    luckpermsMap?: Map<string, Record<string, unknown> | null | undefined>
  } = {},
): NormalizedLuckpermsBinding[] {
  if (!Array.isArray(raw)) return []
  const map =
    options.luckpermsMap ??
    new Map<string, Record<string, unknown> | null | undefined>()
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const key = usernameKey(
        entry['authmeUsername'] ??
          entry['username'] ??
          entry['authme_username'] ??
          null,
      )
      const luckperms = key ? (map.get(key) ?? null) : null
      return normalizeLuckpermsBinding(entry, { luckperms })
    })
}

export function normalizeLuckpermsGroups(
  raw: unknown,
): NormalizedLuckpermsGroup[] {
  if (!Array.isArray(raw)) return []
  const result: NormalizedLuckpermsGroup[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const groupRaw = record['group']
    let name: string | null = null
    if (typeof groupRaw === 'string') {
      const trimmed = groupRaw.trim()
      if (trimmed) name = trimmed
    } else if (groupRaw !== null && groupRaw !== undefined) {
      const converted = String(groupRaw).trim()
      if (converted) name = converted
    }
    if (!name) continue

    const server = normalizeNullableString(record['server'])
    const world = normalizeNullableString(record['world'])
    const contexts = normalizeContexts(record['contexts'] ?? null)
    const expiryValue = record['expiry'] ?? null
    const expiry = normalizeExpiry(expiryValue)
    const displayName = normalizeNullableString(
      record['displayName'] ?? record['label'],
    )

    result.push({
      name,
      displayName,
      server,
      world,
      contexts,
      expiry,
      detail: renderMembershipDetail({ server, world, contexts, expiry }),
    })
  }
  return result
}

function resolveUsername(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : ''
  }
  if (typeof value === 'number') {
    const converted = String(value).trim()
    return converted.length > 0 ? converted : ''
  }
  return ''
}

function resolveNullableUuid(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

function usernameKey(value: unknown): string {
  return resolveUsername(value).toLowerCase()
}

function normalizeNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return String(value)
}

function normalizeContexts(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const contexts: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    const stringKey = String(key)
    if (!stringKey) continue
    if (typeof raw === 'string') {
      contexts[stringKey] = raw
    } else if (raw !== null && raw !== undefined) {
      contexts[stringKey] = String(raw)
    }
  }
  return Object.keys(contexts).length ? contexts : null
}

function normalizeExpiry(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function renderMembershipDetail(options: {
  server: string | null
  world: string | null
  contexts: Record<string, string> | null
  expiry: number | null
}): string | null {
  const parts: string[] = []
  if (options.server && options.server.toLowerCase() !== 'global') {
    parts.push(`服务器: ${options.server}`)
  }
  if (options.world && options.world.toLowerCase() !== 'global') {
    parts.push(`世界: ${options.world}`)
  }
  if (options.expiry && Number.isFinite(options.expiry) && options.expiry > 0) {
    const epochMs =
      options.expiry < 10_000_000_000 ? options.expiry * 1000 : options.expiry
    parts.push(`过期: ${new Date(epochMs).toLocaleString()}`)
  }
  if (options.contexts) {
    const ctx = Object.entries(options.contexts)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')
    if (ctx) {
      parts.push(`上下文: ${ctx}`)
    }
  }
  return parts.length ? parts.join(' · ') : null
}
