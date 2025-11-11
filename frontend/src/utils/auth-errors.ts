const STATIC_TRANSLATIONS: Record<string, string> = {
  'Invalid email or password': '邮箱或密码错误',
  'Invalid credentials': '邮箱或密码错误',
  'Email already exists': '该邮箱已被注册',
  'Email already registered': '该邮箱已被注册',
  'User already exists': '账户已存在',
  'Missing email': '请填写邮箱地址',
  'Missing password': '请填写密码',
  'Missing credentials': '请填写登录信息',
  'Password is required': '请填写密码',
  'Email is required': '请填写邮箱地址',
  'Email is invalid': '邮箱格式不正确',
  'Invalid email': '邮箱格式不正确',
  'Invalid password': '密码不正确',
  'Account locked': '账户已被锁定，请联系管理员',
  'Too many requests': '尝试次数过多，请稍后再试',
  'Too many failed attempts': '尝试次数过多，请稍后再试',
  'Password must be at least 8 characters long': '密码长度至少 8 位',
  'Password must be at least 8 characters': '密码长度至少 8 位',
  'Password must be at least eight characters long': '密码长度至少 8 位',
  'Password must contain at least 8 characters': '密码长度至少 8 位',
  'Password must contain at least one number': '密码需包含至少一个数字',
  'Password must contain at least one uppercase letter':
    '密码需包含至少一个大写字母',
  'Password must contain at least one lowercase letter':
    '密码需包含至少一个小写字母',
  'Password must contain at least one special character':
    '密码需包含至少一个特殊符号',
  'Password confirmation does not match': '两次输入的密码不一致',
  'Passwords do not match': '两次输入的密码不一致',
  'Invalid AuthMe credentials': 'AuthMe 账号或密码不正确',
  'AuthMe account not found': '未找到对应的 AuthMe 账号',
  'AuthMe login is disabled': '当前未开放 AuthMe 登录',
  'AuthMe register is disabled': '当前未开放 AuthMe 注册',
}

const PASSWORD_TOO_SHORT_RE = /password[^a-z]*least[^0-9]*8/i
const EMAIL_INVALID_RE = /invalid\s+email/i
const EMAIL_IN_USE_RE = /(email|account)[^a-z]*(exists|already)/i
const TOO_MANY_REQUESTS_RE = /too\s+many/i

export function translateAuthErrorMessage(message: unknown): string {
  if (typeof message !== 'string') {
    return '请求失败，请稍后重试'
  }
  const trimmed = message.trim()
  if (!trimmed) {
    return '请求失败，请稍后重试'
  }
  const direct = STATIC_TRANSLATIONS[trimmed]
  if (direct) {
    return direct
  }
  if (PASSWORD_TOO_SHORT_RE.test(trimmed)) {
    return '密码长度至少 8 位'
  }
  if (EMAIL_INVALID_RE.test(trimmed)) {
    return '邮箱格式不正确'
  }
  if (EMAIL_IN_USE_RE.test(trimmed)) {
    return '该邮箱已被注册'
  }
  if (TOO_MANY_REQUESTS_RE.test(trimmed)) {
    return '尝试次数过多，请稍后再试'
  }
  return trimmed
}
