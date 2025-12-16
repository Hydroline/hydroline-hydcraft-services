export function getTimezones(): string[] {
  // Prefer native list if available
  // @ts-ignore
  if (
    typeof Intl !== 'undefined' &&
    typeof (Intl as any).supportedValuesOf === 'function'
  ) {
    try {
      // @ts-ignore
      const values = (Intl as any).supportedValuesOf('timeZone') as string[]
      if (Array.isArray(values) && values.length) return values
    } catch {
      // ignore
    }
  }
  // Fallback minimal list
  return ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei', 'UTC']
}
