const FALLBACK_TITLE = '未命名线路'

type NullableString = string | null | undefined

function normalizeSegment(value: NullableString): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

export interface ParsedRouteName {
  title: string
  subtitle: string | null
  badge: string | null
}

/**
 * Parses a raw MTR route name string in the format
 * "中文名|英文名||额外说明" into structured pieces.
 */
export function parseRouteName(raw: NullableString): ParsedRouteName {
  if (!raw) {
    return { title: FALLBACK_TITLE, subtitle: null, badge: null }
  }

  const [nameBlock = '', badgeRaw] = raw.split('||')
  const [primaryRaw, secondaryRaw] = nameBlock.split('|')

  const title = normalizeSegment(primaryRaw) ?? FALLBACK_TITLE
  const subtitle = normalizeSegment(secondaryRaw)
  const badge = normalizeSegment(badgeRaw)

  return { title, subtitle, badge }
}
