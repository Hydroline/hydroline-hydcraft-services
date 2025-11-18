export function resolveProviderIcon(type?: string) {
  switch ((type ?? '').toUpperCase()) {
    case 'MICROSOFT':
      return 'logos:microsoft-icon'
    case 'GOOGLE':
      return 'logos:google-icon'
    default:
      return 'i-lucide-plug'
  }
}

export function resolveProviderAccent(type?: string) {
  switch ((type ?? '').toUpperCase()) {
    case 'MICROSOFT':
      return 'text-sky-600'
    case 'GOOGLE':
      return 'text-red-500'
    default:
      return 'text-slate-500'
  }
}
