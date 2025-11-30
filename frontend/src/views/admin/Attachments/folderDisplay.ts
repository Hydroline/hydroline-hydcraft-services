const SPECIAL_FOLDERS = {
  useravatar: '用户头像',
  hero: '首页背景图',
}

function normalizePath(input: string) {
  return input.replace(/^\/+|\/+$/g, '').toLowerCase()
}

export function formatFolderPathDisplay(path?: string | null): string | null {
  if (!path) return null
  const trimmed = path.trim()
  if (!trimmed) return null
  const normalized = normalizePath(trimmed)

  for (const [folderKey, folderLabel] of Object.entries(SPECIAL_FOLDERS)) {
    if (normalized === folderKey) {
      return folderLabel
    }
    if (normalized.startsWith(`${folderKey}/`)) {
      const slashIndex = trimmed.indexOf('/')
      const suffix = slashIndex >= 0 ? trimmed.slice(slashIndex + 1) : ''
      return suffix ? `${folderLabel}/${suffix}` : folderLabel
    }
  }

  return trimmed
}

export function formatFolderDisplay(folder?: {
  path?: string | null
  name?: string | null
}): string {
  if (!folder) {
    return '根目录'
  }
  const pathLabel = formatFolderPathDisplay(folder.path)
  if (pathLabel) {
    return pathLabel
  }
  const name = folder.name?.trim()
  if (name) {
    const aliasFromName = formatFolderPathDisplay(name)
    return aliasFromName ?? name
  }
  return '未知目录'
}
